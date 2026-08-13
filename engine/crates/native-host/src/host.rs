use std::io::{self, Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

use rtrb::{Consumer, Producer, PushError, RingBuffer};
use tiempio_engine_core::{MAX_SAFE_INTEGER, PreparedPlan, RenderPlan};
use tiempio_engine_protocol::{
    AudioConfiguration, ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_VERSION, EngineCommand,
    EngineEvent, HandshakePeer, NATIVE_HOST_CAPABILITY_CODES, NoteOnPayload,
    PreviewIdentifierPayload, PreviewProgramPayload, ProtocolLimits, ProtocolSession,
    ProtocolSessionState, encode_event_body, encode_frame,
};

use crate::backend::{
    AudioBackendError, BackendConfiguration, NullOutputBackend, OutputBackend, RunningOutput,
    SharedOutputBackend,
};
use crate::realtime::{
    AuditionPatch, CONTROL_QUEUE_CAPACITY, EVENT_QUEUE_CAPACITY, PreparedPreview, PreviewEndReason,
    PreviewId, RealtimeCommand, RealtimeEngine, RealtimeEvent, RetiredRealtimeAllocation,
    StreamSignals, audition_patch_for_layer, create_engine, drum_instrument_for_pitch,
    map_realtime_event, stable_audition_identifier, synth_patch_for_layer,
};

const RECOVERY_BASE_DELAY: Duration = Duration::from_millis(250);
const RECOVERY_MAX_DELAY: Duration = Duration::from_secs(4);

pub(crate) enum WriterEvent {
    Engine(EngineEvent),
    InstallRealtime(Consumer<RealtimeEvent>),
}

pub(crate) struct HostController<Backend: OutputBackend> {
    backend: Backend,
    event_tx: SyncSender<WriterEvent>,
    configuration: Option<BackendConfiguration<Backend::PrivateConfiguration>>,
    stream: Option<Backend::Stream>,
    command_tx: Option<Producer<RealtimeCommand>>,
    retired_rx: Option<Consumer<RetiredRealtimeAllocation>>,
    signals: Arc<StreamSignals>,
    latest_plan: Option<RenderPlan>,
    latest_generation: u64,
    backend_state: &'static str,
    device_state: &'static str,
    active_device_id: Option<String>,
    desired_audio_running: bool,
    requested_configuration: Option<AudioConfiguration>,
    recovery_attempt: u32,
    next_recovery_at: Option<Instant>,
    metronome_enabled: bool,
    metronome_volume: f64,
}

impl<Backend: OutputBackend> HostController<Backend> {
    pub(crate) fn new(backend: Backend, event_tx: SyncSender<WriterEvent>) -> Self {
        Self {
            backend,
            event_tx,
            configuration: None,
            stream: None,
            command_tx: None,
            retired_rx: None,
            signals: Arc::new(StreamSignals::default()),
            latest_plan: None,
            latest_generation: 0,
            backend_state: "stopped",
            device_state: "unavailable",
            active_device_id: None,
            desired_audio_running: false,
            requested_configuration: None,
            recovery_attempt: 0,
            next_recovery_at: None,
            metronome_enabled: false,
            metronome_volume: 0.65,
        }
    }

    pub(crate) fn dispatch(&mut self, command: EngineCommand) -> Result<bool, ()> {
        self.drain_retired();
        self.observe_stream_failure()?;
        match command {
            EngineCommand::Handshake(handshake) => {
                if handshake.peer != HandshakePeer::Application {
                    self.emit(EngineEvent::FatalError {
                        code: "protocol.invalid-envelope".to_owned(),
                        message: "Native host requires an application peer.".to_owned(),
                    })?;
                    return Ok(false);
                }
                self.emit(EngineEvent::Ready {
                    protocol_version: ENGINE_PROTOCOL_VERSION,
                })?;
                self.emit(EngineEvent::Capabilities {
                    capabilities: NATIVE_HOST_CAPABILITY_CODES
                        .iter()
                        .map(|capability| (*capability).to_owned())
                        .collect(),
                    limits: ProtocolLimits::current(),
                })?;
                self.refresh_devices()?;
                self.emit_health()?;
            }
            EngineCommand::ConfigureAudio(configuration) => {
                self.configure_audio(&configuration)?;
            }
            EngineCommand::StartAudio => self.start_audio()?,
            EngineCommand::StopAudio => self.stop_audio()?,
            EngineCommand::LoadRenderPlan(plan) => self.load_plan(plan)?,
            EngineCommand::Play(payload) => {
                self.send_realtime(RealtimeCommand::Play(payload.start_tick))?;
            }
            EngineCommand::Stop => self.send_realtime(RealtimeCommand::Stop)?,
            EngineCommand::Seek(payload) => {
                self.send_realtime(RealtimeCommand::Seek(payload.tick))?;
            }
            EngineCommand::SetLoop(payload) => {
                self.send_realtime(RealtimeCommand::SetLoop {
                    enabled: payload.enabled,
                    start_tick: payload.start_tick,
                    end_tick: payload.end_tick,
                })?;
            }
            EngineCommand::SetMetronomeEnabled(payload) => {
                self.metronome_enabled = payload.enabled;
                if self.command_tx.is_some() {
                    self.send_realtime(RealtimeCommand::SetMetronomeEnabled(payload.enabled))?;
                }
            }
            EngineCommand::SetMetronomeVolume(payload) => {
                self.metronome_volume = payload.volume;
                if self.command_tx.is_some() {
                    self.send_realtime(RealtimeCommand::SetMetronomeVolume(payload.volume))?;
                }
            }
            EngineCommand::NoteOn(payload) => {
                self.note_on(&payload)?;
            }
            EngineCommand::NoteOff(payload) => {
                self.send_realtime(RealtimeCommand::NoteOff(stable_audition_identifier(
                    &payload.audition_id,
                )))?;
            }
            EngineCommand::StartPreview(payload) => {
                self.start_preview(payload)?;
            }
            EngineCommand::CancelPreview(payload) => {
                self.cancel_preview(&payload)?;
            }
            EngineCommand::RequestDiagnostics => self.emit_health()?,
            EngineCommand::RefreshDevices => self.refresh_devices()?,
            EngineCommand::Ping(payload) => {
                self.emit(EngineEvent::Pong {
                    heartbeat_id: payload.heartbeat_id,
                })?;
                self.observe_default_output_change()?;
                self.emit_health()?;
            }
            EngineCommand::Shutdown => {
                self.stop_audio()?;
                return Ok(false);
            }
            EngineCommand::ApplyRenderPlanDelta(_)
            | EngineCommand::PreviewMacro(_)
            | EngineCommand::CommitMacro(_)
            | EngineCommand::StartOfflineRender { .. }
            | EngineCommand::CancelOfflineRender(_) => {
                self.emit_diagnostic(
                    "protocol.unsupported-command",
                    "Command is not available in the native shared-output host.",
                )?;
            }
        }
        self.recover_audio_if_due()?;
        Ok(true)
    }

    fn note_on(&mut self, payload: &NoteOnPayload) -> Result<(), ()> {
        let Some(patch) = self
            .latest_plan
            .as_ref()
            .and_then(|plan| audition_patch_for_layer(plan, &payload.layer_id))
        else {
            return self.emit_diagnostic(
                "engine.invalid-plan",
                "Audition requires the requested active instrument layer.",
            );
        };
        let identifier = stable_audition_identifier(&payload.audition_id);
        match patch {
            AuditionPatch::Synth(patch) => self.send_realtime(RealtimeCommand::NoteOn {
                identifier,
                pitch: payload.pitch,
                velocity: payload.velocity,
                patch,
            }),
            AuditionPatch::Drums(patch) => {
                let instrument = drum_instrument_for_pitch(payload.pitch);
                self.send_realtime(RealtimeCommand::DrumHit {
                    identifier,
                    instrument,
                    velocity: payload.velocity,
                    patch: patch.voice(instrument).clone(),
                })
            }
        }
    }

    fn start_preview(&mut self, payload: PreviewProgramPayload) -> Result<(), ()> {
        let Some(sample_rate) = self
            .configuration
            .as_ref()
            .filter(|_| self.stream.is_some())
            .map(|configuration| configuration.negotiated.sample_rate)
        else {
            return self
                .emit_diagnostic("audio.suspended", "The shared-output stream is not active.");
        };
        let Some(patch) = self
            .latest_plan
            .as_ref()
            .and_then(|plan| synth_patch_for_layer(plan, &payload.layer_id))
        else {
            return self.emit_diagnostic(
                "engine.invalid-plan",
                "Preview requires the requested active synth layer.",
            );
        };
        let Some(prepared) = PreparedPreview::prepare(payload, sample_rate, patch) else {
            return self
                .emit_diagnostic("engine.invalid-plan", "Preview program preparation failed.");
        };
        self.send_realtime(RealtimeCommand::StartPreview(prepared))
    }

    fn cancel_preview(&mut self, payload: &PreviewIdentifierPayload) -> Result<(), ()> {
        let Some(preview_id) = PreviewId::new(&payload.preview_id) else {
            return self.emit_diagnostic(
                "protocol.invalid-envelope",
                "Preview identifier is invalid.",
            );
        };
        self.send_realtime(RealtimeCommand::CancelPreview {
            preview_id,
            reason: PreviewEndReason::Canceled,
        })
    }

    pub(crate) fn shutdown(&mut self) {
        let _ = self.stop_audio();
    }

    fn configure_audio(&mut self, requested: &AudioConfiguration) -> Result<(), ()> {
        if self.stream.is_some() {
            self.emit_diagnostic(
                "audio.configuration-unsupported",
                "Stop the active stream before changing its configuration.",
            )?;
            return Ok(());
        }
        self.requested_configuration = Some(requested.clone());
        self.configuration = None;
        self.reset_recovery();
        match self.backend.negotiate(requested) {
            Ok(configuration) => {
                self.device_state = "available";
                self.configuration = Some(configuration);
                self.emit_health()
            }
            Err(error) => self.handle_backend_error(error),
        }
    }

    fn start_audio(&mut self) -> Result<(), ()> {
        self.desired_audio_running = true;
        self.reset_recovery();
        if self.stream.is_some() {
            return self.emit_health();
        }
        if self.configuration.is_none() {
            self.schedule_immediate_recovery();
            return self.recover_audio_if_due();
        }
        self.start_configured_audio()
    }

    fn start_configured_audio(&mut self) -> Result<(), ()> {
        let Some(configuration) = self.configuration.as_ref() else {
            return self.handle_backend_error(AudioBackendError {
                code: "audio.configuration-unsupported",
                message: "Configure shared output before starting audio.",
                device_lost: false,
            });
        };
        self.backend_state = "starting";
        self.emit_health()?;
        self.signals.reset();
        let (command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (realtime_event_tx, realtime_event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        self.event_tx
            .try_send(WriterEvent::InstallRealtime(realtime_event_rx))
            .map_err(|_| ())?;
        let mut engine = create_engine(configuration.negotiated.sample_rate);
        engine.set_metronome_enabled(self.metronome_enabled);
        engine.set_metronome_volume(self.metronome_volume);
        if let Some(plan) = self.latest_plan.clone() {
            let Ok(prepared) = PreparedPlan::prepare(
                plan,
                configuration.negotiated.sample_rate,
                self.latest_generation,
            ) else {
                self.backend_state = "failed";
                self.emit_diagnostic("engine.invalid-plan", "Render plan preparation failed.")?;
                return Ok(());
            };
            if engine.publish_plan(prepared).is_err() {
                self.backend_state = "failed";
                self.emit_diagnostic("engine.invalid-plan", "Render plan activation failed.")?;
                return Ok(());
            }
        }
        let realtime = RealtimeEngine::new(
            engine,
            configuration.negotiated.sample_rate,
            command_rx,
            retired_tx,
            realtime_event_tx,
            Arc::clone(&self.signals),
        );
        match self
            .backend
            .start(configuration, realtime, Arc::clone(&self.signals))
        {
            Ok(stream) => {
                self.active_device_id = Some(configuration.negotiated.device.id.clone());
                self.command_tx = Some(command_tx);
                self.retired_rx = Some(retired_rx);
                self.stream = Some(stream);
                self.backend_state = "ready";
                self.device_state = "available";
                self.reset_recovery();
                self.emit(EngineEvent::ActiveDeviceChanged {
                    device_id: self.active_device_id.clone(),
                })?;
                self.emit_health()
            }
            Err(error) => {
                self.command_tx = None;
                self.retired_rx = None;
                self.configuration = None;
                self.handle_backend_error(error)
            }
        }
    }

    fn stop_audio(&mut self) -> Result<(), ()> {
        self.desired_audio_running = false;
        self.reset_recovery();
        self.stop_stream();
        self.configuration = None;
        self.backend_state = "stopped";
        self.device_state = "unavailable";
        self.emit(EngineEvent::ActiveDeviceChanged { device_id: None })?;
        self.emit_health()
    }

    fn stop_stream(&mut self) {
        if let Some(sender) = self.command_tx.take() {
            let mut sender = sender;
            let _ = sender.push(RealtimeCommand::Shutdown);
        }
        if let Some(stream) = self.stream.take() {
            stream.stop();
        }
        self.drain_retired();
        self.retired_rx = None;
        self.active_device_id = None;
        self.signals.active_voices.store(0, Ordering::Release);
    }

    fn load_plan(&mut self, plan: RenderPlan) -> Result<(), ()> {
        self.latest_generation = self.latest_generation.saturating_add(1);
        if self.latest_generation == 0 || self.latest_generation > MAX_SAFE_INTEGER {
            self.emit_diagnostic(
                "engine.limit-exceeded",
                "Render plan generation is exhausted.",
            )?;
            return Ok(());
        }
        if let Some(configuration) = self.configuration.as_ref() {
            if self.stream.is_some() {
                let Ok(prepared) = PreparedPlan::prepare(
                    plan.clone(),
                    configuration.negotiated.sample_rate,
                    self.latest_generation,
                ) else {
                    self.emit_diagnostic("engine.invalid-plan", "Render plan preparation failed.")?;
                    return Ok(());
                };
                self.send_realtime(RealtimeCommand::PublishPlan(prepared))?;
            }
        }
        self.latest_plan = Some(plan);
        Ok(())
    }

    fn send_realtime(&mut self, command: RealtimeCommand) -> Result<(), ()> {
        let Some(sender) = self.command_tx.as_mut() else {
            self.emit_diagnostic("audio.suspended", "The shared-output stream is not active.")?;
            return Ok(());
        };
        match sender.push(command) {
            Ok(()) => Ok(()),
            Err(PushError::Full(command)) => {
                drop(command);
                self.emit_diagnostic(
                    "audio.render-overload",
                    "The bounded audio control queue is saturated.",
                )
            }
        }
    }

    fn refresh_devices(&mut self) -> Result<(), ()> {
        match self.backend.devices() {
            Ok(devices) => {
                self.device_state = if devices.is_empty() {
                    "unavailable"
                } else {
                    "available"
                };
                self.emit(EngineEvent::AudioDevicesChanged { devices })
            }
            Err(error) => self.handle_backend_error(error),
        }
    }

    fn observe_stream_failure(&mut self) -> Result<(), ()> {
        if !self.signals.stream_error.swap(false, Ordering::AcqRel) {
            return Ok(());
        }
        self.begin_output_recovery(
            "lost",
            "audio.device-lost",
            "The active output device was lost.",
        )
    }

    fn observe_default_output_change(&mut self) -> Result<(), ()> {
        if !self.desired_audio_running || self.stream.is_none() {
            return Ok(());
        }
        match self.backend.default_device_id() {
            Ok(Some(identifier))
                if Some(identifier.as_str()) == self.active_device_id.as_deref() =>
            {
                Ok(())
            }
            Ok(Some(_)) => self.begin_output_recovery(
                "available",
                "audio.device-changed",
                "The default shared-output device changed.",
            ),
            Ok(None) => self.begin_output_recovery(
                "unavailable",
                "audio.device-lost",
                "No default shared-output device is available.",
            ),
            Err(error) => self.begin_output_recovery(
                if error.device_lost {
                    "lost"
                } else {
                    "unavailable"
                },
                error.code,
                error.message,
            ),
        }
    }

    fn begin_output_recovery(
        &mut self,
        device_state: &'static str,
        diagnostic_code: &str,
        diagnostic_message: &str,
    ) -> Result<(), ()> {
        self.stop_stream();
        self.configuration = None;
        self.backend_state = "starting";
        self.device_state = device_state;
        self.schedule_immediate_recovery();
        self.emit(EngineEvent::ActiveDeviceChanged { device_id: None })?;
        self.emit_diagnostic(diagnostic_code, diagnostic_message)?;
        self.emit_health()
    }

    fn handle_backend_error(&mut self, error: AudioBackendError) -> Result<(), ()> {
        self.configuration = None;
        self.backend_state = if self.desired_audio_running {
            self.schedule_recovery();
            "starting"
        } else {
            "failed"
        };
        self.device_state = if error.device_lost {
            "lost"
        } else {
            "unavailable"
        };
        self.emit_diagnostic(error.code, error.message)?;
        self.emit_health()
    }

    fn recover_audio_if_due(&mut self) -> Result<(), ()> {
        if !self.desired_audio_running || self.stream.is_some() {
            return Ok(());
        }
        let Some(deadline) = self.next_recovery_at else {
            return Ok(());
        };
        if Instant::now() < deadline {
            return Ok(());
        }
        self.next_recovery_at = None;
        let Some(requested) = self.requested_configuration.clone() else {
            return self.handle_backend_error(AudioBackendError {
                code: "audio.configuration-unsupported",
                message: "No desired shared-output configuration is available.",
                device_lost: false,
            });
        };
        self.backend_state = "starting";
        self.emit_health()?;
        match self.backend.negotiate(&requested) {
            Ok(configuration) => {
                self.device_state = "available";
                self.configuration = Some(configuration);
                self.start_configured_audio()
            }
            Err(error) => self.handle_backend_error(error),
        }
    }

    fn schedule_immediate_recovery(&mut self) {
        if self.desired_audio_running {
            self.next_recovery_at = Some(Instant::now());
        }
    }

    fn schedule_recovery(&mut self) {
        if !self.desired_audio_running || self.next_recovery_at.is_some() {
            return;
        }
        let delay = recovery_delay(self.recovery_attempt);
        self.recovery_attempt = self.recovery_attempt.saturating_add(1);
        self.next_recovery_at = Some(Instant::now() + delay);
    }

    fn reset_recovery(&mut self) {
        self.recovery_attempt = 0;
        self.next_recovery_at = None;
    }

    fn emit_health(&self) -> Result<(), ()> {
        let negotiated = self.configuration.as_ref().map(|value| &value.negotiated);
        let active_voices = self.signals.active_voices.load(Ordering::Acquire);
        let output_signal_observed = self.signals.output_signal_observed.load(Ordering::Acquire);
        self.emit(EngineEvent::AudioHealth {
            active_device_id: self.active_device_id.clone(),
            active_voices,
            backend_state: self.backend_state.to_owned(),
            block_frames: negotiated.and_then(|value| value.block_frames),
            device_state: self.device_state.to_owned(),
            mode: negotiated.map(|_| "shared".to_owned()),
            output_muted: active_voices > 0 && !output_signal_observed,
            output_signal_observed,
            project_revision: nonzero(self.signals.project_revision.load(Ordering::Acquire)),
            sample_rate: negotiated.map(|value| value.sample_rate),
            underruns: self.signals.render_overloads.load(Ordering::Acquire),
        })
    }

    fn emit_diagnostic(&self, code: &str, message: &str) -> Result<(), ()> {
        self.emit(EngineEvent::Diagnostic {
            code: code.to_owned(),
            message: message.to_owned(),
            project_revision: self
                .latest_plan
                .as_ref()
                .map(|plan| plan.project_revision.value()),
        })
    }

    fn emit(&self, event: EngineEvent) -> Result<(), ()> {
        self.event_tx
            .try_send(WriterEvent::Engine(event))
            .map_err(|_| ())
    }

    fn drain_retired(&mut self) {
        if let Some(receiver) = self.retired_rx.as_mut() {
            while let Ok(allocation) = receiver.pop() {
                match allocation {
                    RetiredRealtimeAllocation::Plan(plan) => drop(plan),
                    RetiredRealtimeAllocation::Preview(preview) => drop(preview),
                }
            }
        }
    }
}

impl<Backend: OutputBackend> Drop for HostController<Backend> {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub(crate) fn null_controller(
    event_tx: SyncSender<WriterEvent>,
) -> HostController<NullOutputBackend> {
    HostController::new(NullOutputBackend, event_tx)
}

fn recovery_delay(attempt: u32) -> Duration {
    let multiplier = 1_u32.checked_shl(attempt.min(4)).unwrap_or(16);
    RECOVERY_BASE_DELAY
        .saturating_mul(multiplier)
        .min(RECOVERY_MAX_DELAY)
}

pub(crate) fn run_shared_stdio() -> i32 {
    let (event_tx, event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
    let writer_failed = Arc::new(AtomicBool::new(false));
    let writer_failure = Arc::clone(&writer_failed);
    let writer = thread::Builder::new()
        .name("tiempio-protocol-writer".to_owned())
        .spawn(move || write_events(&event_rx, &writer_failure));
    let Ok(writer) = writer else {
        return 70;
    };
    let mut session = ProtocolSession::native_host();
    let mut controller = HostController::new(SharedOutputBackend::new(), event_tx.clone());
    let mut input = io::stdin().lock();
    let mut exit_code = 0;
    loop {
        if writer_failed.load(Ordering::Acquire) {
            exit_code = 74;
            break;
        }
        let body = match read_frame(&mut input) {
            Ok(Some(body)) => body,
            Ok(None) => break,
            Err(code) => {
                let _ = event_tx.try_send(WriterEvent::Engine(EngineEvent::FatalError {
                    code: code.to_owned(),
                    message: "Native-host protocol framing failed.".to_owned(),
                }));
                exit_code = 65;
                break;
            }
        };
        let envelope = match session.accept_body(&body) {
            Ok(envelope) => envelope,
            Err(error) => {
                let fatal = session.state() == ProtocolSessionState::Terminated;
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
                let _ = event_tx.try_send(WriterEvent::Engine(event));
                if fatal {
                    exit_code = 65;
                    break;
                }
                continue;
            }
        };
        match controller.dispatch(envelope.command) {
            Ok(true) => {}
            Ok(false) => break,
            Err(()) => {
                exit_code = 74;
                break;
            }
        }
    }
    controller.shutdown();
    drop(controller);
    drop(event_tx);
    let _ = writer.join();
    exit_code
}

pub(crate) fn read_frame(input: &mut impl Read) -> Result<Option<Vec<u8>>, &'static str> {
    let mut prefix = [0_u8; 4];
    let mut read = 0;
    while read < prefix.len() {
        match input.read(&mut prefix[read..]) {
            Ok(0) if read == 0 => return Ok(None),
            Ok(0) => return Err("protocol.invalid-envelope"),
            Ok(count) => read += count,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => return Err("engine.unavailable"),
        }
    }
    let declared = u32::from_be_bytes(prefix) as usize;
    if declared > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
        return Err("protocol.frame-too-large");
    }
    let mut body = vec![0_u8; declared];
    input
        .read_exact(&mut body)
        .map_err(|_| "protocol.invalid-envelope")?;
    Ok(Some(body))
}

fn write_events(receiver: &Receiver<WriterEvent>, failed: &AtomicBool) {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let mut sequence = 0_u64;
    let mut realtime: Option<Consumer<RealtimeEvent>> = None;
    loop {
        if let Some(consumer) = realtime.as_mut() {
            while let Ok(event) = consumer.pop() {
                let event = map_realtime_event(event);
                if write_event(&mut output, &mut sequence, &event).is_err() {
                    failed.store(true, Ordering::Release);
                    return;
                }
            }
        }
        match receiver.recv_timeout(Duration::from_millis(2)) {
            Ok(WriterEvent::Engine(event)) => {
                if write_event(&mut output, &mut sequence, &event).is_err() {
                    failed.store(true, Ordering::Release);
                    return;
                }
            }
            Ok(WriterEvent::InstallRealtime(consumer)) => realtime = Some(consumer),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                if let Some(consumer) = realtime.as_mut() {
                    while let Ok(event) = consumer.pop() {
                        let event = map_realtime_event(event);
                        if write_event(&mut output, &mut sequence, &event).is_err() {
                            failed.store(true, Ordering::Release);
                            return;
                        }
                    }
                }
                return;
            }
        }
    }
}

fn write_event(output: &mut impl Write, sequence: &mut u64, event: &EngineEvent) -> Result<(), ()> {
    let body = encode_event_body(*sequence, event).map_err(|_| ())?;
    let frame = encode_frame(&body).map_err(|_| ())?;
    output.write_all(&frame).map_err(|_| ())?;
    output.flush().map_err(|_| ())?;
    *sequence = sequence.saturating_add(1);
    Ok(())
}

fn nonzero(value: u64) -> Option<u64> {
    (value > 0).then_some(value)
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::sync::atomic::AtomicUsize;

    use serde_json::json;

    use super::*;
    use tiempio_engine_core::DrumInstrument;

    #[derive(Clone)]
    struct SwitchingBackend {
        state: Arc<Mutex<SwitchingBackendState>>,
        stops: Arc<AtomicUsize>,
    }

    struct SwitchingBackendState {
        available: bool,
        device_id: String,
        sample_rate: u32,
        start_failures: usize,
        starts: usize,
    }

    struct SwitchingPrivateConfiguration;

    struct SwitchingStream {
        realtime: RealtimeEngine,
        signals: Arc<StreamSignals>,
        stops: Arc<AtomicUsize>,
    }

    impl RunningOutput for SwitchingStream {
        fn stop(self) {
            self.signals.shutdown.store(true, Ordering::Release);
            self.stops.fetch_add(1, Ordering::AcqRel);
            drop(self.realtime);
        }
    }

    impl SwitchingBackend {
        fn new(available: bool) -> Self {
            Self {
                state: Arc::new(Mutex::new(SwitchingBackendState {
                    available,
                    device_id: "device.test-a".to_owned(),
                    sample_rate: 48_000,
                    start_failures: 0,
                    starts: 0,
                })),
                stops: Arc::new(AtomicUsize::new(0)),
            }
        }

        fn set_output(&self, available: bool, device_id: &str, sample_rate: u32) {
            let mut state = self.state.lock().unwrap();
            state.available = available;
            state.device_id = device_id.to_owned();
            state.sample_rate = sample_rate;
        }

        fn fail_next_start(&self) {
            self.state.lock().unwrap().start_failures += 1;
        }

        fn starts(&self) -> usize {
            self.state.lock().unwrap().starts
        }
    }

    impl OutputBackend for SwitchingBackend {
        type PrivateConfiguration = SwitchingPrivateConfiguration;
        type Stream = SwitchingStream;

        fn devices(
            &self,
        ) -> Result<Vec<tiempio_engine_protocol::AudioDeviceDescriptor>, AudioBackendError>
        {
            let state = self.state.lock().unwrap();
            if !state.available {
                return Ok(Vec::new());
            }
            Ok(vec![tiempio_engine_protocol::AudioDeviceDescriptor {
                id: state.device_id.clone(),
                label: "Controlled output".to_owned(),
                default: true,
            }])
        }

        fn default_device_id(&self) -> Result<Option<String>, AudioBackendError> {
            let state = self.state.lock().unwrap();
            Ok(state.available.then(|| state.device_id.clone()))
        }

        fn negotiate(
            &self,
            requested: &AudioConfiguration,
        ) -> Result<BackendConfiguration<Self::PrivateConfiguration>, AudioBackendError> {
            let state = self.state.lock().unwrap();
            if !state.available {
                return Err(AudioBackendError {
                    code: "audio.device-unavailable",
                    message: "No compatible output device is available.",
                    device_lost: false,
                });
            }
            Ok(BackendConfiguration {
                negotiated: crate::backend::NegotiatedOutput {
                    device: tiempio_engine_protocol::AudioDeviceDescriptor {
                        id: state.device_id.clone(),
                        label: "Controlled output".to_owned(),
                        default: true,
                    },
                    sample_rate: state.sample_rate,
                    block_frames: Some(requested.block_frames),
                    channels: 2,
                    sample_format: crate::backend::OutputSampleFormat::F32,
                },
                private: SwitchingPrivateConfiguration,
            })
        }

        fn start(
            &self,
            _configuration: &BackendConfiguration<Self::PrivateConfiguration>,
            realtime: RealtimeEngine,
            signals: Arc<StreamSignals>,
        ) -> Result<Self::Stream, AudioBackendError> {
            let mut state = self.state.lock().unwrap();
            if !state.available {
                return Err(AudioBackendError {
                    code: "audio.device-lost",
                    message: "The active output device was lost.",
                    device_lost: true,
                });
            }
            if state.start_failures > 0 {
                state.start_failures -= 1;
                return Err(AudioBackendError {
                    code: "audio.start-failed",
                    message: "The shared-output stream could not be started.",
                    device_lost: false,
                });
            }
            state.starts += 1;
            drop(state);
            signals.callback_count.store(1, Ordering::Release);
            Ok(SwitchingStream {
                realtime,
                signals,
                stops: Arc::clone(&self.stops),
            })
        }
    }

    fn requested_configuration() -> AudioConfiguration {
        AudioConfiguration {
            sample_rate: 48_000,
            block_frames: 512,
            channels: 2,
        }
    }

    fn fixture_plan() -> RenderPlan {
        let plan: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        let body = serde_json::to_vec(&json!({
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "requestId": "test.plan",
            "sequence": 0,
            "type": "load-render-plan",
            "payload": { "plan": plan }
        }))
        .unwrap();
        let EngineCommand::LoadRenderPlan(plan) =
            tiempio_engine_protocol::decode_command_body(&body)
                .unwrap()
                .command
        else {
            panic!("expected plan command");
        };
        plan
    }

    #[test]
    fn framed_reader_rejects_oversized_and_truncated_input_before_dispatch() {
        let oversized = u32::try_from(ENGINE_PROTOCOL_MAX_FRAME_BYTES + 1)
            .unwrap()
            .to_be_bytes();
        assert_eq!(
            read_frame(&mut oversized.as_slice()),
            Err("protocol.frame-too-large")
        );
        let truncated = [0, 0, 0, 2, b'{'];
        assert_eq!(
            read_frame(&mut truncated.as_slice()),
            Err("protocol.invalid-envelope")
        );
    }

    #[test]
    fn audition_identifier_is_stable_and_wire_safe() {
        let first = stable_audition_identifier("audition.keyboard.c1");
        assert_eq!(first, stable_audition_identifier("audition.keyboard.c1"));
        assert_ne!(first, stable_audition_identifier("audition.keyboard.c2"));
        assert!(first <= MAX_SAFE_INTEGER);
    }

    #[test]
    fn maps_general_midi_drum_pitches_to_the_five_procedural_voices() {
        assert_eq!(drum_instrument_for_pitch(36), DrumInstrument::Kick);
        assert_eq!(drum_instrument_for_pitch(39), DrumInstrument::Clap);
        assert_eq!(drum_instrument_for_pitch(42), DrumInstrument::ClosedHat);
        assert_eq!(drum_instrument_for_pitch(46), DrumInstrument::OpenHat);
        assert_eq!(drum_instrument_for_pitch(56), DrumInstrument::Perc);
    }

    #[test]
    fn opens_the_latest_plan_when_an_initially_missing_output_appears() {
        let backend = SwitchingBackend::new(false);
        let backend_control = backend.clone();
        let (event_tx, _event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
        let mut controller = HostController::new(backend, event_tx);
        controller
            .dispatch(EngineCommand::ConfigureAudio(requested_configuration()))
            .unwrap();
        controller.dispatch(EngineCommand::StartAudio).unwrap();
        controller
            .dispatch(EngineCommand::LoadRenderPlan(fixture_plan()))
            .unwrap();
        assert_eq!(controller.backend_state, "starting");
        assert!(controller.stream.is_none());
        assert!(controller.latest_plan.is_some());

        backend_control.set_output(true, "device.test-speakers", 44_100);
        thread::sleep(RECOVERY_BASE_DELAY + Duration::from_millis(25));
        controller
            .dispatch(EngineCommand::RequestDiagnostics)
            .unwrap();
        assert_eq!(controller.backend_state, "ready");
        assert_eq!(
            controller.active_device_id.as_deref(),
            Some("device.test-speakers")
        );
        assert!(controller.latest_plan.is_some());
        assert_eq!(backend_control.starts(), 1);
    }

    #[test]
    fn recovers_the_latest_plan_on_a_new_default_output() {
        let backend = SwitchingBackend::new(true);
        let backend_control = backend.clone();
        let (event_tx, _event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
        let mut controller = HostController::new(backend, event_tx);
        controller
            .dispatch(EngineCommand::ConfigureAudio(requested_configuration()))
            .unwrap();
        controller
            .dispatch(EngineCommand::LoadRenderPlan(fixture_plan()))
            .unwrap();
        controller.dispatch(EngineCommand::StartAudio).unwrap();
        assert_eq!(controller.backend_state, "ready");
        assert_eq!(
            controller.active_device_id.as_deref(),
            Some("device.test-a")
        );
        assert_eq!(backend_control.starts(), 1);

        backend_control.set_output(true, "device.test-b", 44_100);
        controller
            .dispatch(EngineCommand::Ping(
                tiempio_engine_protocol::HeartbeatPayload {
                    heartbeat_id: "test.default-change".to_owned(),
                },
            ))
            .unwrap();
        assert_eq!(controller.backend_state, "ready");
        assert_eq!(
            controller.active_device_id.as_deref(),
            Some("device.test-b")
        );
        assert_eq!(backend_control.starts(), 2);

        backend_control.set_output(false, "device.none", 48_000);
        controller
            .signals
            .stream_error
            .store(true, Ordering::Release);
        controller
            .dispatch(EngineCommand::RequestDiagnostics)
            .unwrap();
        assert_eq!(controller.backend_state, "starting");
        assert_eq!(controller.device_state, "unavailable");
        assert!(controller.stream.is_none());

        backend_control.set_output(true, "device.test-c", 44_100);
        thread::sleep(RECOVERY_BASE_DELAY + Duration::from_millis(25));
        controller
            .dispatch(EngineCommand::RequestDiagnostics)
            .unwrap();
        assert_eq!(controller.backend_state, "ready");
        assert_eq!(
            controller.active_device_id.as_deref(),
            Some("device.test-c")
        );
        assert_eq!(
            controller
                .configuration
                .as_ref()
                .map(|configuration| configuration.negotiated.sample_rate),
            Some(44_100)
        );
        assert!(controller.latest_plan.is_some());
        assert_eq!(backend_control.starts(), 3);
        assert_eq!(backend_control.stops.load(Ordering::Acquire), 2);
    }

    #[test]
    fn retries_a_failed_reopen_but_explicit_stop_cancels_future_recovery() {
        let backend = SwitchingBackend::new(true);
        let backend_control = backend.clone();
        let (event_tx, _event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
        let mut controller = HostController::new(backend, event_tx);
        controller
            .dispatch(EngineCommand::ConfigureAudio(requested_configuration()))
            .unwrap();
        backend_control.fail_next_start();
        controller.dispatch(EngineCommand::StartAudio).unwrap();
        assert_eq!(controller.backend_state, "starting");
        assert_eq!(backend_control.starts(), 0);

        thread::sleep(RECOVERY_BASE_DELAY + Duration::from_millis(25));
        controller
            .dispatch(EngineCommand::RequestDiagnostics)
            .unwrap();
        assert_eq!(controller.backend_state, "ready");
        assert_eq!(backend_control.starts(), 1);

        backend_control.set_output(false, "device.none", 48_000);
        controller
            .signals
            .stream_error
            .store(true, Ordering::Release);
        controller.dispatch(EngineCommand::StopAudio).unwrap();
        backend_control.set_output(true, "device.test-c", 48_000);
        thread::sleep(RECOVERY_BASE_DELAY + Duration::from_millis(25));
        controller
            .dispatch(EngineCommand::RequestDiagnostics)
            .unwrap();
        assert_eq!(controller.backend_state, "stopped");
        assert_eq!(backend_control.starts(), 1);
    }

    #[test]
    fn recovery_backoff_is_bounded() {
        assert_eq!(recovery_delay(0), Duration::from_millis(250));
        assert_eq!(recovery_delay(1), Duration::from_millis(500));
        assert_eq!(recovery_delay(4), Duration::from_secs(4));
        assert_eq!(recovery_delay(u32::MAX), Duration::from_secs(4));
    }

    #[test]
    fn retains_metronome_preferences_while_the_audio_stream_is_absent() {
        let (event_tx, _event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
        let mut controller = HostController::new(SwitchingBackend::new(false), event_tx);
        controller
            .dispatch(EngineCommand::SetMetronomeEnabled(
                tiempio_engine_protocol::MetronomeEnabledPayload { enabled: true },
            ))
            .unwrap();
        controller
            .dispatch(EngineCommand::SetMetronomeVolume(
                tiempio_engine_protocol::MetronomeVolumePayload { volume: 0.4 },
            ))
            .unwrap();
        assert!(controller.metronome_enabled);
        assert!((controller.metronome_volume - 0.4).abs() < f64::EPSILON);
    }
}
