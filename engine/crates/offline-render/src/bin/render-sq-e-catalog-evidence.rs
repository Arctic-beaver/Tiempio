use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs::{create_dir_all, read, remove_dir_all, write};
use std::io::{Error, ErrorKind};
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tiempio_engine_core::{PATCH_MODEL_VERSION, RENDER_PLAN_VERSION};
use tiempio_engine_offline_render::{
    CatalogAnalysisConfiguration, CatalogAnalysisResult, CatalogAnalysisSink, OfflineRenderRequest,
    PERCEPTUAL_ANALYZER_REVISION, PERCEPTUAL_SPECTRAL_FFT_FRAMES, Pcm16WavSink, render_to_sink,
};
use tiempio_engine_protocol::{ENGINE_PROTOCOL_VERSION, ProtocolSession};

const MATRIX_PATH: &str = "artifacts/sq-e-catalog-matrix.json";
const REPORT_PATH: &str = "docs/evidence/sound-quality/SQ-E-CATALOG-TECHNICAL.json";
const BASELINE_PATH: &str = "artifacts/SQ-E-CATALOG-BASELINE.json";
const AUDITION_ASSET_DIRECTORY: &str = "artifacts/sq-f-audition";
const AUDITION_MANIFEST_PATH: &str = "docs/evidence/sound-quality/SQ-F-AUDITION-MANIFEST.json";
const AUDITION_KEY_PATH: &str = "docs/evidence/sound-quality/SQ-F-AUDITION-KEY.json";
const EXPECTED_MATRIX_REVISION: u32 = 1;
const EXPECTED_PRESETS: usize = 27;
const EXPECTED_PROBES: usize = 648;
const MAXIMUM_PROBES: usize = 2_048;
const AUDITION_CONTEXTS: [&str; 4] = [
    "isolated-note",
    "role-phrase",
    "polyphony",
    "protected-drum-mix",
];
const SINGLE_TRUE_PEAK_LIMIT_DBTP: f64 = -3.0;
const POLYPHONY_TRUE_PEAK_LIMIT_DBTP: f64 = -1.0;
const DC_LIMIT: f64 = 0.001;
const DISCONTINUITY_LIMIT: f64 = 0.08;
const MONO_LOSS_LIMIT_DB: f64 = -3.0;
const CORRELATION_FLOOR: f64 = -0.20;
const BASS_LOW_SIDE_LIMIT_DB: f64 = -18.0;
const OTHER_LOW_SIDE_LIMIT_DB: f64 = -12.0;
const MINIMUM_TRAILING_SILENCE_FRAMES: u64 = 2_048;
const PITCH_ERROR_LIMIT_CENTS: f64 = 8.0;
const PITCH_CONFIDENCE_FLOOR: f64 = 0.50;
const MINIMUM_VELOCITY_RANGE_DB: f64 = 6.0;
const MAXIMUM_VELOCITY_RANGE_DB: f64 = 18.0;
const MAXIMUM_REGISTER_SPREAD_DB: f64 = 6.0;
const MAXIMUM_FAMILY_LEVEL_SPREAD_DB: f64 = 4.0;
const MAXIMUM_CROSS_RATE_LEVEL_DELTA_DB: f64 = 0.50;
const MAXIMUM_CROSS_RATE_SPECTRAL_DELTA_RATIO: f64 = 0.08;
const MAXIMUM_CROSS_RATE_TIME_DELTA_RATIO: f64 = 0.15;
const DUPLICATE_SUSPECT_DISTANCE: f64 = 0.65;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogMatrix {
    matrix_revision: u32,
    block_frames: u32,
    probe_count: usize,
    maximum_probes: usize,
    probes: Vec<CatalogProbe>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogProbe {
    kind: String,
    family: String,
    preset_id: String,
    role_position: String,
    velocity: u8,
    pitch: u8,
    expected_pitch_hz: f64,
    sample_rate: u32,
    steady_analysis_frame: u64,
    spectral_analysis_start_frame: u64,
    plan: Value,
}

#[derive(Clone)]
struct Measurement {
    probe: CatalogProbe,
    analysis: CatalogAnalysisResult,
}

struct AuditionAsset {
    blind_id: String,
    family: String,
    preset_id: String,
    manifest: Value,
}

fn invalid(message: impl Into<String>) -> Error {
    Error::new(ErrorKind::InvalidData, message.into())
}

fn count_as_f64(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}

fn command_body(sequence: u64, command_type: &str, payload: &Value) -> Result<Vec<u8>, Error> {
    serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": format!("request.sq-e.{sequence}"),
        "sequence": sequence,
        "type": command_type,
        "payload": payload,
    }))
    .map_err(|error| invalid(format!("Could not encode protocol command: {error}")))
}

fn render_request(
    matrix: &CatalogMatrix,
    probe: &CatalogProbe,
    index: usize,
) -> Result<OfflineRenderRequest, Error> {
    let mut session = ProtocolSession::new();
    session
        .accept_body(&command_body(
            0,
            "handshake",
            &json!({
                "protocolVersion": ENGINE_PROTOCOL_VERSION,
                "peer": "application",
                "renderPlanVersion": RENDER_PLAN_VERSION,
                "patchModelVersion": PATCH_MODEL_VERSION,
                "capabilities": ["protocol.typed-json", "render.offline"],
            }),
        )?)
        .map_err(|error| invalid(format!("SQ-E handshake failed: {error:?}")))?;
    let end_tick = probe
        .plan
        .get("endTick")
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid("SQ-E probe plan has no bounded end tick."))?;
    let command = session
        .accept_body(&command_body(
            1,
            "start-offline-render",
            &json!({
                "renderId": format!("render.sq-e.{index}"),
                "plan": probe.plan,
                "sampleRate": probe.sample_rate,
                "blockFrames": matrix.block_frames,
                "endTick": end_tick,
            }),
        )?)
        .map_err(|error| invalid(format!("SQ-E render request failed: {error:?}")))?;
    OfflineRenderRequest::from_command(command.command, 1)
        .map_err(|error| invalid(format!("SQ-E request conversion failed: {error:?}")))
}

