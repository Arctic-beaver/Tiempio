use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Instant;

use rtrb::{Consumer, PopError, Producer, PushError};
use tiempio_engine_core::{BassPatchV1, EngineKernel, PreparedPlan, TransportState};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_BLOCK_FRAMES;
use tiempio_engine_synth::BassVoicePool;

pub const CONTROL_QUEUE_CAPACITY: usize = 128;
pub const EVENT_QUEUE_CAPACITY: usize = 256;
const MAX_COMMANDS_PER_BLOCK: usize = 64;
const SNAPSHOTS_PER_SECOND: u64 = 30;

#[derive(Debug)]
pub enum RealtimeCommand {
    PublishPlan(PreparedPlan),
    Play(u64),
    Stop,
    Seek(u64),
    SetLoop {
        enabled: bool,
        start_tick: u64,
        end_tick: u64,
    },
    NoteOn {
        identifier: u64,
        pitch: u8,
        velocity: u8,
        patch: BassPatchV1,
    },
    NoteOff(u64),
    Shutdown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RealtimeDiagnostic {
    ControlFailure,
    NonFiniteOutput,
    RenderOverload,
}

#[derive(Clone, Copy, Debug)]
pub enum RealtimeEvent {
    PlanAcknowledged {
        project_revision: u64,
        plan_generation: u64,
    },
    Transport {
        playing: bool,
        project_revision: u64,
        sample_position: u64,
        tick: f64,
    },
    Meter {
        left_peak: f64,
        right_peak: f64,
    },
    RealtimeDiagnostic(RealtimeDiagnostic),
}

#[derive(Debug, Default)]
pub struct StreamSignals {
    pub callback_count: AtomicU64,
    pub active_voices: AtomicU64,
    pub project_revision: AtomicU64,
    pub output_signal_observed: AtomicBool,
    pub render_overloads: AtomicU64,
    pub stream_error: AtomicBool,
    pub shutdown: AtomicBool,
    pub last_block_frames: AtomicU32,
}

impl StreamSignals {
    pub fn reset(&self) {
        self.callback_count.store(0, Ordering::Release);
        self.active_voices.store(0, Ordering::Release);
        self.project_revision.store(0, Ordering::Release);
        self.output_signal_observed.store(false, Ordering::Release);
        self.render_overloads.store(0, Ordering::Release);
        self.stream_error.store(false, Ordering::Release);
        self.shutdown.store(false, Ordering::Release);
        self.last_block_frames.store(0, Ordering::Release);
    }
}

pub struct RealtimeEngine {
    engine: EngineKernel<BassVoicePool>,
    sample_rate: u32,
    command_rx: Consumer<RealtimeCommand>,
    retired_tx: Producer<PreparedPlan>,
    event_tx: Producer<RealtimeEvent>,
    signals: Arc<StreamSignals>,
    scratch: Box<[StereoFrame]>,
    pending_reclaim: Option<PreparedPlan>,
    pending_critical_event: Option<RealtimeEvent>,
    frames_since_snapshot: u64,
    last_non_finite_replacements: u64,
}

impl RealtimeEngine {
    #[must_use]
    pub fn new(
        engine: EngineKernel<BassVoicePool>,
        sample_rate: u32,
        command_rx: Consumer<RealtimeCommand>,
        retired_tx: Producer<PreparedPlan>,
        event_tx: Producer<RealtimeEvent>,
        signals: Arc<StreamSignals>,
    ) -> Self {
        Self {
            engine,
            sample_rate,
            command_rx,
            retired_tx,
            event_tx,
            signals,
            scratch: vec![StereoFrame::default(); ENGINE_PROTOCOL_MAX_BLOCK_FRAMES]
                .into_boxed_slice(),
            pending_reclaim: None,
            pending_critical_event: None,
            frames_since_snapshot: 0,
            last_non_finite_replacements: 0,
        }
    }

    pub fn render_f32_channels(&mut self, output: &mut [f32], channels: u16) {
        let channels = usize::from(channels);
        if channels == 0 {
            output.fill(0.0);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(0.0);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_f32_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(0.0);
        }
    }

    pub fn render_i16_channels(&mut self, output: &mut [i16], channels: u16) {
        let channels = usize::from(channels);
        if channels == 0 {
            output.fill(0);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(0);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_i16_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(0);
        }
    }

    pub fn render_u16_channels(&mut self, output: &mut [u16], channels: u16) {
        let channels = usize::from(channels);
        let silence = u16::MAX / 2 + 1;
        if channels == 0 {
            output.fill(silence);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(silence);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_u16_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(silence);
        }
    }

