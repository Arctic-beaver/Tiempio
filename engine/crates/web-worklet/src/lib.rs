use std::cell::RefCell;
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use rtrb::{Consumer, PopError, Producer, PushError, RingBuffer};
use tiempio_engine_core::{MAX_SAFE_INTEGER, PreparedPlan, RenderPlan};
use tiempio_engine_dsp::DspConfiguration;
use tiempio_engine_protocol::{
    AudioConfiguration, ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_VERSION, EngineCommand,
    EngineEvent, HandshakePeer, ProtocolLimits, ProtocolSession, ProtocolSessionState,
    WEB_WORKLET_CAPABILITY_CODES, encode_event_body,
};
use tiempio_engine_realtime::{
    AuditionPatch, CONTROL_QUEUE_CAPACITY, EVENT_QUEUE_CAPACITY, PreparedPreview,
    PreparedRecording, PreviewEndReason, PreviewId, RealtimeCommand, RealtimeEngine, RealtimeEvent,
    RecordingIdentifier, RecordingStopReason, RetiredRealtimeAllocation, StreamSignals,
    audition_patch_for_layer, create_engine, drum_instrument_for_pitch, map_realtime_event,
    stable_audition_identifier, synth_patch_for_layer,
};

pub const WEB_WORKLET_ABI_VERSION: u32 = 1;
const ABI_OK: u32 = 0;
const ABI_INVALID: u32 = 1;
const ABI_UNAVAILABLE: u32 = 2;
const ABI_QUEUE_FULL: u32 = 3;

struct WebWorkletEngine {
    sample_rate: u32,
    maximum_block_frames: usize,
    configured: bool,
    running: bool,
    session: ProtocolSession,
    command_tx: Producer<RealtimeCommand>,
    retired_rx: Consumer<RetiredRealtimeAllocation>,
    event_rx: Consumer<RealtimeEvent>,
    realtime: RealtimeEngine,
    signals: Arc<StreamSignals>,
    latest_plan: Option<RenderPlan>,
    latest_generation: u64,
    recording_target: Option<(String, String)>,
    pending_events: VecDeque<EngineEvent>,
    next_event_sequence: u64,
    command_buffer: Box<[u8]>,
    event_buffer: Box<[u8]>,
    output_buffer: Box<[f32]>,
}