fn validate_matrix(matrix: &CatalogMatrix) -> Result<(), Error> {
    if matrix.matrix_revision != EXPECTED_MATRIX_REVISION
        || matrix.probe_count != matrix.probes.len()
        || matrix.probe_count != EXPECTED_PROBES
        || matrix.maximum_probes != MAXIMUM_PROBES
        || matrix.probe_count > matrix.maximum_probes
        || matrix.block_frames != 128
    {
        return Err(invalid(
            "SQ-E catalog matrix shape is not the frozen current matrix.",
        ));
    }
    let presets: BTreeSet<&str> = matrix
        .probes
        .iter()
        .map(|probe| probe.preset_id.as_str())
        .collect();
    if presets.len() != EXPECTED_PRESETS {
        return Err(invalid("SQ-E matrix does not contain 27 distinct presets."));
    }
    let mut counts = BTreeMap::new();
    let mut shape_counts = BTreeMap::new();
    let mut single_combinations = BTreeSet::new();
    for probe in &matrix.probes {
        *counts.entry(probe.preset_id.as_str()).or_insert(0_usize) += 1;
        *shape_counts
            .entry((
                probe.preset_id.as_str(),
                probe.sample_rate,
                probe.kind.as_str(),
            ))
            .or_insert(0_usize) += 1;
        if !["single", "role-phrase", "polyphony", "protected-drum-mix"]
            .contains(&probe.kind.as_str())
            || !["bass", "lead", "pad", "pluck", "texture"].contains(&probe.family.as_str())
            || !["low", "middle", "high"].contains(&probe.role_position.as_str())
            || ![32, 80, 120].contains(&probe.velocity)
            || ![44_100, 48_000].contains(&probe.sample_rate)
            || !probe.expected_pitch_hz.is_finite()
            || probe.expected_pitch_hz <= 0.0
            || probe.spectral_analysis_start_frame > probe.steady_analysis_frame
            || (probe.kind != "single" && (probe.role_position != "middle" || probe.velocity != 80))
        {
            return Err(invalid("SQ-E matrix contains an invalid probe."));
        }
        if probe.kind == "single"
            && !single_combinations.insert((
                probe.preset_id.as_str(),
                probe.sample_rate,
                probe.role_position.as_str(),
                probe.velocity,
            ))
        {
            return Err(invalid("SQ-E matrix contains a duplicate single probe."));
        }
    }
    if counts.values().any(|count| *count != 24) {
        return Err(invalid("Every SQ-E preset must own exactly 24 probes."));
    }
    for preset in presets {
        for sample_rate in [44_100, 48_000] {
            for (kind, expected) in [
                ("single", 9_usize),
                ("role-phrase", 1),
                ("polyphony", 1),
                ("protected-drum-mix", 1),
            ] {
                if shape_counts
                    .get(&(preset, sample_rate, kind))
                    .copied()
                    .unwrap_or(0)
                    != expected
                {
                    return Err(invalid(
                        "SQ-E matrix does not match the frozen per-rate context shape.",
                    ));
                }
            }
        }
    }
    Ok(())
}

fn tick_to_frame(tick: u64, sample_rate: u32, denominator: u128) -> Result<u64, Error> {
    let numerator = u128::from(tick)
        .checked_mul(u128::from(sample_rate))
        .and_then(|value| value.checked_mul(60_000_000))
        .ok_or_else(|| invalid("SQ-E event frame overflowed."))?;
    let rounded = numerator
        .checked_add(denominator / 2)
        .ok_or_else(|| invalid("SQ-E rounded event frame overflowed."))?
        / denominator;
    u64::try_from(rounded).map_err(|_| invalid("SQ-E event frame exceeds the render domain."))
}

fn event_discontinuity_frames(probe: &CatalogProbe) -> Result<Vec<u64>, Error> {
    if probe.kind == "protected-drum-mix" {
        return Ok(Vec::new());
    }
    let ticks_per_quarter = probe
        .plan
        .get("ticksPerQuarter")
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid("SQ-E plan has no ticks-per-quarter value."))?;
    let micro_bpm = probe
        .plan
        .get("tempoMap")
        .and_then(Value::as_array)
        .and_then(|points| points.first())
        .and_then(|point| point.get("microBpm"))
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid("SQ-E plan has no initial tempo."))?;
    let layers = probe
        .plan
        .get("layers")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("SQ-E plan has no layers."))?;
    let denominator = u128::from(micro_bpm)
        .checked_mul(u128::from(ticks_per_quarter))
        .ok_or_else(|| invalid("SQ-E event-frame denominator overflowed."))?;
    if denominator == 0 {
        return Err(invalid("SQ-E event-frame denominator is zero."));
    }
    let event_count = layers
        .iter()
        .filter(|layer| {
            layer
                .get("source")
                .and_then(|source| source.get("type"))
                .and_then(Value::as_str)
                == Some("subtractive-synth")
        })
        .filter_map(|layer| layer.get("events").and_then(Value::as_array))
        .map(Vec::len)
        .sum::<usize>();
    let mut frames = Vec::with_capacity(event_count.saturating_mul(2));
    for layer in layers {
        if layer
            .get("source")
            .and_then(|source| source.get("type"))
            .and_then(Value::as_str)
            != Some("subtractive-synth")
        {
            continue;
        }
        let events = layer
            .get("events")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("SQ-E layer has no events."))?;
        for event in events {
            let start = event
                .get("startTick")
                .and_then(Value::as_u64)
                .ok_or_else(|| invalid("SQ-E event has no start tick."))?;
            let mut ticks = vec![start];
            if let Some(duration) = event.get("durationTicks").and_then(Value::as_u64) {
                ticks.push(
                    start
                        .checked_add(duration)
                        .ok_or_else(|| invalid("SQ-E event end tick overflowed."))?,
                );
            }
            for tick in ticks {
                frames.push(tick_to_frame(tick, probe.sample_rate, denominator)?);
            }
        }
    }
    Ok(frames)
}

