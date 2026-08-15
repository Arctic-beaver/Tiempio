use std::convert::Infallible;

use serde_json::{Value, json};
use tiempio_engine_core::{EngineKernel, PreparedPlan, PreparedPlanError};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_offline_render::{
    OfflineBlockProgress, OfflineBlockSink, OfflineRenderControl, OfflineRenderError,
    OfflineRenderRequest, Pcm16WavSink, RenderMetricsSink, render_to_sink,
    render_to_sink_with_control,
};
use tiempio_engine_protocol::{
    ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_VERSION, EngineCommand, ProtocolDiagnostic,
    ProtocolSession, decode_command_body, decode_frame,
};
use tiempio_engine_synth::BassVoicePool;

const VALID_BASS_PLAN: &str =
    include_str!("../../../../fixtures/engine-protocol/valid-bass-plan.json");
const VALID_DRUM_PLAN: &str =
    include_str!("../../../../fixtures/engine-protocol/unsupported-drum-plan.json");

fn command_body(sequence: u64, command_type: &str, payload: &Value) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": format!("request.{sequence}"),
        "sequence": sequence,
        "type": command_type,
        "payload": payload,
    }))
    .expect("test command")
}

fn handshake(session: &mut ProtocolSession) {
    session
        .accept_body(&command_body(
            0,
            "handshake",
            &json!({
                "protocolVersion": ENGINE_PROTOCOL_VERSION,
                "peer": "application",
                "renderPlanVersion": 6,
                "patchModelVersion": 4,
                "capabilities": ["protocol.typed-json", "render.offline"],
            }),
        ))
        .expect("compatible handshake");
}

fn fixture_plan() -> Value {
    serde_json::from_str(VALID_BASS_PLAN).expect("valid fixture JSON")
}

fn request(end_tick: u64) -> OfflineRenderRequest {
    request_from_plan(&fixture_plan(), end_tick, "render.stage-4")
}

fn request_from_plan(plan: &Value, end_tick: u64, render_id: &str) -> OfflineRenderRequest {
    let mut session = ProtocolSession::new();
    handshake(&mut session);
    let envelope = session
        .accept_body(&command_body(
            1,
            "start-offline-render",
            &json!({
                "renderId": render_id,
                "plan": plan,
                "sampleRate": 48_000,
                "blockFrames": 128,
                "endTick": end_tick,
            }),
        ))
        .expect("accepted offline command");
    OfflineRenderRequest::from_command(envelope.command, 1).expect("offline request")
}

#[test]
fn procedural_drum_fixture_renders_finite_non_silent_audio() {
    let plan: Value = serde_json::from_str(VALID_DRUM_PLAN).expect("drum fixture JSON");
    let mut sink = RenderMetricsSink::new(48_000).expect("metrics configuration");
    let summary = render_to_sink(request_from_plan(&plan, 960, "render.drums"), &mut sink)
        .expect("drum render");
    let metrics = sink.finish();
    assert_eq!(summary.project_revision, 1);
    assert_eq!(metrics.non_finite_sample_count, 0);
    assert_eq!(metrics.clipped_sample_count, 0);
    assert!(metrics.non_silent_frames > 1_000);
    assert!(metrics.peak > 0.01 && metrics.peak <= 1.0);
}

fn assert_close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} +/- {tolerance}, received {actual}",
    );
}