impl WebWorkletEngine {
    fn new(sample_rate: u32, maximum_block_frames: usize) -> Option<Self> {
        DspConfiguration::new(sample_rate, maximum_block_frames).ok()?;
        let (command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let realtime = RealtimeEngine::new(
            create_engine(sample_rate),
            sample_rate,
            command_rx,
            retired_tx,
            event_tx,
            Arc::clone(&signals),
        );
        Some(Self {
            sample_rate,
            maximum_block_frames,
            configured: false,
            running: false,
            session: ProtocolSession::web_worklet(),
            command_tx,
            retired_rx,
            event_rx,
            realtime,
            signals,
            latest_plan: None,
            latest_generation: 0,
            recording_target: None,
            pending_events: VecDeque::with_capacity(EVENT_QUEUE_CAPACITY),
            next_event_sequence: 0,
            command_buffer: vec![0_u8; ENGINE_PROTOCOL_MAX_FRAME_BYTES].into_boxed_slice(),
            event_buffer: vec![0_u8; ENGINE_PROTOCOL_MAX_FRAME_BYTES].into_boxed_slice(),
            output_buffer: vec![0.0_f32; maximum_block_frames.saturating_mul(2)].into_boxed_slice(),
        })
    }

    fn accept_command(&mut self, length: usize) -> u32 {
        if length == 0 || length > self.command_buffer.len() {
            return ABI_INVALID;
        }
        let envelope = match self.session.accept_body(&self.command_buffer[..length]) {
            Ok(envelope) => envelope,
            Err(error) => {
                let fatal = self.session.state() == ProtocolSessionState::Terminated;
                let event = if fatal {
                    EngineEvent::FatalError {
                        code: error.diagnostic.stable_code().to_owned(),
                        message: error.message,
                    }
                } else {
                    EngineEvent::Diagnostic {
                        code: error.diagnostic.stable_code().to_owned(),
                        message: error.message,
                        project_revision: None,
                    }
                };
                return if self.queue_event(event) {
                    ABI_INVALID
                } else {
                    ABI_QUEUE_FULL
                };
            }
        };
        self.dispatch(envelope.command)
    }

    fn dispatch(&mut self, command: EngineCommand) -> u32 {
        match command {
            EngineCommand::Handshake(handshake) => self.handshake(handshake.peer),
            EngineCommand::ConfigureAudio(configuration) => self.configure_audio(&configuration),
            EngineCommand::StartAudio => self.start_audio(),
            EngineCommand::StopAudio => {
                self.running = false;
                if self.push_realtime(RealtimeCommand::Stop) != ABI_OK {
                    return ABI_QUEUE_FULL;
                }
                self.queue_health()
            }
            EngineCommand::LoadRenderPlan(plan) => {
                if self.recording_target.is_some() {
                    self.diagnostic(
                        "engine.stale-revision",
                        "Render-plan activation is held during recording.",
                    )
                } else {
                    self.load_plan(plan)
                }
            }
            playback_command @ (EngineCommand::Play(_)
            | EngineCommand::Stop
            | EngineCommand::Seek(_)
            | EngineCommand::SetLoop(_)
            | EngineCommand::SetMetronomeEnabled(_)
            | EngineCommand::SetMetronomeVolume(_)) => self.dispatch_playback(playback_command),
            EngineCommand::NoteOn(payload) => self.note_on(
                &payload.audition_id,
                &payload.layer_id,
                payload.pitch,
                payload.velocity,
            ),
            EngineCommand::NoteOff(payload) => self.push_realtime(RealtimeCommand::NoteOff(
                stable_audition_identifier(&payload.audition_id),
            )),
            EngineCommand::StartPreview(payload) => {
                self.recording_target = None;
                let Some(patch) = self
                    .latest_plan
                    .as_ref()
                    .and_then(|plan| synth_patch_for_layer(plan, &payload.layer_id))
                else {
                    return self.diagnostic(
                        "engine.invalid-plan",
                        "Preview requires an active synth layer.",
                    );
                };
                let Some(prepared) = PreparedPreview::prepare(payload, self.sample_rate, patch)
                else {
                    return self
                        .diagnostic("engine.invalid-plan", "Preview program preparation failed.");
                };
                self.push_realtime(RealtimeCommand::StartPreview(prepared))
            }
            EngineCommand::CancelPreview(payload) => {
                let Some(preview_id) = PreviewId::new(&payload.preview_id) else {
                    return ABI_INVALID;
                };
                self.push_realtime(RealtimeCommand::CancelPreview {
                    preview_id,
                    reason: PreviewEndReason::Canceled,
                })
            }
            recording_command @ (EngineCommand::StartRecording(_)
            | EngineCommand::RecordingNoteOn(_)
            | EngineCommand::RecordingNoteOff(_)
            | EngineCommand::StopRecording(_)) => self.dispatch_recording(recording_command),
            EngineCommand::RequestDiagnostics => self.queue_health(),
            EngineCommand::Ping(payload) => {
                if self.queue_event(EngineEvent::Pong {
                    heartbeat_id: payload.heartbeat_id,
                }) {
                    ABI_OK
                } else {
                    ABI_QUEUE_FULL
                }
            }
            EngineCommand::Shutdown => {
                self.recording_target = None;
                self.running = false;
                self.push_realtime(RealtimeCommand::Shutdown)
            }
            EngineCommand::RefreshDevices
            | EngineCommand::ApplyRenderPlanDelta(_)
            | EngineCommand::PreviewMacro(_)
            | EngineCommand::CommitMacro(_)
            | EngineCommand::StartOfflineRender { .. }
            | EngineCommand::CancelOfflineRender(_) => self.diagnostic(
                "protocol.unsupported-command",
                "Command is unavailable in the Web AudioWorklet engine.",
            ),
        }
    }

    fn start_audio(&mut self) -> u32 {
        if !self.configured {
            return self.diagnostic(
                "audio.configuration-unsupported",
                "Configure Web audio before starting output.",
            );
        }
        self.running = true;
        self.queue_health()
    }

    fn dispatch_playback(&mut self, command: EngineCommand) -> u32 {
        match command {
            EngineCommand::Play(payload) => {
                self.recording_target = None;
                self.push_realtime(RealtimeCommand::Play(payload.start_tick))
            }
            EngineCommand::Stop => {
                self.recording_target = None;
                self.push_realtime(RealtimeCommand::Stop)
            }
            EngineCommand::Seek(payload) => {
                self.recording_target = None;
                self.push_realtime(RealtimeCommand::Seek(payload.tick))
            }
            EngineCommand::SetLoop(payload) => self.push_realtime(RealtimeCommand::SetLoop {
                enabled: payload.enabled,
                start_tick: payload.start_tick,
                end_tick: payload.end_tick,
            }),
            EngineCommand::SetMetronomeEnabled(payload) => {
                self.push_realtime(RealtimeCommand::SetMetronomeEnabled(payload.enabled))
            }
            EngineCommand::SetMetronomeVolume(payload) => {
                self.push_realtime(RealtimeCommand::SetMetronomeVolume(payload.volume))
            }
            _ => unreachable!("playback dispatcher received another command"),
        }
    }

    fn dispatch_recording(&mut self, command: EngineCommand) -> u32 {
        match command {
            EngineCommand::StartRecording(payload) => {
                if self.recording_target.is_some() {
                    return self.diagnostic(
                        "engine.limit-exceeded",
                        "Only one recording session may be active.",
                    );
                }
                let Some(plan) = self.latest_plan.as_ref() else {
                    return self.diagnostic(
                        "engine.invalid-plan",
                        "Recording requires an active render plan.",
                    );
                };
                let Some(prepared) = PreparedRecording::prepare(&payload, plan, self.sample_rate)
                else {
                    return self.diagnostic(
                        "engine.invalid-plan",
                        "Recording could not bind to the requested project revision and clock.",
                    );
                };
                let target = (payload.recording_id.clone(), payload.layer_id.clone());
                let result = self.push_realtime(RealtimeCommand::StartRecording(prepared));
                if result == ABI_OK {
                    self.recording_target = Some(target);
                }
                result
            }
            EngineCommand::RecordingNoteOn(payload) => self.recording_note_on(
                &payload.recording_id,
                &payload.audition_id,
                payload.pitch,
                payload.velocity,
            ),
            EngineCommand::RecordingNoteOff(payload) => {
                if self
                    .recording_target
                    .as_ref()
                    .is_none_or(|(recording_id, _)| recording_id != &payload.recording_id)
                {
                    return ABI_INVALID;
                }
                let (Some(recording_id), Some(input_id)) = (
                    RecordingIdentifier::new(&payload.recording_id),
                    RecordingIdentifier::new(&payload.audition_id),
                ) else {
                    return ABI_INVALID;
                };
                self.push_realtime(RealtimeCommand::RecordingNoteOff {
                    recording_id,
                    input_id,
                })
            }
            EngineCommand::StopRecording(payload) => {
                if self
                    .recording_target
                    .as_ref()
                    .is_none_or(|(recording_id, _)| recording_id != &payload.recording_id)
                {
                    return ABI_INVALID;
                }
                let Some(recording_id) = RecordingIdentifier::new(&payload.recording_id) else {
                    return ABI_INVALID;
                };
                let result = self.push_realtime(RealtimeCommand::StopRecording {
                    recording_id,
                    reason: RecordingStopReason::Stopped,
                });
                if result == ABI_OK {
                    self.recording_target = None;
                }
                result
            }
            _ => unreachable!("recording dispatcher received another command"),
        }
    }

    fn handshake(&mut self, peer: HandshakePeer) -> u32 {
        if peer != HandshakePeer::Application {
            return self.diagnostic(
                "protocol.invalid-envelope",
                "Web worklet requires an application peer.",
            );
        }
        if !self.queue_event(EngineEvent::Ready {
            protocol_version: ENGINE_PROTOCOL_VERSION,
        }) || !self.queue_event(EngineEvent::Capabilities {
            capabilities: WEB_WORKLET_CAPABILITY_CODES
                .iter()
                .map(|capability| (*capability).to_owned())
                .collect(),
            limits: ProtocolLimits::current(),
        }) {
            return ABI_QUEUE_FULL;
        }
        self.queue_health()
    }

    fn configure_audio(&mut self, configuration: &AudioConfiguration) -> u32 {
        if configuration.sample_rate != self.sample_rate
            || usize::try_from(configuration.block_frames)
                .map_or(true, |frames| frames > self.maximum_block_frames)
            || configuration.channels != 2
        {
            return self.diagnostic(
                "audio.configuration-unsupported",
                "Web audio configuration does not match the active context.",
            );
        }
        self.configured = true;
        self.queue_health()
    }

    fn load_plan(&mut self, plan: RenderPlan) -> u32 {
        self.latest_generation = self.latest_generation.saturating_add(1);
        if self.latest_generation == 0 || self.latest_generation > MAX_SAFE_INTEGER {
            return self.diagnostic(
                "engine.limit-exceeded",
                "Render plan generation is exhausted.",
            );
        }
        let Ok(prepared) =
            PreparedPlan::prepare(plan.clone(), self.sample_rate, self.latest_generation)
        else {
            return self.diagnostic("engine.invalid-plan", "Render plan preparation failed.");
        };
        let result = self.push_realtime(RealtimeCommand::PublishPlan(prepared));
        if result == ABI_OK {
            self.latest_plan = Some(plan);
        }
        result
    }

    fn note_on(&mut self, audition_id: &str, layer_id: &str, midi_pitch: u8, velocity: u8) -> u32 {
        let Some(audition_patch) = self
            .latest_plan
            .as_ref()
            .and_then(|plan| audition_patch_for_layer(plan, layer_id))
        else {
            return self.diagnostic(
                "engine.invalid-plan",
                "Audition requires an active instrument layer.",
            );
        };
        let identifier = stable_audition_identifier(audition_id);
        match audition_patch {
            AuditionPatch::Synth(synth_patch) => self.push_realtime(RealtimeCommand::NoteOn {
                identifier,
                pitch: midi_pitch,
                velocity,
                patch: synth_patch,
            }),
            AuditionPatch::Drums(drum_patch) => {
                let instrument = drum_instrument_for_pitch(midi_pitch);
                self.push_realtime(RealtimeCommand::DrumHit {
                    identifier,
                    instrument,
                    velocity,
                    patch: drum_patch.voice(instrument).clone(),
                })
            }
        }
    }

    fn recording_note_on(
        &mut self,
        recording_id: &str,
        audition_id: &str,
        midi_pitch: u8,
        velocity: u8,
    ) -> u32 {
        let Some((_, layer_id)) = self
            .recording_target
            .as_ref()
            .filter(|(active_id, _)| active_id == recording_id)
        else {
            return ABI_INVALID;
        };
        let Some(voice_patch) = self
            .latest_plan
            .as_ref()
            .and_then(|plan| synth_patch_for_layer(plan, layer_id))
        else {
            return self.diagnostic("engine.invalid-plan", "Recording requires a synth layer.");
        };
        self.push_recording_note_on(recording_id, audition_id, midi_pitch, velocity, voice_patch)
    }

    fn push_recording_note_on(
        &mut self,
        recording_id: &str,
        audition_id: &str,
        midi_pitch: u8,
        velocity: u8,
        voice_patch: tiempio_engine_core::SynthPatch,
    ) -> u32 {
        let (Some(recording_id), Some(input_id)) = (
            RecordingIdentifier::new(recording_id),
            RecordingIdentifier::new(audition_id),
        ) else {
            return ABI_INVALID;
        };
        self.push_realtime(RealtimeCommand::RecordingNoteOn {
            recording_id,
            input_id,
            voice_identifier: stable_audition_identifier(audition_id),
            pitch: midi_pitch,
            velocity,
            patch: voice_patch,
        })
    }

    fn push_realtime(&mut self, command: RealtimeCommand) -> u32 {
        match self.command_tx.push(command) {
            Ok(()) => ABI_OK,
            Err(PushError::Full(command)) => {
                drop(command);
                let _ = self.diagnostic(
                    "audio.render-overload",
                    "The bounded Web audio control queue is saturated.",
                );
                ABI_QUEUE_FULL
            }
        }
    }

    fn diagnostic(&mut self, code: &str, message: &str) -> u32 {
        if self.queue_event(EngineEvent::Diagnostic {
            code: code.to_owned(),
            message: message.to_owned(),
            project_revision: self
                .latest_plan
                .as_ref()
                .map(|plan| plan.project_revision.value()),
        }) {
            ABI_INVALID
        } else {
            ABI_QUEUE_FULL
        }
    }

    fn queue_event(&mut self, event: EngineEvent) -> bool {
        if self.pending_events.len() >= EVENT_QUEUE_CAPACITY {
            return false;
        }
        self.pending_events.push_back(event);
        true
    }

    fn queue_health(&mut self) -> u32 {
        let observed_block_frames = self.signals.last_block_frames.load(Ordering::Acquire);
        let event = EngineEvent::AudioHealth {
            active_device_id: None,
            active_voices: self.signals.active_voices.load(Ordering::Acquire),
            backend_state: if self.running { "ready" } else { "stopped" }.to_owned(),
            block_frames: Some(if observed_block_frames == 0 {
                u32::try_from(self.maximum_block_frames).unwrap_or(u32::MAX)
            } else {
                observed_block_frames
            }),
            device_state: if self.running {
                "available"
            } else {
                "unavailable"
            }
            .to_owned(),
            mode: Some("browser".to_owned()),
            output_muted: !self.running,
            output_signal_observed: self.signals.output_signal_observed.load(Ordering::Acquire),
            project_revision: self
                .latest_plan
                .as_ref()
                .map(|plan| plan.project_revision.value()),
            sample_rate: Some(self.sample_rate),
            underruns: self.signals.render_overloads.load(Ordering::Acquire),
        };
        if self.queue_event(event) {
            ABI_OK
        } else {
            ABI_QUEUE_FULL
        }
    }

    fn render(&mut self, frame_count: usize) -> u32 {
        if frame_count == 0 || frame_count > self.maximum_block_frames {
            return ABI_INVALID;
        }
        let sample_count = frame_count.saturating_mul(2);
        let output = &mut self.output_buffer[..sample_count];
        if self.running {
            self.realtime.render_f32_channels(output, 2);
        } else {
            output.fill(0.0);
        }
        ABI_OK
    }

    fn drain_event(&mut self) -> usize {
        while self.retired_rx.pop().is_ok() {}
        let event = self
            .pending_events
            .pop_front()
            .or_else(|| match self.event_rx.pop() {
                Ok(event) => Some(map_realtime_event(event)),
                Err(PopError::Empty) => None,
            });
        let Some(event) = event else {
            return 0;
        };
        let Ok(body) = encode_event_body(self.next_event_sequence, &event) else {
            return 0;
        };
        if body.len() > self.event_buffer.len() {
            return 0;
        }
        self.next_event_sequence = self.next_event_sequence.saturating_add(1);
        self.event_buffer[..body.len()].copy_from_slice(&body);
        body.len()
    }
}

thread_local! {
    static WEB_ENGINE: RefCell<Option<WebWorkletEngine>> = const { RefCell::new(None) };
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_abi_version() -> u32 {
    WEB_WORKLET_ABI_VERSION
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_protocol_version() -> u32 {
    ENGINE_PROTOCOL_VERSION
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_create(sample_rate: u32, maximum_block_frames: u32) -> u32 {
    let Ok(maximum_block_frames) = usize::try_from(maximum_block_frames) else {
        return ABI_INVALID;
    };
    let Some(engine) = WebWorkletEngine::new(sample_rate, maximum_block_frames) else {
        return ABI_INVALID;
    };
    WEB_ENGINE.with_borrow_mut(|slot| *slot = Some(engine));
    ABI_OK
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_destroy() {
    WEB_ENGINE.with_borrow_mut(Option::take);
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_command_buffer_ptr() -> usize {
    WEB_ENGINE.with_borrow(|slot| {
        slot.as_ref()
            .map_or(0, |engine| engine.command_buffer.as_ptr() as usize)
    })
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_command_buffer_capacity() -> usize {
    ENGINE_PROTOCOL_MAX_FRAME_BYTES
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_accept_command(length: usize) -> u32 {
    WEB_ENGINE.with_borrow_mut(|slot| {
        slot.as_mut()
            .map_or(ABI_UNAVAILABLE, |engine| engine.accept_command(length))
    })
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_render(frame_count: usize) -> u32 {
    WEB_ENGINE.with_borrow_mut(|slot| {
        slot.as_mut()
            .map_or(ABI_UNAVAILABLE, |engine| engine.render(frame_count))
    })
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_output_buffer_ptr() -> usize {
    WEB_ENGINE.with_borrow(|slot| {
        slot.as_ref()
            .map_or(0, |engine| engine.output_buffer.as_ptr() as usize)
    })
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_drain_event() -> usize {
    WEB_ENGINE.with_borrow_mut(|slot| slot.as_mut().map_or(0, WebWorkletEngine::drain_event))
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn tiempio_web_worklet_event_buffer_ptr() -> usize {
    WEB_ENGINE.with_borrow(|slot| {
        slot.as_ref()
            .map_or(0, |engine| engine.event_buffer.as_ptr() as usize)
    })
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    fn command(sequence: u64, command_type: &str, payload: &Value) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "requestId": format!("web-test-{sequence}-{command_type}"),
            "sequence": sequence,
            "type": command_type,
            "payload": payload
        }))
        .unwrap()
    }

    fn send(engine: &mut WebWorkletEngine, body: &[u8]) -> u32 {
        engine.command_buffer[..body.len()].copy_from_slice(body);
        engine.accept_command(body.len())
    }

    fn handshake() -> Vec<u8> {
        command(
            0,
            "handshake",
            &json!({
                "protocolVersion": ENGINE_PROTOCOL_VERSION,
                "peer": "application",
                "renderPlanVersion": 5,
                "patchModelVersion": 4,
                "capabilities": WEB_WORKLET_CAPABILITY_CODES
            }),
        )
    }

    fn configured_engine(sample_rate: u32, block_frames: u32) -> WebWorkletEngine {
        let mut engine = WebWorkletEngine::new(sample_rate, block_frames as usize).unwrap();
        assert_eq!(send(&mut engine, &handshake()), ABI_OK);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    1,
                    "configure-audio",
                    &json!({
                        "sampleRate": sample_rate,
                        "blockFrames": block_frames,
                        "channels": 2
                    }),
                ),
            ),
            ABI_OK
        );
        engine
    }

    fn drain_events(engine: &mut WebWorkletEngine) -> Vec<Value> {
        let mut events = Vec::new();
        loop {
            let length = engine.drain_event();
            if length == 0 {
                break;
            }
            events.push(serde_json::from_slice(&engine.event_buffer[..length]).unwrap());
        }
        events
    }

    fn load_start_and_play(engine: &mut WebWorkletEngine, plan: &Value) {
        assert_eq!(
            send(
                engine,
                &command(2, "load-render-plan", &json!({ "plan": plan })),
            ),
            ABI_OK
        );
        assert_eq!(send(engine, &command(3, "start-audio", &json!({}))), ABI_OK);
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            send(engine, &command(4, "play", &json!({ "startTick": 0 }))),
            ABI_OK
        );
    }

    fn render_energy(engine: &mut WebWorkletEngine, blocks: usize) -> f32 {
        let mut energy = 0.0_f32;
        for _ in 0..blocks {
            assert_eq!(engine.render(128), ABI_OK);
            assert!(
                engine.output_buffer[..256]
                    .iter()
                    .all(|sample| sample.is_finite())
            );
            energy += engine.output_buffer[..256]
                .iter()
                .map(|sample| sample.abs())
                .sum::<f32>();
        }
        energy
    }

    fn assert_engine_clock_recording(events: &[Value]) {
        assert!(events.iter().any(|event| {
            event["type"] == "recording-state"
                && event["payload"]["state"] == "count-in"
                && event["payload"]["countInBeatsRemaining"] == 4
        }));
        assert!(events.iter().any(|event| {
            event["type"] == "recording-state"
                && event["payload"]["state"] == "recording"
                && event["payload"]["samplePosition"] == 96_128
                && event["payload"]["sourceTick"] == 960
        }));
        assert!(events.iter().any(|event| {
            event["type"] == "recording-input-applied"
                && event["payload"]["phase"] == "note-on"
                && event["payload"]["sourceTick"] == 960
        }));
        assert!(events.iter().any(|event| {
            event["type"] == "recording-input-applied"
                && event["payload"]["phase"] == "note-off"
                && event["payload"]["sourceTick"] == 1_011
        }));
        assert!(events.iter().any(|event| {
            event["type"] == "recording-stopped"
                && event["payload"]["reason"] == "stopped"
                && event["payload"]["stopTick"] == 1_016
        }));
    }

    #[test]
    fn raw_abi_is_bounded_and_rejects_invalid_configuration() {
        assert!(WebWorkletEngine::new(7_999, 128).is_none());
        assert!(
            WebWorkletEngine::new(
                48_000,
                tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_BLOCK_FRAMES + 1
            )
            .is_none()
        );
        let mut engine = WebWorkletEngine::new(48_000, 128).unwrap();
        assert_eq!(engine.accept_command(0), ABI_INVALID);
        assert_eq!(engine.render(129), ABI_INVALID);
        assert_eq!(engine.command_buffer.len(), ENGINE_PROTOCOL_MAX_FRAME_BYTES);
        assert_eq!(engine.output_buffer.len(), 256);
    }

    #[test]
    fn deep_fixture_handshakes_acknowledges_and_renders_non_silent_stereo() {
        let mut engine = configured_engine(48_000, 128);
        let plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        assert_eq!(
            send(
                &mut engine,
                &command(2, "load-render-plan", &json!({ "plan": plan })),
            ),
            ABI_OK
        );
        assert_eq!(
            send(&mut engine, &command(3, "start-audio", &json!({}))),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            send(&mut engine, &command(4, "play", &json!({ "startTick": 0 })),),
            ABI_OK
        );
        let mut energy = 0.0_f32;
        for _ in 0..8 {
            assert_eq!(engine.render(128), ABI_OK);
            energy += engine.output_buffer[..256]
                .iter()
                .map(|sample| sample.abs())
                .sum::<f32>();
        }
        assert!(energy > 0.01);
        let mut acknowledged = false;
        loop {
            let length = engine.drain_event();
            if length == 0 {
                break;
            }
            let event: Value = serde_json::from_slice(&engine.event_buffer[..length]).unwrap();
            acknowledged |= event["type"] == "render-plan-acknowledged";
        }
        assert!(acknowledged || engine.signals.project_revision.load(Ordering::Acquire) == 7);
    }

    #[test]
    fn every_synth_family_and_procedural_drums_render_finite_audio() {
        let matrix: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/web-synth-parity-matrix.json"
        ))
        .unwrap();
        let base_plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        let cases = matrix["cases"].as_array().unwrap();
        assert_eq!(
            cases
                .iter()
                .map(|case| case["id"].as_str().unwrap().split('.').next().unwrap())
                .collect::<Vec<_>>(),
            ["bass", "lead", "pad", "pluck", "texture"]
        );
        for case in cases {
            let case_id = case["id"].as_str().unwrap();
            let mut plan = base_plan.clone();
            plan["projectId"] = json!(format!("project.web-parity.{case_id}"));
            plan["layers"][0]["source"]["patch"] = case["patch"].clone();
            let mut engine = configured_engine(48_000, 128);
            load_start_and_play(&mut engine, &plan);
            let energy = render_energy(&mut engine, 32);
            assert!(energy > 0.000_001, "{case_id} rendered silence");
        }

        let drum_plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/unsupported-drum-plan.json"
        ))
        .unwrap();
        let mut engine = configured_engine(48_000, 128);
        load_start_and_play(&mut engine, &drum_plan);
        assert!(render_energy(&mut engine, 16) > 0.01);
    }

