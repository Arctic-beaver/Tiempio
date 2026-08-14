use std::io::Cursor;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tiempio_engine_protocol::{
    ENGINE_PROTOCOL_VERSION, EngineEvent, ProtocolSession, encode_frame,
};

use crate::host::{WriterEvent, null_controller, read_frame};
use crate::realtime::{EVENT_QUEUE_CAPACITY, map_realtime_event};

pub(crate) fn run() -> i32 {
    match exercise_null_backend() {
        Ok(()) => {
            println!("PASS native host controlled null-audio self-test");
            0
        }
        Err(message) => {
            eprintln!("FAIL native host controlled null-audio self-test: {message}");
            1
        }
    }
}

fn exercise_null_backend() -> Result<(), &'static str> {
    let (event_tx, event_rx) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
    let mut controller = null_controller(event_tx);
    let mut session = ProtocolSession::native_host();
    let plan: Value = serde_json::from_str(include_str!(
        "../../../../fixtures/engine-protocol/valid-bass-plan.json"
    ))
    .map_err(|_| "fixture parsing failed")?;
    run_commands(&mut session, &mut controller, &plan)?;
    let events = collect_events(&event_rx);
    controller.shutdown();
    assert_null_events(&events)
}

fn collect_events(event_rx: &mpsc::Receiver<WriterEvent>) -> Vec<EngineEvent> {
    let deadline = Instant::now() + Duration::from_secs(1);
    let mut events = Vec::new();
    let mut realtime = None;
    while Instant::now() < deadline {
        match event_rx.recv_timeout(Duration::from_millis(20)) {
            Ok(WriterEvent::Engine(event)) => events.push(event),
            Ok(WriterEvent::InstallRealtime(consumer)) => realtime = Some(consumer),
            Err(mpsc::RecvTimeoutError::Timeout | mpsc::RecvTimeoutError::Disconnected) => break,
        }
        if let Some(consumer) = realtime.as_mut() {
            while let Ok(event) = consumer.pop() {
                events.push(map_realtime_event(event));
            }
        }
    }
    events
}

fn run_commands(
    session: &mut ProtocolSession,
    controller: &mut crate::host::HostController<crate::backend::NullOutputBackend>,
    plan: &Value,
) -> Result<(), &'static str> {
    dispatch(
        session,
        controller,
        0,
        "handshake",
        &json!({
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "peer": "application",
            "renderPlanVersion": 5,
            "patchModelVersion": 4,
            "capabilities": [
                "protocol.typed-json",
                "audio.native.shared",
                "metronome.clock",
                "preview.programs",
                "audio.devices"
            ]
        }),
    )?;
    dispatch(
        session,
        controller,
        1,
        "configure-audio",
        &json!({ "sampleRate": 48_000, "blockFrames": 128, "channels": 2 }),
    )?;
    dispatch(
        session,
        controller,
        2,
        "load-render-plan",
        &json!({ "plan": plan }),
    )?;
    dispatch(session, controller, 3, "start-audio", &json!({}))?;
    dispatch(
        session,
        controller,
        4,
        "note-on",
        &json!({
            "auditionId": "self-test.note",
            "layerId": "layer.bass",
            "pitch": 36,
            "velocity": 110
        }),
    )?;
    thread::sleep(Duration::from_millis(40));
    dispatch(
        session,
        controller,
        5,
        "ping",
        &json!({ "heartbeatId": "self-test.heartbeat" }),
    )?;
    dispatch(
        session,
        controller,
        6,
        "note-off",
        &json!({ "auditionId": "self-test.note" }),
    )?;
    dispatch(session, controller, 7, "stop-audio", &json!({}))?;
    Ok(())
}

fn assert_null_events(events: &[EngineEvent]) -> Result<(), &'static str> {
    assert_event(events, |event| matches!(event, EngineEvent::Ready { .. }))?;
    assert_event(
        events,
        |event| matches!(event, EngineEvent::Capabilities { capabilities, .. } if capabilities.iter().any(|value| value == "audio.native.shared")),
    )?;
    assert_event(
        events,
        |event| matches!(event, EngineEvent::AudioDevicesChanged { devices } if devices.len() == 1 && devices[0].id == "device.null"),
    )?;
    assert_event(events, |event| {
        matches!(
            event,
            EngineEvent::RenderPlanAcknowledged {
                project_revision: 7,
                plan_generation: 1
            }
        )
    })?;
    assert_event(
        events,
        |event| matches!(event, EngineEvent::Pong { heartbeat_id } if heartbeat_id == "self-test.heartbeat"),
    )?;
    assert_event(events, |event| {
        matches!(
            event,
            EngineEvent::AudioHealth {
                output_signal_observed: true,
                ..
            }
        )
    })?;
    Ok(())
}

