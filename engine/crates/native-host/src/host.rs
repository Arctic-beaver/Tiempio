use std::io::{self, Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::Duration;

use rtrb::{Consumer, Producer, PushError, RingBuffer};
use tiempio_engine_core::{MAX_SAFE_INTEGER, PreparedPlan, RenderPlan};
use tiempio_engine_protocol::{
    AudioConfiguration, ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_VERSION, EngineCommand,
    EngineEvent, HandshakePeer, ProtocolLimits, ProtocolSession, ProtocolSessionState,
    encode_event_body, encode_frame,
};

use crate::backend::{
    AudioBackendError, BackendConfiguration, NullOutputBackend, OutputBackend, RunningOutput,
    SharedOutputBackend,
};
use crate::realtime::{
    CONTROL_QUEUE_CAPACITY, EVENT_QUEUE_CAPACITY, RealtimeCommand, RealtimeDiagnostic,
    RealtimeEngine, RealtimeEvent, StreamSignals, create_engine,
};

const HOST_CAPABILITIES: &[&str] = &[
    "protocol.typed-json",
    "render-plan.full",
    "transport.basic",
    "transport.loop",
    "synth.bass.deep",
    "audition.notes",
    "diagnostics.health",
    "supervision.heartbeat",
    "audio.native.shared",
    "audio.devices",
];

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
    retired_rx: Option<Consumer<PreparedPlan>>,
    signals: Arc<StreamSignals>,
    latest_plan: Option<RenderPlan>,
    latest_generation: u64,
    backend_state: &'static str,
    device_state: &'static str,
    active_device_id: Option<String>,
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
                    capabilities: HOST_CAPABILITIES
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
            EngineCommand::NoteOn(payload) => {
                let Some(patch) = self
                    .latest_plan
                    .as_ref()
                    .and_then(|plan| plan.layers.first())
                    .map(|layer| layer.patch.clone())
                else {
                    self.emit_diagnostic(
                        "engine.invalid-plan",
                        "Audition requires an active Bass render plan.",
                    )?;
                    return Ok(true);
                };
                self.send_realtime(RealtimeCommand::NoteOn {
                    identifier: stable_audition_identifier(&payload.audition_id),
                    pitch: payload.pitch,
                    velocity: payload.velocity,
                    patch,
                })?;
            }
            EngineCommand::NoteOff(payload) => {
                self.send_realtime(RealtimeCommand::NoteOff(stable_audition_identifier(
                    &payload.audition_id,
                )))?;
            }
            EngineCommand::RequestDiagnostics => self.emit_health()?,
            EngineCommand::RefreshDevices => self.refresh_devices()?,
            EngineCommand::Ping(payload) => {
                self.emit(EngineEvent::Pong {
                    heartbeat_id: payload.heartbeat_id,
                })?;
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
        Ok(true)
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
        if self.stream.is_some() {
            return self.emit_health();
        }
        let Some(configuration) = self.configuration.as_ref() else {
            self.emit_diagnostic(
                "audio.configuration-unsupported",
                "Configure shared output before starting audio.",
            )?;
            return Ok(());
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
                self.emit(EngineEvent::ActiveDeviceChanged {
                    device_id: self.active_device_id.clone(),
                })?;
                self.emit_health()
            }
            Err(error) => {
                self.backend_state = "failed";
                self.command_tx = None;
                self.retired_rx = None;
                self.handle_backend_error(error)
            }
        }
    }

    fn stop_audio(&mut self) -> Result<(), ()> {
        if let Some(sender) = self.command_tx.take() {
            let mut sender = sender;
            let _ = sender.push(RealtimeCommand::Shutdown);
        }
        if let Some(stream) = self.stream.take() {
            stream.stop();
        }
        self.drain_retired();
        self.retired_rx = None;
        self.backend_state = "stopped";
        self.active_device_id = None;
        self.signals.active_voices.store(0, Ordering::Release);
        self.emit(EngineEvent::ActiveDeviceChanged { device_id: None })?;
        self.emit_health()
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
        if let Some(stream) = self.stream.take() {
            stream.stop();
        }
        self.command_tx = None;
        self.drain_retired();
        self.retired_rx = None;
        self.backend_state = "failed";
        self.device_state = "lost";
        self.active_device_id = None;
        self.emit(EngineEvent::ActiveDeviceChanged { device_id: None })?;
        self.emit_diagnostic("audio.device-lost", "The active output device was lost.")?;
        self.emit_health()
    }

    fn handle_backend_error(&mut self, error: AudioBackendError) -> Result<(), ()> {
        self.device_state = if error.device_lost {
            "lost"
        } else {
            "unavailable"
        };
        self.emit_diagnostic(error.code, error.message)?;
        self.emit_health()
    }

    fn emit_health(&self) -> Result<(), ()> {
        let negotiated = self.configuration.as_ref().map(|value| &value.negotiated);
        let active_voices = self.signals.active_voices.load(Ordering::Acquire);
        let output_signal_observed = self.signals.output_signal_observed.load(Ordering::Acquire);
        self.emit(EngineEvent::AudioHealth {
            active_device_id: self.active_device_id.clone(),
            active_voices,
            backend_state: self.backend_state.to_owned(),
            block_frames: negotiated.map(|value| value.block_frames),
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
            while let Ok(plan) = receiver.pop() {
                drop(plan);
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

pub(crate) fn map_realtime_event(event: RealtimeEvent) -> EngineEvent {
    match event {
        RealtimeEvent::PlanAcknowledged {
            project_revision,
            plan_generation,
        } => EngineEvent::RenderPlanAcknowledged {
            project_revision,
            plan_generation,
        },
        RealtimeEvent::Transport {
            playing,
            project_revision,
            sample_position,
            tick,
        } => EngineEvent::TransportSnapshot {
            playing,
            project_revision,
            sample_position,
            tick,
        },
        RealtimeEvent::Meter {
            left_peak,
            right_peak,
        } => EngineEvent::MeterSnapshot {
            left_peak,
            right_peak,
        },
        RealtimeEvent::RealtimeDiagnostic(diagnostic) => match diagnostic {
            RealtimeDiagnostic::ControlFailure => EngineEvent::Diagnostic {
                code: "engine.invalid-plan".to_owned(),
                message: "A real-time engine control could not be applied.".to_owned(),
                project_revision: None,
            },
            RealtimeDiagnostic::NonFiniteOutput => EngineEvent::Diagnostic {
                code: "audio.non-finite-output".to_owned(),
                message: "Non-finite output was replaced with silence.".to_owned(),
                project_revision: None,
            },
            RealtimeDiagnostic::RenderOverload => EngineEvent::Diagnostic {
                code: "audio.render-overload".to_owned(),
                message: "The audio callback exceeded its bounded render budget.".to_owned(),
                project_revision: None,
            },
        },
    }
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

fn stable_audition_identifier(value: &str) -> u64 {
    value.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    }) & MAX_SAFE_INTEGER
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