    #[test]
    fn preview_metronome_transport_seek_and_loop_share_the_realtime_path() {
        let plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        let mut engine = configured_engine(48_000, 128);
        load_start_and_play(&mut engine, &plan);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    5,
                    "set-loop",
                    &json!({ "enabled": true, "startTick": 0, "endTick": 960 }),
                ),
            ),
            ABI_OK
        );
        assert_eq!(
            send(
                &mut engine,
                &command(6, "set-metronome-enabled", &json!({ "enabled": true })),
            ),
            ABI_OK
        );
        assert_eq!(
            send(
                &mut engine,
                &command(7, "set-metronome-volume", &json!({ "volume": 0.4 })),
            ),
            ABI_OK
        );
        assert!(render_energy(&mut engine, 12) > 0.001);
        assert_eq!(
            send(&mut engine, &command(8, "seek", &json!({ "tick": 480 }))),
            ABI_OK
        );
        assert_eq!(send(&mut engine, &command(9, "stop", &json!({}))), ABI_OK);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    10,
                    "start-preview",
                    &json!({
                        "previewId": "preview.web-parity",
                        "layerId": "layer.bass",
                        "programVersion": 1,
                        "events": [
                            { "offsetMs": 0, "durationMs": 500, "pitches": [45, 52], "velocity": 100 }
                        ]
                    }),
                ),
            ),
            ABI_OK
        );
        assert!(render_energy(&mut engine, 2) > 0.000_001);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    11,
                    "cancel-preview",
                    &json!({ "previewId": "preview.web-parity" }),
                ),
            ),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        let events = drain_events(&mut engine);
        assert!(
            events
                .iter()
                .any(|event| event["type"] == "transport-snapshot")
        );
        assert!(events.iter().any(|event| event["type"] == "preview-state"));
        assert!(events.iter().any(|event| event["type"] == "preview-ended"));
    }

    #[test]
    fn recording_uses_the_engine_clock_across_count_in_and_held_input() {
        let mut plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        plan["tempoMap"][0]["microBpm"] = json!(120_000_000);
        let mut engine = configured_engine(48_000, 128);
        assert_eq!(
            send(
                &mut engine,
                &command(2, "load-render-plan", &json!({ "plan": plan })),
            ),
            ABI_OK
        );
        assert_eq!(
            send(&mut engine, &command(3, "start-audio", &json!({}))),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        drain_events(&mut engine);

        assert_eq!(
            send(
                &mut engine,
                &command(
                    4,
                    "start-recording",
                    &json!({
                        "recordingId": "recording.web.clock",
                        "layerId": "layer.bass",
                        "projectRevision": 7,
                        "startTick": 960,
                        "countInBars": 1
                    }),
                ),
            ),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    5,
                    "recording-note-on",
                    &json!({
                        "recordingId": "recording.web.clock",
                        "auditionId": "input.web.1",
                        "pitch": 45,
                        "velocity": 101
                    }),
                ),
            ),
            ABI_OK
        );
        for _ in 0..749 {
            assert_eq!(engine.render(128), ABI_OK);
        }
        for _ in 0..10 {
            assert_eq!(engine.render(128), ABI_OK);
        }
        assert_eq!(
            send(
                &mut engine,
                &command(
                    6,
                    "recording-note-off",
                    &json!({
                        "recordingId": "recording.web.clock",
                        "auditionId": "input.web.1"
                    }),
                ),
            ),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            send(
                &mut engine,
                &command(
                    7,
                    "stop-recording",
                    &json!({ "recordingId": "recording.web.clock" }),
                ),
            ),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);

        assert_engine_clock_recording(&drain_events(&mut engine));
    }

    #[test]
    fn stale_invalid_and_saturated_control_input_fail_boundedly() {
        let plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        let mut engine = configured_engine(48_000, 128);
        assert_eq!(
            send(
                &mut engine,
                &command(2, "load-render-plan", &json!({ "plan": plan })),
            ),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            send(
                &mut engine,
                &command(3, "load-render-plan", &json!({ "plan": plan })),
            ),
            ABI_INVALID
        );
        assert_eq!(send(&mut engine, b"{"), ABI_INVALID);
        let events = drain_events(&mut engine);
        assert!(events.iter().any(|event| {
            event["type"] == "diagnostic" && event["payload"]["code"] == "engine.stale-revision"
        }));

        let mut saturated = configured_engine(48_000, 128);
        let mut overflow_observed = false;
        for sequence in 2..=u64::try_from(CONTROL_QUEUE_CAPACITY + 2).unwrap() {
            let result = send(
                &mut saturated,
                &command(sequence, "play", &json!({ "startTick": 0 })),
            );
            if result == ABI_QUEUE_FULL {
                overflow_observed = true;
                break;
            }
            assert_eq!(result, ABI_OK);
        }
        assert!(overflow_observed);
        assert!(saturated.pending_events.len() <= EVENT_QUEUE_CAPACITY);
    }

    #[test]
    fn render_path_uses_the_context_rate_and_actual_bounded_quantum() {
        let mut engine = configured_engine(44_100, 256);
        assert_eq!(
            send(&mut engine, &command(2, "start-audio", &json!({}))),
            ABI_OK
        );
        assert_eq!(engine.render(128), ABI_OK);
        assert_eq!(
            engine.signals.last_block_frames.load(Ordering::Acquire),
            128
        );
        assert_eq!(engine.sample_rate, 44_100);
    }
}