#[test]
fn fixed_wire_phrase_is_acknowledged_finite_non_silent_and_deterministic() {
    let mut first_sink = RenderMetricsSink::new(48_000).expect("metrics configuration");
    let first_summary = render_to_sink(request(3_840), &mut first_sink).expect("first render");
    let first = first_sink.finish();
    let mut second_sink = RenderMetricsSink::new(48_000).expect("metrics configuration");
    let second_summary = render_to_sink(request(3_840), &mut second_sink).expect("second render");
    let second = second_sink.finish();

    assert_eq!(first_summary, second_summary);
    assert_eq!(first, second);
    assert_eq!(first_summary.project_revision, 7);
    assert_eq!(first_summary.plan_generation, 1);
    assert_eq!(first_summary.frame_count, 106_667);
    assert_eq!(first_summary.block_count, 834);
    assert_eq!(first_summary.health.active_voices, 0);
    assert_eq!(first.non_finite_sample_count, 0);
    assert_eq!(first.clipped_sample_count, 0);
    assert_eq!(first.pcm16_fnv1a64, 0x5434_02ae_63df_9e92);
    assert_eq!(first.non_silent_frames, 88_206);
    assert_eq!(first.leading_silent_frames, 11);
    assert_eq!(first.trailing_silent_frames, 9_220);
    assert_eq!(first.first_non_silent_frame, Some(11));
    assert_eq!(first.last_non_silent_frame, Some(97_446));
    assert_close(first.peak, 0.245_698_690_348_220_76, 1.0e-6);
    assert_close(first.rms, 0.091_626_467_291_768_33, 1.0e-6);
    assert_close(
        first.dc_offset_left,
        0.000_000_692_624_354_881_676_9,
        1.0e-7,
    );
    assert_close(
        first.dc_offset_right,
        0.000_000_682_881_724_774_052_1,
        1.0e-7,
    );
    assert_close(
        first.spectral_band_energy.low,
        0.007_459_234_722_766_436,
        1.0e-6,
    );
    assert_close(
        first.spectral_band_energy.mid,
        0.000_750_269_398_406_240_3,
        1.0e-6,
    );
    assert_close(
        first.spectral_band_energy.high,
        0.000_013_798_660_219_141_72,
        1.0e-7,
    );
}

#[test]
fn pcm16_wav_bytes_are_exactly_repeatable_and_have_a_bounded_header() {
    let expected_frames = 106_667;
    let mut first_sink =
        Pcm16WavSink::new(Vec::new(), 48_000, expected_frames).expect("first WAV header");
    render_to_sink(request(3_840), &mut first_sink).expect("first WAV render");
    let first = first_sink.finish().expect("complete first WAV");
    let mut second_sink =
        Pcm16WavSink::new(Vec::new(), 48_000, expected_frames).expect("second WAV header");
    render_to_sink(request(3_840), &mut second_sink).expect("second WAV render");
    let second = second_sink.finish().expect("complete second WAV");

    assert_eq!(first, second);
    assert_eq!(&first[0..4], b"RIFF");
    assert_eq!(&first[8..12], b"WAVE");
    assert_eq!(first.len(), 44 + 106_667 * 4);
    assert!(Pcm16WavSink::new(Vec::new(), 7_999, 1).is_err());
}

#[derive(Default)]
struct CountingSink {
    frames: u64,
}

impl OfflineBlockSink for CountingSink {
    type Error = Infallible;

    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error> {
        self.frames = self
            .frames
            .saturating_add(u64::try_from(block.len()).unwrap_or(u64::MAX));
        Ok(())
    }
}

struct FailingSink;

impl OfflineBlockSink for FailingSink {
    type Error = &'static str;

    fn write_block(&mut self, _block: &[StereoFrame]) -> Result<(), Self::Error> {
        Err("sink-failed")
    }
}

struct CancelAt {
    completed_frames: u64,
    observed_blocks: u64,
}

impl OfflineRenderControl for CancelAt {
    fn should_cancel(&mut self, completed_frames: u64, _total_frames: u64) -> bool {
        completed_frames >= self.completed_frames
    }

    fn block_rendered(&mut self, _progress: OfflineBlockProgress) {
        self.observed_blocks = self.observed_blocks.saturating_add(1);
    }
}

#[test]
fn cancellation_is_polled_only_at_bounded_block_boundaries() {
    let mut sink = CountingSink::default();
    let mut control = CancelAt {
        completed_frames: 256,
        observed_blocks: 0,
    };
    let error = render_to_sink_with_control(request(3_840), &mut sink, &mut control)
        .expect_err("cancelled render");
    assert_eq!(
        error,
        OfflineRenderError::Cancelled {
            completed_frames: 256,
        }
    );
    assert_eq!(sink.frames, 256);
    assert_eq!(control.observed_blocks, 2);
}