fn analysis_sink(probe: &CatalogProbe) -> Result<CatalogAnalysisSink, Error> {
    CatalogAnalysisSink::new(CatalogAnalysisConfiguration {
        sample_rate: probe.sample_rate,
        spectral_start_frame: probe.spectral_analysis_start_frame,
        steady_analysis_frame: probe.steady_analysis_frame,
        expected_pitch_hz: probe.expected_pitch_hz,
        discontinuity_probe_frames: event_discontinuity_frames(probe)?,
    })
    .map_err(|error| invalid(format!("Catalog analyzer configuration failed: {error:?}")))
}

fn render_measurements(matrix: &CatalogMatrix) -> Result<Vec<Measurement>, Error> {
    let mut measurements = Vec::with_capacity(matrix.probes.len());
    for (index, probe) in matrix.probes.iter().enumerate() {
        let mut sink = analysis_sink(probe)?;
        render_to_sink(render_request(matrix, probe, index)?, &mut sink)
            .map_err(|error| invalid(format!("SQ-E render failed: {error:?}")))?;
        measurements.push(Measurement {
            probe: probe.clone(),
            analysis: sink.finish(),
        });
        if (index + 1) % 50 == 0 || index + 1 == matrix.probes.len() {
            println!(
                "SQ-E progress: rendered {}/{} probes.",
                index + 1,
                matrix.probes.len()
            );
        }
    }
    Ok(measurements)
}

fn safety_failures(measurement: &Measurement) -> Vec<String> {
    let probe = &measurement.probe;
    let analysis = &measurement.analysis;
    let metrics = &analysis.metrics;
    let perceptual = &analysis.perceptual;
    let peak_limit = if probe.kind == "single" {
        SINGLE_TRUE_PEAK_LIMIT_DBTP
    } else {
        POLYPHONY_TRUE_PEAK_LIMIT_DBTP
    };
    let low_side_limit = if probe.family == "bass" {
        BASS_LOW_SIDE_LIMIT_DB
    } else {
        OTHER_LOW_SIDE_LIMIT_DB
    };
    let label = format!(
        "{}.{}Hz.{}.{}.{}",
        probe.preset_id, probe.sample_rate, probe.kind, probe.role_position, probe.velocity
    );
    let mut failures = Vec::new();
    if metrics.non_finite_sample_count != 0 {
        failures.push(format!(
            "{label}: nonFinite={}",
            metrics.non_finite_sample_count
        ));
    }
    if metrics.clipped_sample_count != 0 {
        failures.push(format!("{label}: clipped={}", metrics.clipped_sample_count));
    }
    if perceptual.true_peak_dbtp > peak_limit {
        failures.push(format!(
            "{label}: truePeak={:.3}>{peak_limit:.3} dBTP",
            perceptual.true_peak_dbtp
        ));
    }
    if analysis.steady_dc_offset > DC_LIMIT {
        failures.push(format!(
            "{label}: dc={:.6}>{DC_LIMIT:.6}",
            analysis.steady_dc_offset
        ));
    }
    if probe.kind != "protected-drum-mix"
        && analysis.maximum_event_discontinuity > DISCONTINUITY_LIMIT
    {
        failures.push(format!(
            "{label}: eventDiscontinuity={:.6}>{DISCONTINUITY_LIMIT:.6}",
            analysis.maximum_event_discontinuity
        ));
    }
    if perceptual.mono_fold_loss_db < MONO_LOSS_LIMIT_DB {
        failures.push(format!(
            "{label}: monoLoss={:.3}<{MONO_LOSS_LIMIT_DB:.3} dB",
            perceptual.mono_fold_loss_db
        ));
    }
    if perceptual.interchannel_correlation < CORRELATION_FLOOR {
        failures.push(format!(
            "{label}: correlation={:.4}<{CORRELATION_FLOOR:.4}",
            perceptual.interchannel_correlation
        ));
    }
    if perceptual.low_side_to_mid_db > low_side_limit {
        failures.push(format!(
            "{label}: lowSideToMid={:.3}>{low_side_limit:.3} dB",
            perceptual.low_side_to_mid_db
        ));
    }
    if metrics.trailing_silent_frames < MINIMUM_TRAILING_SILENCE_FRAMES {
        failures.push(format!(
            "{label}: trailingSilence={}<{} frames",
            metrics.trailing_silent_frames, MINIMUM_TRAILING_SILENCE_FRAMES
        ));
    }
    if probe.kind == "single" {
        match perceptual.pitch {
            Some(pitch)
                if pitch.error_cents.abs() <= PITCH_ERROR_LIMIT_CENTS
                    && pitch.confidence >= PITCH_CONFIDENCE_FLOOR => {}
            Some(pitch) => failures.push(format!(
                "{label}: pitchError={:.3} cents, confidence={:.3}",
                pitch.error_cents, pitch.confidence
            )),
            None => failures.push(format!("{label}: pitch was not measurable")),
        }
    }
    failures
}

fn ratio_delta(left: f64, right: f64) -> f64 {
    (left - right).abs() / left.abs().max(right.abs()).max(f64::EPSILON)
}

fn resolved_ratio_delta(left: f64, right: f64, absolute_resolution: f64) -> f64 {
    ((left - right).abs() - absolute_resolution).max(0.0)
        / left.abs().max(right.abs()).max(f64::EPSILON)
}

fn tail_seconds(measurement: &Measurement) -> f64 {
    count_as_f64(
        measurement
            .analysis
            .metrics
            .last_non_silent_frame
            .unwrap_or(0),
    ) / f64::from(measurement.probe.sample_rate)
}

