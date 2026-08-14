use std::collections::BTreeMap;
use std::fs::{read, write};
use std::io::{Error, ErrorKind};
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use tiempio_engine_core::{PATCH_MODEL_VERSION, RENDER_PLAN_VERSION};
use tiempio_engine_offline_render::{
    CatalogAnalysisConfiguration, CatalogAnalysisResult, CatalogAnalysisSink, OfflineRenderRequest,
    PERCEPTUAL_ANALYZER_REVISION, render_to_sink,
};
use tiempio_engine_protocol::{ENGINE_PROTOCOL_VERSION, ProtocolSession};

const MATRIX_PATH: &str = "artifacts/sq-d-macro-matrix.json";
const REPORT_PATH: &str = "docs/evidence/sound-quality/SQ-D-MACRO-MAPPING.json";
const EXPECTED_MATRIX_REVISION: u32 = 1;
const EXPECTED_PROBES: usize = 275;
const EXPECTED_SWEEP_POINTS: usize = 11;
const TRUE_PEAK_LIMIT_DBTP: f64 = -1.0;
const DC_LIMIT: f64 = 0.001;
const DISCONTINUITY_LIMIT: f64 = 0.08;
const MONO_LOSS_LIMIT_DB: f64 = -3.0;
const CORRELATION_FLOOR: f64 = -0.20;
const LEVEL_STEP_LIMIT_DB: f64 = 1.0;
const CENTROID_STEP_LIMIT_RATIO: f64 = 2.0;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MacroMatrix {
    matrix_revision: u32,
    sample_rate: u32,
    block_frames: u32,
    steady_analysis_frame: u64,
    probe_count: usize,
    probes: Vec<MacroProbe>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MacroProbe {
    family: String,
    preset_id: String,
    #[serde(rename = "macro")]
    macro_id: String,
    value: f64,
    pitch: u8,
    spectral_analysis_start_frame: u64,
    plan: Value,
}

#[derive(Clone)]
struct Measurement {
    value: f64,
    descriptor: f64,
    level_db: f64,
    centroid_hz: f64,
    report: Value,
}

fn invalid(message: impl Into<String>) -> Error {
    Error::new(ErrorKind::InvalidData, message.into())
}

fn midi_frequency(pitch: u8) -> f64 {
    440.0 * 2.0_f64.powf((f64::from(pitch) - 69.0) / 12.0)
}

fn analysis_sink(matrix: &MacroMatrix, probe: &MacroProbe) -> Result<CatalogAnalysisSink, Error> {
    CatalogAnalysisSink::new(CatalogAnalysisConfiguration {
        sample_rate: matrix.sample_rate,
        spectral_start_frame: probe.spectral_analysis_start_frame,
        steady_analysis_frame: matrix.steady_analysis_frame,
        expected_pitch_hz: midi_frequency(probe.pitch),
        discontinuity_probe_frames: Vec::new(),
    })
    .map_err(|error| invalid(format!("Catalog analyzer configuration failed: {error:?}")))
}

fn command_body(sequence: u64, command_type: &str, payload: &Value) -> Result<Vec<u8>, Error> {
    serde_json::to_vec(&json!({
        "protocolVersion": ENGINE_PROTOCOL_VERSION,
        "requestId": format!("request.sq-d.{sequence}"),
        "sequence": sequence,
        "type": command_type,
        "payload": payload,
    }))
    .map_err(|error| invalid(format!("Could not encode protocol command: {error}")))
}

fn render_request(
    matrix: &MacroMatrix,
    probe: &MacroProbe,
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
        .map_err(|error| invalid(format!("SQ-D handshake failed: {error:?}")))?;
    let end_tick = probe
        .plan
        .get("endTick")
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid("SQ-D probe plan has no bounded end tick."))?;
    let command = session
        .accept_body(&command_body(
            1,
            "start-offline-render",
            &json!({
                "renderId": format!("render.sq-d.{index}"),
                "plan": probe.plan,
                "sampleRate": matrix.sample_rate,
                "blockFrames": matrix.block_frames,
                "endTick": end_tick,
            }),
        )?)
        .map_err(|error| invalid(format!("SQ-D render request failed: {error:?}")))?;
    OfflineRenderRequest::from_command(command.command, 1)
        .map_err(|error| invalid(format!("SQ-D request conversion failed: {error:?}")))
}

