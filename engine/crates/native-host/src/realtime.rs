use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Instant;

use rtrb::{Consumer, PopError, Producer, PushError};
use tiempio_engine_core::{BassPatchV1, EngineKernel, PreparedPlan, TransportState};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_protocol::{
    ENGINE_PROTOCOL_MAX_BLOCK_FRAMES, ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES,
    ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE, PreviewProgramPayload,
};
use tiempio_engine_synth::BassVoicePool;

pub const CONTROL_QUEUE_CAPACITY: usize = 128;
pub const EVENT_QUEUE_CAPACITY: usize = 256;
const MAX_COMMANDS_PER_BLOCK: usize = 64;
const SNAPSHOTS_PER_SECOND: u64 = 30;
const PREVIEW_IDENTITY_FLAG: u64 = 1_u64 << 63;
const PREVIEW_HASH_MASK: u64 = (1_u64 << 54) - 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreviewId {
    bytes: [u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES],
    len: u16,
}

impl PreviewId {
    pub fn new(value: &str) -> Option<Self> {
        let source = value.as_bytes();
        if source.is_empty() || source.len() > ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES {
            return None;
        }
        let mut bytes = [0_u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES];
        bytes[..source.len()].copy_from_slice(source);
        Some(Self {
            bytes,
            len: u16::try_from(source.len()).ok()?,
        })
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.bytes[..usize::from(self.len)])
            .expect("validated preview IDs are ASCII UTF-8")
    }
}

#[derive(Clone, Copy, Debug)]
struct PreviewAction {
    sample_offset: u64,
    event_index: u8,
    pitches: [u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE],
    pitch_count: u8,
    velocity: u8,
    active: bool,
}

#[derive(Debug)]
pub struct PreparedPreview {
    id: PreviewId,
    base_identifier: u64,
    duration_frames: u64,
    actions: Box<[PreviewAction]>,
    patch: BassPatchV1,
}

impl PreparedPreview {
    pub fn prepare(
        program: PreviewProgramPayload,
        sample_rate: u32,
        patch: BassPatchV1,
    ) -> Option<Self> {
        let id = PreviewId::new(&program.preview_id)?;
        let base_identifier = stable_preview_hash(&program.preview_id);
        let mut actions = Vec::with_capacity(program.events.len().saturating_mul(2));
        let mut duration_frames = 0_u64;
        for (event_index, event) in program.events.into_iter().enumerate() {
            let start = milliseconds_to_frames(event.offset_ms, sample_rate, false)?;
            let end_ms = event.offset_ms.checked_add(event.duration_ms)?;
            let end = milliseconds_to_frames(end_ms, sample_rate, true)?.max(start + 1);
            duration_frames = duration_frames.max(end);
            let mut pitches = [0_u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE];
            pitches[..event.pitches.len()].copy_from_slice(&event.pitches);
            let event_index = u8::try_from(event_index).ok()?;
            let pitch_count = u8::try_from(event.pitches.len()).ok()?;
            actions.push(PreviewAction {
                sample_offset: start,
                event_index,
                pitches,
                pitch_count,
                velocity: event.velocity,
                active: true,
            });
            actions.push(PreviewAction {
                sample_offset: end,
                event_index,
                pitches,
                pitch_count,
                velocity: event.velocity,
                active: false,
            });
        }
        actions.sort_by_key(|action| (action.sample_offset, action.active));
        Some(Self {
            id,
            base_identifier,
            duration_frames,
            actions: actions.into_boxed_slice(),
            patch,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PreviewEndReason {
    Completed,
    Canceled,
    Interrupted,
}

impl PreviewEndReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Canceled => "canceled",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Debug)]
pub enum RetiredRealtimeAllocation {
    Plan(PreparedPlan),
    Preview(PreparedPreview),
}

#[derive(Debug)]
struct ActivePreview {
    prepared: PreparedPreview,
    cursor: usize,
    position: u64,
}

fn milliseconds_to_frames(milliseconds: u32, sample_rate: u32, round_up: bool) -> Option<u64> {
    let numerator = u64::from(milliseconds).checked_mul(u64::from(sample_rate))?;
    Some(if round_up {
        numerator.checked_add(999)? / 1_000
    } else {
        numerator / 1_000
    })
}

fn stable_preview_hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    }) & PREVIEW_HASH_MASK
}