fn dispatch(
    session: &mut ProtocolSession,
    controller: &mut crate::host::HostController<crate::backend::NullOutputBackend>,
    sequence: u64,
    command_type: &str,
    payload: &Value,
) -> Result<(), &'static str> {
    let body = serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": format!("self-test.{sequence}"),
        "sequence": sequence,
        "type": command_type,
        "payload": payload
    }))
    .map_err(|_| "command serialization failed")?;
    let frame = encode_frame(&body).map_err(|_| "command framing failed")?;
    let framed_body = read_frame(&mut Cursor::new(frame))
        .map_err(|_| "command frame was rejected")?
        .ok_or("command frame was empty")?;
    let envelope = session
        .accept_body(&framed_body)
        .map_err(|_| "protocol command was rejected")?;
    if controller
        .dispatch(envelope.command)
        .map_err(|()| "host event queue failed")?
    {
        Ok(())
    } else {
        Err("host stopped before self-test completion")
    }
}

fn assert_event(
    events: &[EngineEvent],
    predicate: impl Fn(&EngineEvent) -> bool,
) -> Result<(), &'static str> {
    if events.iter().any(predicate) {
        Ok(())
    } else {
        Err("required host event was not observed")
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use allocation_counter::measure;
    use rtrb::RingBuffer;
    use tiempio_engine_core::{LayerSource, PreparedPlan};
    use tiempio_engine_protocol::{EngineCommand, PreviewEventPayload, PreviewProgramPayload};

    use super::*;
    use crate::realtime::{
        CONTROL_QUEUE_CAPACITY, PreparedPreview, RealtimeCommand, RealtimeEngine, StreamSignals,
        create_engine,
    };

    fn fixture_plan() -> tiempio_engine_core::RenderPlan {
        let plan: Value = serde_json::from_str(include_str!(
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
    fn controlled_backend_exercises_the_full_host_surface() {
        exercise_null_backend().unwrap();
    }

    #[test]
    fn warmed_native_callback_path_does_not_allocate_or_deallocate() {
        let sample_rate = 48_000;
        let mut engine = create_engine(sample_rate);
        let plan = fixture_plan();
        let patch = match &plan.layers[0].source {
            LayerSource::Synth { patch, .. } => patch.clone(),
            LayerSource::Drums { .. } => panic!("fixture must start with a synth layer"),
        };
        engine
            .publish_plan(PreparedPlan::prepare(plan, sample_rate, 1).unwrap())
            .unwrap();
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, _retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, _event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let mut realtime = RealtimeEngine::new(
            engine,
            sample_rate,
            command_rx,
            retired_tx,
            event_tx,
            Arc::new(StreamSignals::default()),
        );
        let mut output = [0.0_f32; 256];
        realtime.render_f32_channels(&mut output, 2);
        let preview = PreparedPreview::prepare(
            PreviewProgramPayload {
                preview_id: "preview.allocator.1".to_owned(),
                layer_id: "layer.bass".to_owned(),
                program_version: 1,
                events: vec![PreviewEventPayload {
                    offset_ms: 0,
                    duration_ms: 5_000,
                    pitches: vec![45, 52, 57],
                    velocity: 100,
                }],
            },
            sample_rate,
            patch,
        )
        .unwrap();
        command_tx
            .push(RealtimeCommand::StartPreview(preview))
            .expect("bounded preview command");
        let allocation = measure(|| {
            for _ in 0..64 {
                realtime.render_f32_channels(&mut output, 2);
                std::hint::black_box(output[0]);
            }
        });
        assert_eq!(allocation.count_total, 0);
        assert_eq!(allocation.count_current, 0);
        assert_eq!(allocation.bytes_total, 0);
        assert_eq!(allocation.bytes_current, 0);
    }
}