fn cross_rate_failures(rate_groups: BTreeMap<String, Vec<&Measurement>>) -> Vec<String> {
    let mut failures = Vec::new();
    for (label, group) in rate_groups {
        if group.len() != 2 {
            failures.push(format!("{label}: incomplete rate pair"));
            continue;
        }
        let left = group[0];
        let right = group[1];
        let level_delta = (left.analysis.perceptual.k_weighted_level_db
            - right.analysis.perceptual.k_weighted_level_db)
            .abs();
        let spectral_resolution_hz = 2.0
            * f64::from(left.probe.sample_rate.max(right.probe.sample_rate))
            / count_as_f64(u64::try_from(PERCEPTUAL_SPECTRAL_FFT_FRAMES).unwrap_or(1));
        let centroid_delta = resolved_ratio_delta(
            left.analysis.perceptual.spectral.centroid_hz,
            right.analysis.perceptual.spectral.centroid_hz,
            spectral_resolution_hz,
        );
        let attack_delta = if left.probe.kind == "single" {
            resolved_ratio_delta(
                count_as_f64(left.analysis.attack_frames) / f64::from(left.probe.sample_rate),
                count_as_f64(right.analysis.attack_frames) / f64::from(right.probe.sample_rate),
                0.0005,
            )
        } else {
            0.0
        };
        let tail_delta = ratio_delta(tail_seconds(left), tail_seconds(right));
        if level_delta > MAXIMUM_CROSS_RATE_LEVEL_DELTA_DB
            || centroid_delta > MAXIMUM_CROSS_RATE_SPECTRAL_DELTA_RATIO
            || attack_delta > MAXIMUM_CROSS_RATE_TIME_DELTA_RATIO
            || tail_delta > MAXIMUM_CROSS_RATE_TIME_DELTA_RATIO
        {
            failures.push(format!(
                "{label}: rate delta level={level_delta:.3}dB centroid={centroid_delta:.3} attack={attack_delta:.3} tail={tail_delta:.3}"
            ));
        }
    }
    failures
}

fn role_failures(measurements: &[Measurement]) -> Vec<String> {
    let singles: Vec<&Measurement> = measurements
        .iter()
        .filter(|measurement| measurement.probe.kind == "single")
        .collect();
    let mut failures = Vec::new();

    let mut velocity_groups: BTreeMap<(&str, u32, &str), Vec<&Measurement>> = BTreeMap::new();
    let mut register_groups: BTreeMap<(&str, u32, u8), Vec<&Measurement>> = BTreeMap::new();
    let mut rate_groups: BTreeMap<String, Vec<&Measurement>> = BTreeMap::new();
    for measurement in measurements {
        let probe = &measurement.probe;
        let label = if probe.kind == "single" {
            format!(
                "{}.{}.{}",
                probe.preset_id, probe.role_position, probe.velocity
            )
        } else {
            format!("{}.{}", probe.preset_id, probe.kind)
        };
        rate_groups.entry(label).or_default().push(measurement);
    }
    for measurement in &singles {
        let probe = &measurement.probe;
        velocity_groups
            .entry((
                probe.preset_id.as_str(),
                probe.sample_rate,
                probe.role_position.as_str(),
            ))
            .or_default()
            .push(measurement);
        register_groups
            .entry((probe.preset_id.as_str(), probe.sample_rate, probe.velocity))
            .or_default()
            .push(measurement);
    }

    for ((preset, rate, role), mut group) in velocity_groups {
        group.sort_by_key(|measurement| measurement.probe.velocity);
        if group.len() != 3 {
            failures.push(format!("{preset}.{rate}.{role}: incomplete velocity group"));
            continue;
        }
        let levels: Vec<f64> = group
            .iter()
            .map(|measurement| measurement.analysis.perceptual.k_weighted_level_db)
            .collect();
        if levels.windows(2).any(|pair| pair[1] + 0.05 < pair[0]) {
            failures.push(format!(
                "{preset}.{rate}.{role}: velocity level is not monotonic"
            ));
        }
        let range = levels[2] - levels[0];
        if !(MINIMUM_VELOCITY_RANGE_DB..=MAXIMUM_VELOCITY_RANGE_DB).contains(&range) {
            failures.push(format!(
                "{preset}.{rate}.{role}: velocity range {range:.3} dB is outside {MINIMUM_VELOCITY_RANGE_DB:.1}..={MAXIMUM_VELOCITY_RANGE_DB:.1} dB"
            ));
        }
    }

    for ((preset, rate, velocity), group) in register_groups {
        let levels: Vec<f64> = group
            .iter()
            .map(|measurement| measurement.analysis.perceptual.k_weighted_level_db)
            .collect();
        let spread = levels.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - levels.iter().copied().fold(f64::INFINITY, f64::min);
        if group.len() != 3 || spread > MAXIMUM_REGISTER_SPREAD_DB {
            failures.push(format!(
                "{preset}.{rate}.velocity{velocity}: register spread {spread:.3} dB exceeds {MAXIMUM_REGISTER_SPREAD_DB:.1} dB"
            ));
        }
    }

    failures.extend(cross_rate_failures(rate_groups));
    failures
}

fn default_measurements(measurements: &[Measurement]) -> Vec<&Measurement> {
    measurements
        .iter()
        .filter(|measurement| {
            let probe = &measurement.probe;
            probe.kind == "single"
                && probe.sample_rate == 48_000
                && probe.role_position == "middle"
                && probe.velocity == 80
        })
        .collect()
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len() % 2 == 0 {
        0.5 * (values[middle - 1] + values[middle])
    } else {
        values[middle]
    }
}