fn preview_voice_identifier(base: u64, event_index: u8, pitch_index: usize) -> u64 {
    PREVIEW_IDENTITY_FLAG
        | ((base & PREVIEW_HASH_MASK) << 9)
        | (u64::from(event_index) << 3)
        | u64::try_from(pitch_index).unwrap_or(0)
}

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
    SetMetronomeEnabled(bool),
    SetMetronomeVolume(f64),
    NoteOn {
        identifier: u64,
        pitch: u8,
        velocity: u8,
        patch: BassPatchV1,
    },
    NoteOff(u64),
    StartPreview(PreparedPreview),
    CancelPreview {
        preview_id: PreviewId,
        reason: PreviewEndReason,
    },
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
    PreviewStarted {
        preview_id: PreviewId,
        duration_frames: u64,
    },
    PreviewState {
        preview_id: PreviewId,
        pitches: [u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE],
        pitch_count: u8,
        active: bool,
        sample_position: u64,
    },
    PreviewEnded {
        preview_id: PreviewId,
        reason: PreviewEndReason,
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
    retired_tx: Producer<RetiredRealtimeAllocation>,
    event_tx: Producer<RealtimeEvent>,
    signals: Arc<StreamSignals>,
    scratch: Box<[StereoFrame]>,
    pending_reclaims: [Option<RetiredRealtimeAllocation>; 2],
    pending_critical_events: [Option<RealtimeEvent>; 4],
    active_preview: Option<ActivePreview>,
    frames_since_snapshot: u64,
    last_non_finite_replacements: u64,
}

impl RealtimeEngine {
    #[must_use]
    pub fn new(
        engine: EngineKernel<BassVoicePool>,
        sample_rate: u32,
        command_rx: Consumer<RealtimeCommand>,
        retired_tx: Producer<RetiredRealtimeAllocation>,
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
            pending_reclaims: [None, None],
            pending_critical_events: [None, None, None, None],
            active_preview: None,
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
        self.render_with_preview(frame_count);
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
        for slot in &mut self.pending_reclaims {
            let Some(allocation) = slot.take() else {
                continue;
            };
            if let Err(PushError::Full(allocation)) = self.retired_tx.push(allocation) {
                *slot = Some(allocation);
                break;
            }
        }
        for slot in &mut self.pending_critical_events {
            let Some(event) = slot.take() else {
                continue;
            };
            if let Err(PushError::Full(event)) = self.event_tx.push(event) {
                *slot = Some(event);
                break;
            }
        }
    }