fn validate_matrix(matrix: &MacroMatrix) -> Result<(), Error> {
    if matrix.matrix_revision != EXPECTED_MATRIX_REVISION
        || matrix.probe_count != matrix.probes.len()
        || matrix.probe_count != EXPECTED_PROBES
        || matrix.sample_rate != 48_000
        || matrix.block_frames != 128
    {
        return Err(invalid(
            "SQ-D macro matrix shape is not the frozen current matrix.",
        ));
    }
    if matrix.probes.iter().any(|probe| {
        probe.family.is_empty()
            || probe.preset_id.is_empty()
            || !["brightness", "hardness", "dirt", "length", "width"]
                .contains(&probe.macro_id.as_str())
            || !probe.value.is_finite()
            || !(0.0..=1.0).contains(&probe.value)
            || probe.spectral_analysis_start_frame > matrix.steady_analysis_frame
    }) {
        return Err(invalid("SQ-D macro matrix contains an invalid probe."));
    }
    Ok(())
}

fn validate_safety(probe: &MacroProbe, analysis: &CatalogAnalysisResult) -> Result<(), Error> {
    let metrics = &analysis.metrics;
    let perceptual = &analysis.perceptual;
    let dc = analysis.steady_dc_offset;
    let low_side_limit = if probe.family == "bass" { -18.0 } else { -12.0 };
    let mut failures = Vec::new();
    if metrics.non_finite_sample_count != 0 {
        failures.push(format!("nonFinite={}", metrics.non_finite_sample_count));
    }
    if metrics.clipped_sample_count != 0 {
        failures.push(format!("clipped={}", metrics.clipped_sample_count));
    }
    if perceptual.true_peak_dbtp > TRUE_PEAK_LIMIT_DBTP {
        failures.push(format!(
            "truePeak={:.3}>{TRUE_PEAK_LIMIT_DBTP:.3} dBTP",
            perceptual.true_peak_dbtp
        ));
    }
    if dc > DC_LIMIT {
        failures.push(format!("dc={dc:.6}>{DC_LIMIT:.6}"));
    }
    if perceptual.maximum_sample_discontinuity > DISCONTINUITY_LIMIT {
        failures.push(format!(
            "discontinuity={:.6}>{DISCONTINUITY_LIMIT:.6}",
            perceptual.maximum_sample_discontinuity
        ));
    }
    if perceptual.mono_fold_loss_db < MONO_LOSS_LIMIT_DB {
        failures.push(format!(
            "monoLoss={:.3}<{MONO_LOSS_LIMIT_DB:.3} dB",
            perceptual.mono_fold_loss_db
        ));
    }
    if perceptual.interchannel_correlation < CORRELATION_FLOOR {
        failures.push(format!(
            "correlation={:.4}<{CORRELATION_FLOOR:.4}",
            perceptual.interchannel_correlation
        ));
    }
    if perceptual.low_side_to_mid_db > low_side_limit {
        failures.push(format!(
            "lowSideToMid={:.3}>{low_side_limit:.3} dB",
            perceptual.low_side_to_mid_db
        ));
    }
    if metrics.trailing_silent_frames < 2_048 {
        failures.push(format!(
            "trailingSilentFrames={}<2048",
            metrics.trailing_silent_frames
        ));
    }
    if !failures.is_empty() {
        return Err(invalid(format!(
            "{}.{} at {:.2} failed frozen safety gates: {}",
            probe.preset_id,
            probe.macro_id,
            probe.value,
            failures.join(", ")
        )));
    }
    Ok(())
}

fn descriptor(probe: &MacroProbe, analysis: &CatalogAnalysisResult) -> Result<f64, Error> {
    let value = match probe.macro_id.as_str() {
        "brightness" | "dirt" => analysis.perceptual.spectral.centroid_hz,
        "hardness" => 1.0 / (1.0 + count_as_f64(analysis.attack_frames)),
        "length" => count_as_f64(analysis.metrics.last_non_silent_frame.unwrap_or(0)),
        "width" => analysis.side_to_mid_db,
        _ => return Err(invalid("SQ-D probe names an unknown macro.")),
    };
    if !value.is_finite() {
        return Err(invalid("SQ-D macro descriptor is non-finite."));
    }
    Ok(value)
}

fn count_as_f64(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}

fn measurement_json(probe: &MacroProbe, analysis: &CatalogAnalysisResult, value: f64) -> Value {
    json!({
        "family": probe.family,
        "presetId": probe.preset_id,
        "macro": probe.macro_id,
        "value": probe.value,
        "spectralAnalysisStartFrame": probe.spectral_analysis_start_frame,
        "descriptor": value,
        "attackFrames": analysis.attack_frames,
        "audibleThroughFrame": analysis.metrics.last_non_silent_frame,
        "centroidHz": analysis.perceptual.spectral.centroid_hz,
        "rolloff95Hz": analysis.perceptual.spectral.rolloff_95_hz,
        "sideToMidDb": analysis.side_to_mid_db,
        "kWeightedLevelDb": analysis.perceptual.k_weighted_level_db,
        "truePeakDbtp": analysis.perceptual.true_peak_dbtp,
        "monoFoldLossDb": analysis.perceptual.mono_fold_loss_db,
        "interchannelCorrelation": analysis.perceptual.interchannel_correlation,
        "lowSideToMidDb": analysis.perceptual.low_side_to_mid_db,
        "steadyDcOffset": analysis.steady_dc_offset,
        "maximumSampleDiscontinuity": analysis.perceptual.maximum_sample_discontinuity,
        "pcm16Fnv1a64": format!("{:016x}", analysis.metrics.pcm16_fnv1a64),
    })
}

