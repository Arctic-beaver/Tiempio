use std::fs::{File, create_dir_all, write};
use std::io::{BufWriter, Error, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tiempio_engine_offline_render::{
    OfflineBlockProgress, OfflineRenderControl, OfflineRenderRequest, Pcm16WavSink,
    RenderMetricsSink, render_to_sink, render_to_sink_with_control,
};
use tiempio_engine_protocol::{ENGINE_PROTOCOL_VERSION, ProtocolSession};

const VALID_BASS_PLAN: &str =
    include_str!("../../../../../fixtures/engine-protocol/valid-bass-plan.json");

#[derive(Default)]
struct BenchmarkControl {
    max_block_duration: Duration,
    observed_blocks: u64,
}

impl OfflineRenderControl for BenchmarkControl {
    fn should_cancel(&mut self, _completed_frames: u64, _total_frames: u64) -> bool {
        false
    }

    fn block_rendered(&mut self, progress: OfflineBlockProgress) {
        self.max_block_duration = self.max_block_duration.max(progress.render_duration);
        self.observed_blocks = self.observed_blocks.saturating_add(1);
    }
}

fn request() -> Result<OfflineRenderRequest, Error> {
    let plan: Value = serde_json::from_str(VALID_BASS_PLAN).map_err(Error::other)?;
    let mut session = ProtocolSession::new();
    let handshake = serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": "request.handshake",
        "sequence": 0,
        "type": "handshake",
        "payload": {
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "peer": "application",
            "renderPlanVersion": 5,
            "patchModelVersion": 4,
            "capabilities": ["protocol.typed-json", "render.offline"],
        },
    }))
    .map_err(Error::other)?;
    session
        .accept_body(&handshake)
        .map_err(|error| Error::other(error.to_string()))?;
    let command = serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": "request.offline",
        "sequence": 1,
        "type": "start-offline-render",
        "payload": {
            "renderId": "render.stage-4",
            "plan": plan,
            "sampleRate": 48_000,
            "blockFrames": 128,
            "endTick": 3_840,
        },
    }))
    .map_err(Error::other)?;
    let envelope = session
        .accept_body(&command)
        .map_err(|error| Error::other(error.to_string()))?;
    OfflineRenderRequest::from_command(envelope.command, 1)
        .map_err(|error| Error::other(format!("offline request failed: {error:?}")))
}

fn main() -> Result<(), Error> {
    let artifacts = Path::new("artifacts/engine");
    create_dir_all(artifacts)?;

    let mut benchmark = BenchmarkControl::default();
    let mut first_sink = RenderMetricsSink::new(48_000)
        .map_err(|error| Error::other(format!("metrics configuration failed: {error:?}")))?;
    let started = Instant::now();
    let first_summary = render_to_sink_with_control(request()?, &mut first_sink, &mut benchmark)
        .map_err(|error| Error::other(format!("first render failed: {error:?}")))?;
    let elapsed = started.elapsed();
    let first = first_sink.finish();

    let mut second_sink = RenderMetricsSink::new(48_000)
        .map_err(|error| Error::other(format!("metrics configuration failed: {error:?}")))?;
    let second_summary = render_to_sink(request()?, &mut second_sink)
        .map_err(|error| Error::other(format!("second render failed: {error:?}")))?;
    let second = second_sink.finish();
    if first_summary != second_summary || first != second {
        return Err(Error::other(
            "repeated offline renders produced different deterministic output",
        ));
    }

    let wav_path = artifacts.join("stage-4-deep-bass.wav");
    let writer = BufWriter::new(File::create(&wav_path)?);
    let mut wav_sink = Pcm16WavSink::new(writer, 48_000, first.frame_count)?;
    render_to_sink(request()?, &mut wav_sink)
        .map_err(|error| Error::other(format!("WAV render failed: {error:?}")))?;
    let mut writer = wav_sink.finish()?;
    writer.flush()?;

    let frame_count = u32::try_from(first.frame_count).unwrap_or(u32::MAX);
    let audio_seconds = f64::from(frame_count) / 48_000.0;
    let realtime_multiple = audio_seconds / elapsed.as_secs_f64().max(f64::EPSILON);
    let evidence = json!({
        "schemaVersion": 1,
        "fixture": "fixtures/engine-protocol/valid-bass-plan.json",
        "sampleRate": 48_000,
        "blockFrames": 128,
        "projectRevision": first_summary.project_revision,
        "planGeneration": first_summary.plan_generation,
        "frameCount": first.frame_count,
        "blockCount": first_summary.block_count,
        "peak": first.peak,
        "rms": first.rms,
        "dcOffsetLeft": first.dc_offset_left,
        "dcOffsetRight": first.dc_offset_right,
        "nonSilentFrames": first.non_silent_frames,
        "leadingSilentFrames": first.leading_silent_frames,
        "trailingSilentFrames": first.trailing_silent_frames,
        "firstNonSilentFrame": first.first_non_silent_frame,
        "lastNonSilentFrame": first.last_non_silent_frame,
        "clippedSampleCount": first.clipped_sample_count,
        "nonFiniteSampleCount": first.non_finite_sample_count,
        "spectralBandEnergy": {
            "lowUnder200Hz": first.spectral_band_energy.low,
            "mid200To2000Hz": first.spectral_band_energy.mid,
            "highOver2000Hz": first.spectral_band_energy.high,
        },
        "pcm16Fnv1a64": format!("{:016x}", first.pcm16_fnv1a64),
        "benchmark": {
            "gating": false,
            "elapsedMilliseconds": elapsed.as_secs_f64() * 1_000.0,
            "realtimeMultiple": realtime_multiple,
            "observedBlocks": benchmark.observed_blocks,
            "maxBlockNanoseconds": u64::try_from(benchmark.max_block_duration.as_nanos())
                .unwrap_or(u64::MAX),
        },
    });
    let metrics_path = artifacts.join("stage-4-metrics.json");
    write(
        &metrics_path,
        serde_json::to_vec_pretty(&evidence).map_err(Error::other)?,
    )?;

    println!("WAV: {}", wav_path.display());
    println!("Metrics: {}", metrics_path.display());
    println!(
        "{}",
        serde_json::to_string_pretty(&evidence).map_err(Error::other)?
    );
    Ok(())
}