    fn render_frames(&mut self, frame_count: usize) -> bool {
        let started = Instant::now();
        self.flush_pending();
        self.apply_commands();
        if frame_count == 0 || frame_count > ENGINE_PROTOCOL_MAX_BLOCK_FRAMES {
            self.record_overload();
            return false;
        }
        self.engine.render_block(&mut self.scratch[..frame_count]);
        self.publish_acknowledgement();
        self.publish_observations(frame_count);
        let deadline =
            f64::from(u32::try_from(frame_count).unwrap_or(u32::MAX)) / f64::from(self.sample_rate);
        if started.elapsed().as_secs_f64() > deadline {
            self.record_overload();
        }
        true
    }

    fn flush_pending(&mut self) {
        if let Some(plan) = self.pending_reclaim.take() {
            if let Err(PushError::Full(plan)) = self.retired_tx.push(plan) {
                self.pending_reclaim = Some(plan);
            }
        }
        if let Some(event) = self.pending_critical_event.take() {
            if let Err(PushError::Full(event)) = self.event_tx.push(event) {
                self.pending_critical_event = Some(event);
            }
        }
    }

    fn apply_commands(&mut self) {
        if self.pending_reclaim.is_some() || self.pending_critical_event.is_some() {
            return;
        }
        for _ in 0..MAX_COMMANDS_PER_BLOCK {
            let command = match self.command_rx.pop() {
                Ok(command) => command,
                Err(PopError::Empty) => break,
            };
            let result = match command {
                RealtimeCommand::PublishPlan(plan) => {
                    match self.engine.publish_plan_reclaiming(plan) {
                        Ok(retired) => {
                            self.pending_reclaim = retired;
                            Ok(())
                        }
                        Err(error) => Err(error),
                    }
                }
                RealtimeCommand::Play(tick) => self.engine.play(tick),
                RealtimeCommand::Stop => {
                    self.engine.stop();
                    Ok(())
                }
                RealtimeCommand::Seek(tick) => self.engine.seek(tick),
                RealtimeCommand::SetLoop {
                    enabled,
                    start_tick,
                    end_tick,
                } => self.engine.set_loop(enabled, start_tick, end_tick),
                RealtimeCommand::NoteOn {
                    identifier,
                    pitch,
                    velocity,
                    patch,
                } => {
                    self.engine
                        .note_on_audition(identifier, pitch, velocity, &patch);
                    Ok(())
                }
                RealtimeCommand::NoteOff(identifier) => {
                    self.engine.note_off_audition(identifier);
                    Ok(())
                }
                RealtimeCommand::Shutdown => {
                    self.engine.shutdown();
                    self.signals.shutdown.store(true, Ordering::Release);
                    Ok(())
                }
            };
            if result.is_err() {
                let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
                    RealtimeDiagnostic::ControlFailure,
                ));
            }
            if self.pending_reclaim.is_some() {
                break;
            }
        }
    }

    fn publish_acknowledgement(&mut self) {
        let Some(acknowledgement) = self.engine.take_plan_acknowledgement() else {
            return;
        };
        self.signals
            .project_revision
            .store(acknowledgement.project_revision, Ordering::Release);
        let event = RealtimeEvent::PlanAcknowledged {
            project_revision: acknowledgement.project_revision,
            plan_generation: acknowledgement.plan_generation,
        };
        if let Err(PushError::Full(event)) = self.event_tx.push(event) {
            self.pending_critical_event = Some(event);
        }
    }

    fn publish_observations(&mut self, frame_count: usize) {
        self.signals.callback_count.fetch_add(1, Ordering::AcqRel);
        self.signals.last_block_frames.store(
            u32::try_from(frame_count).unwrap_or(u32::MAX),
            Ordering::Release,
        );
        let health = self.engine.health_snapshot();
        self.signals.active_voices.store(
            u64::try_from(health.active_voices).unwrap_or(u64::MAX),
            Ordering::Release,
        );
        let mut left_peak = 0.0_f64;
        let mut right_peak = 0.0_f64;
        for frame in &self.scratch[..frame_count] {
            left_peak = left_peak.max(frame.left.abs());
            right_peak = right_peak.max(frame.right.abs());
        }
        if left_peak > f64::EPSILON || right_peak > f64::EPSILON {
            self.signals
                .output_signal_observed
                .store(true, Ordering::Release);
        }
        if health.non_finite_replacements > self.last_non_finite_replacements {
            self.last_non_finite_replacements = health.non_finite_replacements;
            let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
                RealtimeDiagnostic::NonFiniteOutput,
            ));
        }
        self.frames_since_snapshot = self
            .frames_since_snapshot
            .saturating_add(u64::try_from(frame_count).unwrap_or(u64::MAX));
        let snapshot_interval = u64::from(self.sample_rate) / SNAPSHOTS_PER_SECOND;
        if self.frames_since_snapshot < snapshot_interval.max(1) {
            return;
        }
        self.frames_since_snapshot = 0;
        let _ = self.event_tx.push(RealtimeEvent::Meter {
            left_peak: left_peak.clamp(0.0, 1.0),
            right_peak: right_peak.clamp(0.0, 1.0),
        });
        let revision = self.signals.project_revision.load(Ordering::Acquire);
        if revision > 0 {
            let _ = self.event_tx.push(RealtimeEvent::Transport {
                playing: self.engine.transport_state() == TransportState::Playing,
                project_revision: revision,
                sample_position: self.engine.transport_sample_position(),
                tick: wire_tick(self.engine.transport_tick().unwrap_or(0)),
            });
        }
    }

    fn record_overload(&mut self) {
        self.signals.render_overloads.fetch_add(1, Ordering::AcqRel);
        let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
            RealtimeDiagnostic::RenderOverload,
        ));
    }
}