fn render_measurements(
    matrix: &MacroMatrix,
) -> Result<BTreeMap<(String, String), Vec<Measurement>>, Error> {
    let mut groups: BTreeMap<(String, String), Vec<Measurement>> = BTreeMap::new();
    for (index, probe) in matrix.probes.iter().enumerate() {
        let mut sink = analysis_sink(matrix, probe)?;
        render_to_sink(render_request(matrix, probe, index)?, &mut sink)
            .map_err(|error| invalid(format!("SQ-D render failed: {error:?}")))?;
        let analysis = sink.finish();
        validate_safety(probe, &analysis)?;
        let measured_descriptor = descriptor(probe, &analysis)?;
        groups
            .entry((probe.family.clone(), probe.macro_id.clone()))
            .or_default()
            .push(Measurement {
                value: probe.value,
                descriptor: measured_descriptor,
                level_db: analysis.perceptual.k_weighted_level_db,
                centroid_hz: analysis.perceptual.spectral.centroid_hz,
                report: measurement_json(probe, &analysis, measured_descriptor),
            });
    }
    Ok(groups)
}

fn average_ranks(values: &[f64]) -> Vec<f64> {
    let mut indexed: Vec<(usize, f64)> = values.iter().copied().enumerate().collect();
    indexed.sort_by(|left, right| left.1.total_cmp(&right.1));
    let mut ranks = vec![0.0; values.len()];
    let mut start = 0;
    while start < indexed.len() {
        let mut end = start + 1;
        while end < indexed.len() && indexed[end].1.total_cmp(&indexed[start].1).is_eq() {
            end += 1;
        }
        let average = 0.5
            * (count_as_f64(u64::try_from(start + 1).unwrap_or(u64::MAX))
                + count_as_f64(u64::try_from(end).unwrap_or(u64::MAX)));
        for &(original, _) in &indexed[start..end] {
            ranks[original] = average;
        }
        start = end;
    }
    ranks
}

fn spearman(left: &[f64], right: &[f64]) -> Result<f64, Error> {
    if left.len() != right.len() || left.len() < 2 {
        return Err(invalid(
            "Spearman inputs must have the same non-trivial length.",
        ));
    }
    let left_ranks = average_ranks(left);
    let right_ranks = average_ranks(right);
    let count = count_as_f64(u64::try_from(left.len()).unwrap_or(u64::MAX));
    let left_mean = left_ranks.iter().sum::<f64>() / count;
    let right_mean = right_ranks.iter().sum::<f64>() / count;
    let mut covariance = 0.0;
    let mut left_variance = 0.0;
    let mut right_variance = 0.0;
    for (left_rank, right_rank) in left_ranks.iter().zip(&right_ranks) {
        let left_delta = left_rank - left_mean;
        let right_delta = right_rank - right_mean;
        covariance = left_delta.mul_add(right_delta, covariance);
        left_variance = left_delta.mul_add(left_delta, left_variance);
        right_variance = right_delta.mul_add(right_delta, right_variance);
    }
    let denominator = (left_variance * right_variance).sqrt();
    if denominator <= f64::EPSILON {
        return Err(invalid("Spearman descriptor has no measurable variance."));
    }
    Ok(covariance / denominator)
}

fn validate_continuity(
    family: &str,
    macro_id: &str,
    measurements: &[Measurement],
) -> Result<(), Error> {
    for pair in measurements.windows(2) {
        let previous = &pair[0];
        let current = &pair[1];
        let level_delta = (current.level_db - previous.level_db).abs();
        if level_delta > LEVEL_STEP_LIMIT_DB {
            let level_trace = measurements
                .iter()
                .map(|row| format!("{:.2}:{:.3}", row.value, row.level_db))
                .collect::<Vec<_>>()
                .join(", ");
            return Err(invalid(format!(
                "{family}.{macro_id} values {:.2}->{:.2} levels {:.3}->{:.3} dB (delta {level_delta:.3}) exceed {LEVEL_STEP_LIMIT_DB:.3} dB; trace [{level_trace}]",
                previous.value, current.value, previous.level_db, current.level_db,
            )));
        }
        let centroid_ratio = current.centroid_hz.max(previous.centroid_hz)
            / current
                .centroid_hz
                .min(previous.centroid_hz)
                .max(f64::EPSILON);
        if centroid_ratio > CENTROID_STEP_LIMIT_RATIO {
            return Err(invalid(format!(
                "{family}.{macro_id} values {:.2}->{:.2} centroid ratio {centroid_ratio:.3} exceeds {CENTROID_STEP_LIMIT_RATIO:.3}",
                previous.value, current.value
            )));
        }
    }
    Ok(())
}