fn family_level_report(measurements: &[Measurement], failures: &mut Vec<String>) -> Vec<Value> {
    let mut groups: BTreeMap<&str, Vec<&Measurement>> = BTreeMap::new();
    for measurement in default_measurements(measurements) {
        groups
            .entry(measurement.probe.family.as_str())
            .or_default()
            .push(measurement);
    }
    groups
        .into_iter()
        .map(|(family, group)| {
            let mut levels: Vec<f64> = group
                .iter()
                .map(|measurement| measurement.analysis.perceptual.k_weighted_level_db)
                .collect();
            let family_median = median(&mut levels);
            let minimum = levels.iter().copied().fold(f64::INFINITY, f64::min);
            let maximum = levels.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let spread = maximum - minimum;
            if spread > MAXIMUM_FAMILY_LEVEL_SPREAD_DB {
                failures.push(format!(
                    "{family}: default level spread {spread:.3} dB exceeds {MAXIMUM_FAMILY_LEVEL_SPREAD_DB:.1} dB"
                ));
            }
            json!({
                "family": family,
                "medianKWeightedLevelDb": family_median,
                "spreadDb": spread,
                "presets": group.into_iter().map(|measurement| json!({
                    "presetId": measurement.probe.preset_id,
                    "kWeightedLevelDb": measurement.analysis.perceptual.k_weighted_level_db,
                    "auditionGainDb": family_median - measurement.analysis.perceptual.k_weighted_level_db,
                })).collect::<Vec<_>>(),
            })
        })
        .collect()
}

fn descriptor_vector(measurement: &Measurement) -> [f64; 7] {
    let perceptual = &measurement.analysis.perceptual;
    let attack_seconds =
        count_as_f64(measurement.analysis.attack_frames) / f64::from(measurement.probe.sample_rate);
    [
        perceptual.spectral.centroid_hz.max(f64::EPSILON).ln(),
        perceptual.spectral.rolloff_95_hz.max(f64::EPSILON).ln(),
        attack_seconds.max(1.0e-6).ln(),
        tail_seconds(measurement).max(1.0e-6).ln(),
        perceptual.true_peak_dbtp - perceptual.rms_dbfs,
        measurement.analysis.side_to_mid_db.max(-150.0),
        perceptual.spectral.positive_flux.max(1.0e-12).ln(),
    ]
}

fn duplicate_report(measurements: &[Measurement]) -> Vec<Value> {
    let mut groups: BTreeMap<&str, Vec<&Measurement>> = BTreeMap::new();
    for measurement in default_measurements(measurements) {
        groups
            .entry(measurement.probe.family.as_str())
            .or_default()
            .push(measurement);
    }
    let mut reports = Vec::new();
    for (family, group) in groups {
        let vectors: Vec<[f64; 7]> = group.iter().map(|item| descriptor_vector(item)).collect();
        let mut means = [0.0; 7];
        let mut scales = [0.0; 7];
        for axis in 0..7 {
            means[axis] = vectors.iter().map(|vector| vector[axis]).sum::<f64>()
                / count_as_f64(u64::try_from(vectors.len()).unwrap_or(1));
            scales[axis] = (vectors
                .iter()
                .map(|vector| (vector[axis] - means[axis]).powi(2))
                .sum::<f64>()
                / count_as_f64(u64::try_from(vectors.len()).unwrap_or(1)))
            .sqrt()
            .max(1.0e-9);
        }
        for left in 0..group.len() {
            let mut nearest = None;
            for right in 0..group.len() {
                if left == right {
                    continue;
                }
                let distance = (0..7)
                    .map(|axis| {
                        ((vectors[left][axis] - means[axis]) / scales[axis]
                            - (vectors[right][axis] - means[axis]) / scales[axis])
                            .powi(2)
                    })
                    .sum::<f64>()
                    / 7.0;
                let distance = distance.sqrt();
                if nearest.is_none_or(|(_, nearest_distance)| distance < nearest_distance) {
                    nearest = Some((right, distance));
                }
            }
            if let Some((right, distance)) = nearest {
                reports.push(json!({
                    "family": family,
                    "presetId": group[left].probe.preset_id,
                    "nearestPresetId": group[right].probe.preset_id,
                    "standardizedDistance": distance,
                    "technicalDuplicateSuspect": distance < DUPLICATE_SUSPECT_DISTANCE,
                    "decision": "human-review-required",
                }));
            }
        }
    }
    reports
}

fn measurement_json(measurement: &Measurement) -> Value {
    let probe = &measurement.probe;
    let analysis = &measurement.analysis;
    let perceptual = &analysis.perceptual;
    json!({
        "kind": probe.kind,
        "family": probe.family,
        "presetId": probe.preset_id,
        "rolePosition": probe.role_position,
        "velocity": probe.velocity,
        "midiPitch": probe.pitch,
        "expectedPitchHz": probe.expected_pitch_hz,
        "sampleRate": probe.sample_rate,
        "spectralAnalysisStartFrame": probe.spectral_analysis_start_frame,
        "attackFrames": analysis.attack_frames,
        "audibleThroughFrame": analysis.metrics.last_non_silent_frame,
        "trailingSilentFrames": analysis.metrics.trailing_silent_frames,
        "centroidHz": perceptual.spectral.centroid_hz,
        "rolloff95Hz": perceptual.spectral.rolloff_95_hz,
        "positiveFlux": perceptual.spectral.positive_flux,
        "sideToMidDb": analysis.side_to_mid_db,
        "kWeightedLevelDb": perceptual.k_weighted_level_db,
        "rmsDbfs": perceptual.rms_dbfs,
        "truePeakDbtp": perceptual.true_peak_dbtp,
        "monoFoldLossDb": perceptual.mono_fold_loss_db,
        "interchannelCorrelation": perceptual.interchannel_correlation,
        "lowSideToMidDb": perceptual.low_side_to_mid_db,
        "steadyDcOffset": analysis.steady_dc_offset,
        "maximumSampleDiscontinuity": perceptual.maximum_sample_discontinuity,
        "maximumEventDiscontinuity": (probe.kind != "protected-drum-mix")
            .then_some(analysis.maximum_event_discontinuity),
        "pitch": perceptual.pitch.map(|pitch| json!({
            "measuredHz": pitch.measured_hz,
            "errorCents": pitch.error_cents,
            "confidence": pitch.confidence,
        })),
        "pcm16Fnv1a64": format!("{:016x}", analysis.metrics.pcm16_fnv1a64),
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}

fn audition_context(measurement: &Measurement) -> Option<&'static str> {
    let probe = &measurement.probe;
    if probe.sample_rate != 48_000 {
        return None;
    }
    if probe.kind == "single" && probe.role_position == "middle" && probe.velocity == 80 {
        return Some("isolated-note");
    }
    AUDITION_CONTEXTS
        .iter()
        .copied()
        .find(|context| *context == probe.kind)
}

fn family_context_medians(measurements: &[Measurement]) -> BTreeMap<(String, String), f64> {
    let mut groups: BTreeMap<(String, String), Vec<f64>> = BTreeMap::new();
    for measurement in measurements {
        let Some(context) = audition_context(measurement) else {
            continue;
        };
        groups
            .entry((measurement.probe.family.clone(), context.to_owned()))
            .or_default()
            .push(measurement.analysis.perceptual.k_weighted_level_db);
    }
    groups
        .into_iter()
        .map(|(key, mut levels)| (key, median(&mut levels)))
        .collect()
}

fn scale_layer_gains(plan: &mut Value, gain: f64) -> Result<(), Error> {
    if !gain.is_finite() || gain <= 0.0 {
        return Err(invalid("SQ-F audition gain is invalid."));
    }
    let layers = plan
        .get_mut("layers")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("SQ-F audition plan has no layers."))?;
    for layer in layers {
        let layer_gain = layer
            .get_mut("gain")
            .ok_or_else(|| invalid("SQ-F audition layer has no gain."))?;
        let current = layer_gain
            .as_f64()
            .ok_or_else(|| invalid("SQ-F audition layer gain is invalid."))?;
        *layer_gain = json!(current * gain);
    }
    Ok(())
}