    fn apply_commands(&mut self) {
        if self.has_pending_delivery() {
            return;
        }
        for _ in 0..MAX_COMMANDS_PER_BLOCK {
            let command = match self.command_rx.pop() {
                Ok(command) => command,
                Err(PopError::Empty) => break,
            };
            let result = match command {
                RealtimeCommand::PublishPlan(plan) => {
                    self.end_preview(PreviewEndReason::Interrupted);
                    match self.engine.publish_plan_reclaiming(plan) {
                        Ok(retired) => {
                            if let Some(retired) = retired {
                                self.retire(RetiredRealtimeAllocation::Plan(retired));
                            }
                            Ok(())
                        }
                        Err(error) => Err(error),
                    }
                }
                RealtimeCommand::Play(tick) => {
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.engine.play(tick)
                }
                RealtimeCommand::Stop => {
                    self.engine.stop();
                    Ok(())
                }
                RealtimeCommand::Seek(tick) => {
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.engine.seek(tick)
                }
                RealtimeCommand::SetLoop {
                    enabled,
                    start_tick,
                    end_tick,
                } => self.engine.set_loop(enabled, start_tick, end_tick),
                RealtimeCommand::SetMetronomeEnabled(enabled) => {
                    self.engine.set_metronome_enabled(enabled);
                    Ok(())
                }
                RealtimeCommand::SetMetronomeVolume(volume) => {
                    self.engine.set_metronome_volume(volume);
                    Ok(())
                }
                RealtimeCommand::NoteOn {
                    identifier,
                    pitch,
                    velocity,
                    patch,
                } => {
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.engine
                        .note_on_audition(identifier, pitch, velocity, &patch);
                    Ok(())
                }
                RealtimeCommand::NoteOff(identifier) => {
                    self.engine.note_off_audition(identifier);
                    Ok(())
                }
                RealtimeCommand::StartPreview(prepared) => {
                    self.start_preview(prepared);
                    Ok(())
                }
                RealtimeCommand::CancelPreview { preview_id, reason } => {
                    if self
                        .active_preview
                        .as_ref()
                        .is_some_and(|active| active.prepared.id == preview_id)
                    {
                        self.end_preview(reason);
                    }
                    Ok(())
                }
                RealtimeCommand::Shutdown => {
                    self.end_preview(PreviewEndReason::Interrupted);
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
            if self.has_pending_delivery() {
                break;
            }
        }
    }

    fn has_pending_delivery(&self) -> bool {
        self.pending_reclaims.iter().any(Option::is_some)
            || self.pending_critical_events.iter().any(Option::is_some)
    }

    fn render_with_preview(&mut self, frame_count: usize) {
        let mut rendered = 0_usize;
        while rendered < frame_count {
            self.apply_preview_actions();
            self.complete_preview_if_due();
            let remaining = frame_count - rendered;
            let chunk = self.active_preview.as_ref().map_or(remaining, |active| {
                let next_action = active
                    .prepared
                    .actions
                    .get(active.cursor)
                    .map_or(active.prepared.duration_frames, |action| {
                        action.sample_offset
                    });
                let boundary = next_action.min(active.prepared.duration_frames);
                usize::try_from(boundary.saturating_sub(active.position))
                    .unwrap_or(remaining)
                    .min(remaining)
            });
            if chunk == 0 {
                self.complete_preview_if_due();
                if self.active_preview.is_none() {
                    continue;
                }
                // A validated program always advances after actions at the current boundary.
                self.record_control_failure();
                self.end_preview(PreviewEndReason::Interrupted);
                continue;
            }
            self.engine
                .render_block(&mut self.scratch[rendered..rendered + chunk]);
            if let Some(active) = self.active_preview.as_mut() {
                active.position = active
                    .position
                    .saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
            }
            rendered += chunk;
        }
        self.apply_preview_actions();
        self.complete_preview_if_due();
    }

    fn apply_preview_actions(&mut self) {
        loop {
            let action = self.active_preview.as_ref().and_then(|active| {
                active
                    .prepared
                    .actions
                    .get(active.cursor)
                    .copied()
                    .filter(|action| action.sample_offset <= active.position)
            });
            let Some(action) = action else {
                break;
            };
            let (preview_id, base_identifier, patch, sample_position) = {
                let active = self
                    .active_preview
                    .as_mut()
                    .expect("preview action requires an active preview");
                active.cursor += 1;
                (
                    active.prepared.id,
                    active.prepared.base_identifier,
                    active.prepared.patch.clone(),
                    active.position,
                )
            };
            for (pitch_index, pitch) in action.pitches[..usize::from(action.pitch_count)]
                .iter()
                .copied()
                .enumerate()
            {
                let identifier =
                    preview_voice_identifier(base_identifier, action.event_index, pitch_index);
                if action.active {
                    self.engine
                        .note_on_audition(identifier, pitch, action.velocity, &patch);
                } else {
                    self.engine.note_off_audition(identifier);
                }
            }
            let _ = self.event_tx.push(RealtimeEvent::PreviewState {
                preview_id,
                pitches: action.pitches,
                pitch_count: action.pitch_count,
                active: action.active,
                sample_position,
            });
        }
    }

    fn complete_preview_if_due(&mut self) {
        let complete = self.active_preview.as_ref().is_some_and(|active| {
            active.cursor == active.prepared.actions.len()
                && active.position >= active.prepared.duration_frames
        });
        if complete {
            self.end_preview(PreviewEndReason::Completed);
        }
    }

    fn start_preview(&mut self, prepared: PreparedPreview) {
        self.end_preview(PreviewEndReason::Interrupted);
        let preview_id = prepared.id;
        let duration_frames = prepared.duration_frames;
        self.active_preview = Some(ActivePreview {
            prepared,
            cursor: 0,
            position: 0,
        });
        self.emit_critical(RealtimeEvent::PreviewStarted {
            preview_id,
            duration_frames,
        });
    }

    fn end_preview(&mut self, reason: PreviewEndReason) {
        let Some(active) = self.active_preview.take() else {
            return;
        };
        for action in active
            .prepared
            .actions
            .iter()
            .filter(|action| action.active)
        {
            for pitch_index in 0..usize::from(action.pitch_count) {
                self.engine.note_off_audition(preview_voice_identifier(
                    active.prepared.base_identifier,
                    action.event_index,
                    pitch_index,
                ));
            }
        }
        let preview_id = active.prepared.id;
        self.emit_critical(RealtimeEvent::PreviewEnded { preview_id, reason });
        self.retire(RetiredRealtimeAllocation::Preview(active.prepared));
    }

    fn retire(&mut self, allocation: RetiredRealtimeAllocation) {
        let allocation = match self.retired_tx.push(allocation) {
            Ok(()) => return,
            Err(PushError::Full(allocation)) => allocation,
        };
        if let Some(slot) = self.pending_reclaims.iter_mut().find(|slot| slot.is_none()) {
            *slot = Some(allocation);
            return;
        }
        // The bounded command/application schedule permits at most two deferred allocations.
        std::mem::forget(allocation);
        self.record_control_failure();
    }

    fn emit_critical(&mut self, event: RealtimeEvent) {
        let event = match self.event_tx.push(event) {
            Ok(()) => return,
            Err(PushError::Full(event)) => event,
        };
        if let Some(slot) = self
            .pending_critical_events
            .iter_mut()
            .find(|slot| slot.is_none())
        {
            *slot = Some(event);
            return;
        }
        self.record_control_failure();
    }

    fn record_control_failure(&mut self) {
        let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
            RealtimeDiagnostic::ControlFailure,
        ));
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
        self.emit_critical(event);
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
    use rtrb::RingBuffer;
    use tiempio_engine_core::{
        BassAmplifierPatchV1, BassFilterPatchV1, BassOscillatorPatchV1, PATCH_MODEL_VERSION,
    };
    use tiempio_engine_protocol::PreviewEventPayload;

    use super::*;

    fn preview_patch() -> BassPatchV1 {
        BassPatchV1 {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: BassOscillatorPatchV1 {
                detune_cents: 0.0,
                sub_level: 0.5,
            },
            filter: BassFilterPatchV1 {
                cutoff_hz: 500.0,
                envelope_amount: 0.4,
                resonance: 0.2,
            },
            amplifier: BassAmplifierPatchV1 {
                attack_ms: 0.0,
                decay_ms: 0.0,
                release_ms: 1.0,
                sustain: 1.0,
            },
            drive: 0.0,
            stereo_width: 0.0,
            output_gain: 1.0,
        }
    }

    fn preview_program(preview_id: &str) -> PreviewProgramPayload {
        PreviewProgramPayload {
            preview_id: preview_id.to_owned(),
            program_version: 1,
            events: vec![PreviewEventPayload {
                offset_ms: 1,
                duration_ms: 2,
                pitches: vec![45, 52],
                velocity: 100,
            }],
        }
    }

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

    #[test]
    fn schedules_preview_actions_on_the_render_clock_without_starting_transport() {
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, mut retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, mut event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let mut realtime = RealtimeEngine::new(
            create_engine(48_000),
            48_000,
            command_rx,
            retired_tx,
            event_tx,
            signals,
        );
        let preview =
            PreparedPreview::prepare(preview_program("preview.clock.1"), 48_000, preview_patch())
                .expect("valid preview");
        command_tx
            .push(RealtimeCommand::StartPreview(preview))
            .expect("bounded command queue");

        assert!(realtime.render_frames(48));
        assert_eq!(realtime.engine.transport_state(), TransportState::Stopped);
        assert_eq!(
            realtime
                .active_preview
                .as_ref()
                .map(|preview| preview.position),
            Some(48)
        );
        let first_events: Vec<_> = std::iter::from_fn(|| event_rx.pop().ok()).collect();
        assert!(first_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewStarted {
                duration_frames: 144,
                ..
            }
        )));
        assert!(first_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewState {
                active: true,
                sample_position: 48,
                ..
            }
        )));

        assert!(realtime.render_frames(96));
        assert!(realtime.active_preview.is_none());
        let final_events: Vec<_> = std::iter::from_fn(|| event_rx.pop().ok()).collect();
        assert!(final_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewState {
                active: false,
                sample_position: 144,
                ..
            }
        )));
        assert!(final_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewEnded {
                reason: PreviewEndReason::Completed,
                ..
            }
        )));
        assert!(matches!(
            retired_rx.pop(),
            Ok(RetiredRealtimeAllocation::Preview(_))
        ));
    }

    #[test]
    fn ignores_stale_preview_cancel_and_accepts_the_matching_identifier() {
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, _retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, mut event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let mut realtime = RealtimeEngine::new(
            create_engine(48_000),
            48_000,
            command_rx,
            retired_tx,
            event_tx,
            signals,
        );
        let preview_id = PreviewId::new("preview.cancel.1").expect("valid ID");
        let preview = PreparedPreview::prepare(
            preview_program(preview_id.as_str()),
            48_000,
            preview_patch(),
        )
        .expect("valid preview");
        command_tx
            .push(RealtimeCommand::StartPreview(preview))
            .expect("bounded command queue");
        assert!(realtime.render_frames(48));
        command_tx
            .push(RealtimeCommand::CancelPreview {
                preview_id: PreviewId::new("preview.stale.1").expect("valid ID"),
                reason: PreviewEndReason::Canceled,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert!(realtime.active_preview.is_some());
        command_tx
            .push(RealtimeCommand::CancelPreview {
                preview_id,
                reason: PreviewEndReason::Canceled,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert!(realtime.active_preview.is_none());
        assert!(
            std::iter::from_fn(|| event_rx.pop().ok()).any(|event| matches!(
                event,
                RealtimeEvent::PreviewEnded {
                    reason: PreviewEndReason::Canceled,
                    ..
                }
            ))
        );
    }
}