fn report_groups(
    groups: BTreeMap<(String, String), Vec<Measurement>>,
) -> Result<Vec<Value>, Error> {
    let mut reports = Vec::with_capacity(groups.len());
    let mut failures = Vec::new();
    for ((family, macro_id), mut measurements) in groups {
        measurements.sort_by(|left, right| left.value.total_cmp(&right.value));
        if measurements.len() != EXPECTED_SWEEP_POINTS {
            return Err(invalid(
                "SQ-D macro group does not contain eleven sweep points.",
            ));
        }
        if let Err(error) = validate_continuity(&family, &macro_id, &measurements) {
            failures.push(error.to_string());
        }
        let inputs: Vec<f64> = measurements.iter().map(|row| row.value).collect();
        let outputs: Vec<f64> = measurements.iter().map(|row| row.descriptor).collect();
        let rho = match spearman(&inputs, &outputs) {
            Ok(value) => value,
            Err(error) => {
                failures.push(format!("{family}.{macro_id}: {error}"));
                continue;
            }
        };
        let minimum = if ["hardness", "dirt"].contains(&macro_id.as_str()) {
            0.85
        } else {
            0.90
        };
        if rho < minimum {
            failures.push(format!(
                "{family}.{macro_id} Spearman rho {rho:.4} is below {minimum:.2}"
            ));
        }
        reports.push(json!({
            "family": family,
            "macro": macro_id,
            "spearmanRho": rho,
            "minimumRho": minimum,
            "result": "pass",
            "measurements": measurements.into_iter().map(|row| row.report).collect::<Vec<_>>(),
        }));
    }
    if !failures.is_empty() {
        return Err(invalid(format!(
            "SQ-D macro group gates failed:\n- {}",
            failures.join("\n- ")
        )));
    }
    Ok(reports)
}

fn compare_file(path: &Path, expected: &[u8]) -> Result<(), Error> {
    let actual = read(path).map_err(|error| invalid(format!("SQ-D report is missing: {error}")))?;
    if actual != expected {
        return Err(invalid("SQ-D macro mapping report is stale."));
    }
    Ok(())
}

fn main() -> Result<(), Error> {
    let check_only = std::env::args()
        .skip(1)
        .any(|argument| argument == "--check");
    let matrix_bytes = read(MATRIX_PATH)
        .map_err(|error| invalid(format!("SQ-D macro matrix is missing: {error}")))?;
    let matrix: MacroMatrix = serde_json::from_slice(&matrix_bytes)
        .map_err(|error| invalid(format!("SQ-D macro matrix is invalid: {error}")))?;
    validate_matrix(&matrix)?;
    let groups = report_groups(render_measurements(&matrix)?)?;
    let report = json!({
        "reportRevision": 1,
        "analyzerRevision": PERCEPTUAL_ANALYZER_REVISION,
        "matrixRevision": matrix.matrix_revision,
        "sampleRate": matrix.sample_rate,
        "blockFrames": matrix.block_frames,
        "steadyAnalysisFrame": matrix.steady_analysis_frame,
        "probeCount": matrix.probe_count,
        "groupCount": groups.len(),
        "gates": {
            "brightnessLengthWidthMinimumRho": 0.90,
            "hardnessDirtMinimumRho": 0.85,
            "maximumTruePeakDbtp": TRUE_PEAK_LIMIT_DBTP,
            "maximumAbsoluteDc": DC_LIMIT,
            "maximumSampleDiscontinuity": DISCONTINUITY_LIMIT,
            "minimumMonoFoldLossDb": MONO_LOSS_LIMIT_DB,
            "minimumInterchannelCorrelation": CORRELATION_FLOOR,
            "maximumAdjacentLevelDeltaDb": LEVEL_STEP_LIMIT_DB,
            "maximumAdjacentCentroidRatio": CENTROID_STEP_LIMIT_RATIO,
        },
        "groups": groups,
        "result": "pass",
    });
    let mut encoded = serde_json::to_vec_pretty(&report)
        .map_err(|error| invalid(format!("Could not encode SQ-D report: {error}")))?;
    encoded.push(b'\n');
    if check_only {
        compare_file(Path::new(REPORT_PATH), &encoded)?;
        println!("PASS SQ-D macro mapping evidence is current.");
    } else {
        write(REPORT_PATH, encoded)?;
        println!("PASS SQ-D macro mapping evidence: 25 audio descriptor sweeps.");
    }
    Ok(())
}