#[test]
fn duration_and_sink_failures_stop_without_unbounded_buffering() {
    let mut count = CountingSink::default();
    let duration_error =
        render_to_sink(request(2_000_000), &mut count).expect_err("duration ceiling");
    assert!(matches!(
        duration_error,
        OfflineRenderError::DurationLimitExceeded { .. }
    ));
    assert_eq!(duration_error.stable_code(), "engine.limit-exceeded");
    assert_eq!(count.frames, 0);

    assert_eq!(
        render_to_sink(request(3_840), &mut FailingSink),
        Err(OfflineRenderError::Sink("sink-failed"))
    );
    let invalid_plan = OfflineRenderError::<Infallible>::Plan(PreparedPlanError::InvalidPlan(
        "fixture".to_owned(),
    ));
    assert_eq!(invalid_plan.stable_code(), "engine.invalid-plan");
}

#[test]
fn full_plan_protocol_command_reaches_the_same_acknowledged_kernel() {
    let mut session = ProtocolSession::new();
    handshake(&mut session);
    let envelope = session
        .accept_body(&command_body(
            1,
            "load-render-plan",
            &json!({ "plan": fixture_plan() }),
        ))
        .expect("accepted full plan");
    let EngineCommand::LoadRenderPlan(plan) = envelope.command else {
        panic!("expected full plan command");
    };
    let configuration = DspConfiguration::new(48_000, 128).expect("configuration");
    let prepared = PreparedPlan::prepare(plan, 48_000, 9).expect("prepared plan");
    let mut engine = EngineKernel::new(configuration, BassVoicePool::new(configuration));
    engine.publish_plan(prepared).expect("published plan");
    engine.render_block(&mut [StereoFrame::default(); 128]);
    let acknowledgement = engine.take_plan_acknowledgement().expect("acknowledgement");
    assert_eq!(acknowledgement.project_revision, 7);
    assert_eq!(acknowledgement.plan_generation, 9);
}

#[test]
fn malformed_protocol_corpus_fails_closed_with_stable_diagnostics() {
    assert_eq!(
        decode_command_body(&[0xff])
            .expect_err("invalid UTF-8")
            .diagnostic,
        ProtocolDiagnostic::InvalidEnvelope
    );
    let deep = format!("{}0{}", "[".repeat(34), "]".repeat(34),);
    assert_eq!(
        decode_command_body(deep.as_bytes())
            .expect_err("over-deep JSON")
            .diagnostic,
        ProtocolDiagnostic::InvalidEnvelope
    );
    let oversized = u32::try_from(ENGINE_PROTOCOL_MAX_FRAME_BYTES + 1)
        .expect("frame ceiling")
        .to_be_bytes();
    assert_eq!(
        decode_frame(&oversized)
            .expect_err("oversized frame")
            .diagnostic,
        ProtocolDiagnostic::FrameTooLarge
    );
    let mut drum_plan: Value = serde_json::from_str(VALID_DRUM_PLAN).expect("drum fixture JSON");
    drum_plan["layers"][0]["source"]["type"] = json!("future-source");
    assert_eq!(
        decode_command_body(&command_body(
            1,
            "start-offline-render",
            &json!({
                "renderId": "render.drum",
                "plan": drum_plan,
                "sampleRate": 48_000,
                "blockFrames": 128,
                "endTick": 960,
            }),
        ))
        .expect_err("unsupported source")
        .diagnostic,
        ProtocolDiagnostic::UnsupportedSource
    );
    assert_eq!(
        decode_command_body(&command_body(
            2,
            "start-offline-render",
            &json!({
                "renderId": "render.extra",
                "plan": fixture_plan(),
                "sampleRate": 48_000,
                "blockFrames": 128,
                "endTick": 960,
                "extra": true,
            }),
        ))
        .expect_err("unknown payload field")
        .diagnostic,
        ProtocolDiagnostic::InvalidEnvelope
    );
}