fn write_f32_frame(samples: &mut [f32], left: f64, right: f64) {
    if samples.len() == 1 {
        samples[0] = float_f32((left + right) * 0.5);
        return;
    }
    samples.fill(0.0);
    samples[0] = float_f32(left);
    samples[1] = float_f32(right);
}

fn write_i16_frame(samples: &mut [i16], left: f64, right: f64) {
    if samples.len() == 1 {
        samples[0] = signed_i16((left + right) * 0.5);
        return;
    }
    samples.fill(0);
    samples[0] = signed_i16(left);
    samples[1] = signed_i16(right);
}

fn write_u16_frame(samples: &mut [u16], left: f64, right: f64) {
    let silence = u16::MAX / 2 + 1;
    if samples.len() == 1 {
        samples[0] = unsigned_u16((left + right) * 0.5);
        return;
    }
    samples.fill(silence);
    samples[0] = unsigned_u16(left);
    samples[1] = unsigned_u16(right);
}

#[allow(clippy::cast_possible_truncation)]
fn signed_i16(sample: f64) -> i16 {
    let bounded = sample.clamp(-1.0, 1.0);
    if bounded <= -1.0 {
        i16::MIN
    } else {
        (bounded * f64::from(i16::MAX)).round() as i16
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn unsigned_u16(sample: f64) -> u16 {
    let normalized = sample.clamp(-1.0, 1.0).mul_add(0.5, 0.5);
    (normalized * f64::from(u16::MAX)).round() as u16
}

#[allow(clippy::cast_possible_truncation)]
fn float_f32(sample: f64) -> f32 {
    sample.clamp(-1.0, 1.0) as f32
}

#[allow(clippy::cast_precision_loss)]
fn wire_tick(tick: u64) -> f64 {
    tick as f64
}

#[must_use]
pub fn create_engine(sample_rate: u32) -> EngineKernel<BassVoicePool> {
    let configuration = DspConfiguration::new(sample_rate, ENGINE_PROTOCOL_MAX_BLOCK_FRAMES)
        .expect("protocol sample rate and maximum block size are valid");
    EngineKernel::new(configuration, BassVoicePool::new(configuration))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_supported_sample_formats_with_defined_silence_and_extrema() {
        assert_eq!(signed_i16(-1.0), i16::MIN);
        assert_eq!(signed_i16(0.0), 0);
        assert_eq!(signed_i16(1.0), i16::MAX);
        assert_eq!(unsigned_u16(-1.0), u16::MIN);
        assert_eq!(unsigned_u16(0.0), 32_768);
        assert_eq!(unsigned_u16(1.0), u16::MAX);
    }

    #[test]
    fn maps_logical_stereo_to_mono_stereo_and_multichannel_frames() {
        let mut mono = [0.0_f32; 1];
        write_f32_frame(&mut mono, 0.75, 0.25);
        assert!((mono[0] - 0.5).abs() < f32::EPSILON);

        let mut stereo = [0_i16; 2];
        write_i16_frame(&mut stereo, -1.0, 1.0);
        assert_eq!(stereo, [i16::MIN, i16::MAX]);

        let mut surround = [u16::MAX; 6];
        write_u16_frame(&mut surround, -1.0, 1.0);
        assert_eq!(surround[0], u16::MIN);
        assert_eq!(surround[1], u16::MAX);
        assert!(surround[2..].iter().all(|sample| *sample == 32_768));
    }
}