fn render_audition_asset(
    matrix: &CatalogMatrix,
    measurement: &Measurement,
    target_level_db: f64,
    index: usize,
) -> Result<(CatalogProbe, CatalogAnalysisResult, Vec<u8>), Error> {
    let mut probe = measurement.probe.clone();
    let gain_db = target_level_db - measurement.analysis.perceptual.k_weighted_level_db;
    scale_layer_gains(&mut probe.plan, 10.0_f64.powf(gain_db / 20.0))?;
    let mut analysis_sink = analysis_sink(&probe)?;
    render_to_sink(
        render_request(matrix, &probe, 10_000 + index)?,
        &mut analysis_sink,
    )
    .map_err(|error| invalid(format!("SQ-F audition analysis failed: {error:?}")))?;
    let analysis = analysis_sink.finish();
    let match_error = (analysis.perceptual.k_weighted_level_db - target_level_db).abs();
    let safety = safety_failures(&Measurement {
        probe: probe.clone(),
        analysis: analysis.clone(),
    });
    if match_error > 0.25 || !safety.is_empty() {
        return Err(invalid(format!(
            "SQ-F audition asset {} failed matching/safety: match={match_error:.3} dB, {}",
            probe.preset_id,
            safety.join(", ")
        )));
    }
    let mut wav_sink =
        Pcm16WavSink::new(Vec::new(), probe.sample_rate, analysis.metrics.frame_count)?;
    render_to_sink(
        render_request(matrix, &probe, 20_000 + index)?,
        &mut wav_sink,
    )
    .map_err(|error| invalid(format!("SQ-F audition WAV render failed: {error:?}")))?;
    let wav = wav_sink.finish()?;
    Ok((probe, analysis, wav))
}

fn audition_assets(
    matrix: &CatalogMatrix,
    measurements: &[Measurement],
    write_assets: bool,
) -> Result<Vec<AuditionAsset>, Error> {
    let medians = family_context_medians(measurements);
    let mut selected: BTreeMap<&str, Vec<(&str, &Measurement)>> = BTreeMap::new();
    for measurement in measurements {
        if let Some(context) = audition_context(measurement) {
            selected
                .entry(measurement.probe.preset_id.as_str())
                .or_default()
                .push((context, measurement));
        }
    }
    if selected.len() != EXPECTED_PRESETS
        || selected
            .values()
            .any(|contexts| contexts.len() != AUDITION_CONTEXTS.len())
    {
        return Err(invalid(
            "SQ-F audition pool must contain four contexts for all 27 current defaults.",
        ));
    }
    let mut selected: Vec<(&str, Vec<(&str, &Measurement)>)> = selected.into_iter().collect();
    selected
        .sort_by_key(|(preset_id, _)| Sha256::digest(format!("tiempio.sq-f.{preset_id}")).to_vec());
    if write_assets {
        let asset_directory = Path::new(AUDITION_ASSET_DIRECTORY);
        if asset_directory.exists() {
            remove_dir_all(asset_directory)?;
        }
        create_dir_all(AUDITION_ASSET_DIRECTORY)?;
    }
    let mut assets = Vec::with_capacity(selected.len());
    let mut rendered_files = 0;
    for (index, (_, contexts)) in selected.into_iter().enumerate() {
        let blind_id = format!("SQF-A{:02}", index + 1);
        let first = contexts
            .first()
            .map(|(_, measurement)| *measurement)
            .ok_or_else(|| invalid("SQ-F audition candidate has no contexts."))?;
        let mut context_rows = Vec::with_capacity(AUDITION_CONTEXTS.len());
        for (context_index, context) in AUDITION_CONTEXTS.iter().enumerate() {
            let measurement = contexts
                .iter()
                .find(|(candidate_context, _)| candidate_context == context)
                .map(|(_, measurement)| *measurement)
                .ok_or_else(|| invalid("SQ-F audition candidate is missing a context."))?;
            let target = *medians
                .get(&(measurement.probe.family.clone(), (*context).to_owned()))
                .ok_or_else(|| invalid("SQ-F family/context has no level target."))?;
            let render_index = index
                .checked_mul(AUDITION_CONTEXTS.len())
                .and_then(|value| value.checked_add(context_index))
                .ok_or_else(|| invalid("SQ-F audition render index overflowed."))?;
            let (probe, analysis, wav) =
                render_audition_asset(matrix, measurement, target, render_index)?;
            let relative_path = format!("artifacts/sq-f-audition/{blind_id}-{context}.wav");
            if write_assets {
                write(&relative_path, &wav)?;
            }
            context_rows.push(json!({
                "context": context,
                "path": relative_path,
                "sha256": sha256_hex(&wav),
                "sampleRate": probe.sample_rate,
                "frameCount": analysis.metrics.frame_count,
                "targetKWeightedLevelDb": target,
                "measuredKWeightedLevelDb": analysis.perceptual.k_weighted_level_db,
                "matchErrorDb": (analysis.perceptual.k_weighted_level_db - target).abs(),
                "truePeakDbtp": analysis.perceptual.true_peak_dbtp,
            }));
            rendered_files += 1;
            println!(
                "SQ-F package progress: rendered {rendered_files}/{} context assets.",
                EXPECTED_PRESETS * AUDITION_CONTEXTS.len()
            );
        }
        assets.push(AuditionAsset {
            blind_id: blind_id.clone(),
            family: first.probe.family.clone(),
            preset_id: first.probe.preset_id.clone(),
            manifest: json!({
                "blindId": blind_id,
                "family": first.probe.family,
                "contexts": context_rows,
            }),
        });
    }
    Ok(assets)
}

fn trial_pairs(assets: &[AuditionAsset], duplicates: &[Value]) -> Vec<(String, String)> {
    let mut pairs = BTreeSet::new();
    let mut families: BTreeMap<&str, Vec<&AuditionAsset>> = BTreeMap::new();
    let by_preset: BTreeMap<&str, &AuditionAsset> = assets
        .iter()
        .map(|asset| (asset.preset_id.as_str(), asset))
        .collect();
    for asset in assets {
        families
            .entry(asset.family.as_str())
            .or_default()
            .push(asset);
    }
    for group in families.values() {
        for (index, asset) in group.iter().enumerate() {
            let other = group[(index + 1) % group.len()];
            let mut pair = [asset.blind_id.clone(), other.blind_id.clone()];
            pair.sort();
            pairs.insert((pair[0].clone(), pair[1].clone()));
        }
    }
    for row in duplicates {
        if row
            .get("technicalDuplicateSuspect")
            .and_then(Value::as_bool)
            != Some(true)
        {
            continue;
        }
        let Some(left) = row
            .get("presetId")
            .and_then(Value::as_str)
            .and_then(|preset| by_preset.get(preset))
        else {
            continue;
        };
        let Some(right) = row
            .get("nearestPresetId")
            .and_then(Value::as_str)
            .and_then(|preset| by_preset.get(preset))
        else {
            continue;
        };
        let mut pair = [left.blind_id.clone(), right.blind_id.clone()];
        pair.sort();
        pairs.insert((pair[0].clone(), pair[1].clone()));
    }
    pairs.into_iter().collect()
}

fn encoded_json(value: &Value) -> Result<Vec<u8>, Error> {
    let mut encoded = serde_json::to_vec_pretty(value)
        .map_err(|error| invalid(format!("Could not encode evidence JSON: {error}")))?;
    encoded.push(b'\n');
    Ok(encoded)
}

fn audition_package(
    matrix: &CatalogMatrix,
    measurements: &[Measurement],
    duplicates: &[Value],
    write_assets: bool,
) -> Result<(Vec<u8>, Vec<u8>), Error> {
    let assets = audition_assets(matrix, measurements, write_assets)?;
    let pairs = trial_pairs(&assets, duplicates);
    let family_by_blind: BTreeMap<&str, &str> = assets
        .iter()
        .map(|asset| (asset.blind_id.as_str(), asset.family.as_str()))
        .collect();
    let manifest = json!({
        "packageRevision": 1,
        "analyzerRevision": PERCEPTUAL_ANALYZER_REVISION,
        "status": "awaiting-human-observations",
        "responseDataPresent": false,
        "levelMatchToleranceDb": 0.25,
        "assetCount": assets.len(),
        "audioFileCount": assets.len() * AUDITION_CONTEXTS.len(),
        "assets": assets.iter().map(|asset| asset.manifest.clone()).collect::<Vec<_>>(),
        "trials": pairs.iter().enumerate().map(|(index, (left, right))| json!({
            "trialId": format!("SQF-T{:02}", index + 1),
            "family": family_by_blind.get(left.as_str()).copied(),
            "leftBlindId": left,
            "rightBlindId": right,
            "contexts": AUDITION_CONTEXTS,
        })).collect::<Vec<_>>(),
        "panels": ["trained-critical", "target-creator"],
        "minimumValidListenersPerPanel": 16,
        "decision": "No preference or catalog-freeze claim is valid until both panels provide valid observations.",
    });
    let key = json!({
        "packageRevision": 1,
        "purpose": "study-coordinator-key",
        "assets": assets.iter().map(|asset| json!({
            "blindId": asset.blind_id,
            "presetId": asset.preset_id,
            "family": asset.family,
        })).collect::<Vec<_>>(),
    });
    Ok((encoded_json(&manifest)?, encoded_json(&key)?))
}

fn compare_file(path: &Path, expected: &[u8], label: &str) -> Result<(), Error> {
    let actual = read(path).map_err(|error| invalid(format!("{label} is missing: {error}")))?;
    if actual != expected {
        return Err(invalid(format!("{label} is stale.")));
    }
    Ok(())
}

fn main() -> Result<(), Error> {
    let arguments: BTreeSet<String> = std::env::args().skip(1).collect();
    let check_only = arguments.contains("--check");
    let baseline = arguments.contains("--baseline");
    if check_only && baseline {
        return Err(invalid(
            "SQ-E check and baseline modes are mutually exclusive.",
        ));
    }
    let matrix_bytes = read(MATRIX_PATH)
        .map_err(|error| invalid(format!("SQ-E catalog matrix is missing: {error}")))?;
    let matrix: CatalogMatrix = serde_json::from_slice(&matrix_bytes)
        .map_err(|error| invalid(format!("SQ-E catalog matrix is invalid: {error}")))?;
    validate_matrix(&matrix)?;
    let measurements = render_measurements(&matrix)?;
    let mut failures: Vec<String> = measurements.iter().flat_map(safety_failures).collect();
    failures.extend(role_failures(&measurements));
    let family_levels = family_level_report(&measurements, &mut failures);
    let duplicate_suspects = duplicate_report(&measurements);
    let report = json!({
        "reportRevision": 1,
        "analyzerRevision": PERCEPTUAL_ANALYZER_REVISION,
        "matrixRevision": matrix.matrix_revision,
        "blockFrames": matrix.block_frames,
        "probeCount": matrix.probe_count,
        "presetCount": EXPECTED_PRESETS,
        "sampleRates": [44_100, 48_000],
        "gates": {
            "maximumSingleTruePeakDbtp": SINGLE_TRUE_PEAK_LIMIT_DBTP,
            "maximumPolyphonyTruePeakDbtp": POLYPHONY_TRUE_PEAK_LIMIT_DBTP,
            "maximumAbsoluteDc": DC_LIMIT,
            "maximumEventDiscontinuity": DISCONTINUITY_LIMIT,
            "eventDiscontinuityKinds": ["single", "role-phrase", "polyphony"],
            "minimumMonoFoldLossDb": MONO_LOSS_LIMIT_DB,
            "minimumInterchannelCorrelation": CORRELATION_FLOOR,
            "maximumBassLowSideToMidDb": BASS_LOW_SIDE_LIMIT_DB,
            "maximumOtherLowSideToMidDb": OTHER_LOW_SIDE_LIMIT_DB,
            "minimumTrailingSilenceFrames": MINIMUM_TRAILING_SILENCE_FRAMES,
            "maximumPitchErrorCents": PITCH_ERROR_LIMIT_CENTS,
            "minimumPitchConfidence": PITCH_CONFIDENCE_FLOOR,
            "velocityRangeDb": [MINIMUM_VELOCITY_RANGE_DB, MAXIMUM_VELOCITY_RANGE_DB],
            "maximumRegisterSpreadDb": MAXIMUM_REGISTER_SPREAD_DB,
            "maximumFamilyLevelSpreadDb": MAXIMUM_FAMILY_LEVEL_SPREAD_DB,
            "maximumCrossRateLevelDeltaDb": MAXIMUM_CROSS_RATE_LEVEL_DELTA_DB,
            "maximumCrossRateSpectralDeltaRatio": MAXIMUM_CROSS_RATE_SPECTRAL_DELTA_RATIO,
            "maximumCrossRateTimeDeltaRatio": MAXIMUM_CROSS_RATE_TIME_DELTA_RATIO,
            "technicalDuplicateSuspectDistance": DUPLICATE_SUSPECT_DISTANCE,
        },
        "familyLevels": family_levels,
        "duplicateAnalysis": duplicate_suspects,
        "measurements": measurements.iter().map(measurement_json).collect::<Vec<_>>(),
        "failures": failures,
        "result": if failures.is_empty() { "pass" } else { "fail" },
    });
    let mut encoded = serde_json::to_vec_pretty(&report)
        .map_err(|error| invalid(format!("Could not encode SQ-E report: {error}")))?;
    encoded.push(b'\n');
    let path = if baseline { BASELINE_PATH } else { REPORT_PATH };
    if check_only {
        compare_file(Path::new(path), &encoded, "SQ-E catalog technical report")?;
    } else {
        write(path, &encoded)?;
    }
    if !failures.is_empty() && !baseline {
        return Err(invalid(format!(
            "SQ-E catalog failed {} frozen technical gates; inspect {REPORT_PATH}.",
            failures.len()
        )));
    }
    if !baseline {
        let (manifest, key) =
            audition_package(&matrix, &measurements, &duplicate_suspects, !check_only)?;
        if check_only {
            compare_file(
                Path::new(AUDITION_MANIFEST_PATH),
                &manifest,
                "SQ-F audition manifest",
            )?;
            compare_file(
                Path::new(AUDITION_KEY_PATH),
                &key,
                "SQ-F audition coordinator key",
            )?;
        } else {
            write(AUDITION_MANIFEST_PATH, manifest)?;
            write(AUDITION_KEY_PATH, key)?;
        }
    }
    if baseline {
        println!(
            "PASS SQ-E baseline captured with {} frozen-gate findings.",
            failures.len()
        );
    } else if check_only {
        println!("PASS SQ-E catalog and SQ-F audition evidence are current.");
    } else {
        println!("PASS SQ-E catalog technical evidence and 108 level-matched SQ-F context assets.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn discontinuity_probe(layers: &Value) -> CatalogProbe {
        CatalogProbe {
            kind: "protected-drum-mix".to_owned(),
            family: "lead".to_owned(),
            preset_id: "lead.test".to_owned(),
            role_position: "middle".to_owned(),
            velocity: 80,
            pitch: 69,
            expected_pitch_hz: 440.0,
            sample_rate: 48_000,
            steady_analysis_frame: 48_000,
            spectral_analysis_start_frame: 2_400,
            plan: json!({
                "ticksPerQuarter": 960,
                "tempoMap": [{ "tick": 0, "microBpm": 120_000_000_u64 }],
                "layers": layers,
            }),
        }
    }

    #[test]
    fn does_not_attribute_mixed_source_transients_to_the_synth() {
        let layers = json!([
            {
                "source": { "type": "subtractive-synth" },
                "events": [{ "startTick": 0, "durationTicks": 480 }],
            },
            {
                "source": { "type": "procedural-drums" },
                "events": [{ "startTick": 0 }],
            },
        ]);
        let probe = discontinuity_probe(&layers);

        assert!(event_discontinuity_frames(&probe).unwrap().is_empty());
    }
}
