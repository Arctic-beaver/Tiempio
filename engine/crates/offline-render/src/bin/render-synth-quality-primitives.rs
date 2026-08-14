use std::fs::{read, write};
use std::io::{Error, ErrorKind};
use std::path::Path;

use serde_json::{Value, json};
use tiempio_engine_dsp::{AntialiasedSaturator, PhaseOscillator, StereoFrame, saturate};
use tiempio_engine_offline_render::{
    OfflineBlockSink, PERCEPTUAL_ANALYZER_REVISION, PERCEPTUAL_CAPTURE_FRAMES,
    PerceptualAnalysisConfiguration, PerceptualAnalysisSink, PerceptualMetrics,
};

const REPORT_PATH: &str = "docs/evidence/sound-quality/SQ-C-PRIMITIVE-BAKEOFF.json";
const SAMPLE_RATES: [u32; 2] = [44_100, 48_000];
const WARMUP_FRAMES: usize = 2_048;
const COHERENT_FFT_FRAMES: u32 = 2_048;
const OSCILLATOR_BIN: u32 = 137;
const SATURATION_BIN: u32 = 257;
const SATURATION_DRIVE: f64 = 0.82;
const SATURATION_INPUT_LEVEL: f64 = 0.82;
const MINIMUM_ALIAS_IMPROVEMENT_DB: f64 = 3.0;
const MAXIMUM_CANDIDATE_ALIAS_DB: f64 = -18.0;
const MAXIMUM_DC_OFFSET: f64 = 0.002;
const MINIMUM_RMS_RATIO: f64 = 0.75;
const MAXIMUM_RMS_RATIO: f64 = 1.25;

#[derive(Clone, Copy, Debug)]
enum Probe {
    Square,
    Triangle,
    Saturation,
}

impl Probe {
    const ALL: [Self; 3] = [Self::Square, Self::Triangle, Self::Saturation];

    const fn id(self) -> &'static str {
        match self {
            Self::Square => "square",
            Self::Triangle => "triangle",
            Self::Saturation => "saturation",
        }
    }

    const fn frequency_bin(self) -> u32 {
        match self {
            Self::Square | Self::Triangle => OSCILLATOR_BIN,
            Self::Saturation => SATURATION_BIN,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct ReferencePhase {
    phase: f64,
}

impl ReferencePhase {
    fn take_and_advance(&mut self, step: f64) -> f64 {
        let current = self.phase;
        self.phase = (self.phase + step).fract();
        if self.phase.abs() < 1.0e-20 {
            self.phase = 0.0;
        }
        current
    }
}

fn invalid(message: impl Into<String>) -> Error {
    Error::new(ErrorKind::InvalidData, message.into())
}

fn probe_frequency(sample_rate: u32, probe: Probe) -> f64 {
    f64::from(sample_rate) * f64::from(probe.frequency_bin()) / f64::from(COHERENT_FFT_FRAMES)
}

fn render_pair(sample_rate: u32, probe: Probe) -> (Vec<StereoFrame>, Vec<StereoFrame>) {
    let frame_count = WARMUP_FRAMES.saturating_add(PERCEPTUAL_CAPTURE_FRAMES);
    let frequency_hz = probe_frequency(sample_rate, probe);
    let step = frequency_hz / f64::from(sample_rate);
    let mut reference_phase = ReferencePhase::default();
    let mut candidate_oscillator = PhaseOscillator::new();
    let mut candidate_saturator = AntialiasedSaturator::new();
    let mut reference = Vec::with_capacity(frame_count);
    let mut candidate = Vec::with_capacity(frame_count);

    for _ in 0..frame_count {
        let phase = reference_phase.take_and_advance(step);
        let (reference_sample, candidate_sample) = match probe {
            Probe::Square => (
                if phase < 0.5 { 1.0 } else { -1.0 },
                candidate_oscillator.next_pulse(frequency_hz, f64::from(sample_rate), 0.5),
            ),
            Probe::Triangle => (
                1.0 - 4.0 * (phase - 0.5).abs(),
                candidate_oscillator.next_triangle(frequency_hz, f64::from(sample_rate)),
            ),
            Probe::Saturation => {
                let input = SATURATION_INPUT_LEVEL * (std::f64::consts::TAU * phase).sin();
                (
                    saturate(input, SATURATION_DRIVE),
                    candidate_saturator.process(input, SATURATION_DRIVE),
                )
            }
        };
        reference.push(StereoFrame {
            left: reference_sample,
            right: reference_sample,
        });
        candidate.push(StereoFrame {
            left: candidate_sample,
            right: candidate_sample,
        });
    }
    (reference, candidate)
}

fn analyze(
    frames: &[StereoFrame],
    sample_rate: u32,
    fundamental_hz: f64,
) -> Result<PerceptualMetrics, Error> {
    let mut sink = PerceptualAnalysisSink::new(PerceptualAnalysisConfiguration {
        sample_rate,
        analysis_start_frame: u64::try_from(WARMUP_FRAMES).unwrap_or(u64::MAX),
        expected_pitch_hz: None,
        harmonic_fundamental_hz: Some(fundamental_hz),
    })
    .map_err(|error| invalid(format!("Analyzer configuration failed: {error:?}")))?;
    match sink.write_block(frames) {
        Ok(()) => {}
        Err(error) => match error {},
    }
    Ok(sink.finish())
}

fn alias_ratio(metrics: &PerceptualMetrics) -> Result<f64, Error> {
    metrics
        .harmonic_alias_ratio_db
        .ok_or_else(|| invalid("Harmonic alias ratio was not measured."))
}

fn metrics_json(metrics: &PerceptualMetrics) -> Result<Value, Error> {
    Ok(json!({
        "harmonicAliasRatioDb": alias_ratio(metrics)?,
        "samplePeak": metrics.sample_peak,
        "truePeak": metrics.true_peak,
        "rms": metrics.rms,
        "dcOffsetLeft": metrics.dc_offset_left,
        "dcOffsetRight": metrics.dc_offset_right,
        "maximumSampleDiscontinuity": metrics.maximum_sample_discontinuity,
        "capturedFrames": metrics.captured_frames,
    }))
}

fn validate_candidate(
    probe: Probe,
    sample_rate: u32,
    reference: &PerceptualMetrics,
    candidate: &PerceptualMetrics,
) -> Result<f64, Error> {
    let reference_alias = alias_ratio(reference)?;
    let candidate_alias = alias_ratio(candidate)?;
    let improvement_db = reference_alias - candidate_alias;
    if improvement_db < MINIMUM_ALIAS_IMPROVEMENT_DB {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz improved aliasing by only {improvement_db:.3} dB",
            probe.id()
        )));
    }
    if candidate_alias > MAXIMUM_CANDIDATE_ALIAS_DB {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz retained {candidate_alias:.3} dB alias energy",
            probe.id()
        )));
    }
    let maximum_dc = candidate
        .dc_offset_left
        .abs()
        .max(candidate.dc_offset_right.abs());
    if maximum_dc > MAXIMUM_DC_OFFSET {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz retained DC offset {maximum_dc:.6}",
            probe.id()
        )));
    }
    let rms_ratio = candidate.rms / reference.rms.max(f64::EPSILON);
    if !(MINIMUM_RMS_RATIO..=MAXIMUM_RMS_RATIO).contains(&rms_ratio) {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz changed RMS by an unsafe ratio {rms_ratio:.3}",
            probe.id()
        )));
    }
    if candidate.sample_peak > 1.0 + f64::EPSILON || candidate.true_peak > 1.35 {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz exceeded the bounded primitive peak",
            probe.id()
        )));
    }
    if candidate.maximum_sample_discontinuity
        > reference.maximum_sample_discontinuity * 1.05 + f64::EPSILON
    {
        return Err(invalid(format!(
            "{} at {sample_rate} Hz regressed sample discontinuity",
            probe.id()
        )));
    }
    Ok(improvement_db)
}

fn compare_file(path: &Path, expected: &[u8]) -> Result<(), Error> {
    let actual = read(path)
        .map_err(|error| invalid(format!("Primitive bakeoff report is missing: {error}")))?;
    if actual != expected {
        return Err(invalid("Synth primitive bakeoff report is stale."));
    }
    Ok(())
}

fn main() -> Result<(), Error> {
    let check_only = std::env::args()
        .skip(1)
        .any(|argument| argument == "--check");
    let mut rows = Vec::with_capacity(SAMPLE_RATES.len().saturating_mul(Probe::ALL.len()));
    for sample_rate in SAMPLE_RATES {
        for probe in Probe::ALL {
            let fundamental_hz = probe_frequency(sample_rate, probe);
            let (reference_frames, candidate_frames) = render_pair(sample_rate, probe);
            let reference = analyze(&reference_frames, sample_rate, fundamental_hz)?;
            let candidate = analyze(&candidate_frames, sample_rate, fundamental_hz)?;
            let improvement_db = validate_candidate(probe, sample_rate, &reference, &candidate)?;
            println!(
                "{} @ {sample_rate} Hz: alias {:.3} -> {:.3} dB ({improvement_db:.3} dB better)",
                probe.id(),
                alias_ratio(&reference)?,
                alias_ratio(&candidate)?,
            );
            rows.push(json!({
                "probe": probe.id(),
                "sampleRate": sample_rate,
                "fundamentalHz": fundamental_hz,
                "reference": metrics_json(&reference)?,
                "candidate": metrics_json(&candidate)?,
                "aliasImprovementDb": improvement_db,
                "result": "pass",
            }));
        }
    }

    let report = json!({
        "schemaVersion": 1,
        "analyzerRevision": PERCEPTUAL_ANALYZER_REVISION,
        "candidate": "sq-c-primitives",
        "reference": "offline-only-naive-and-memoryless-controls",
        "sampleRates": SAMPLE_RATES,
        "warmupFrames": WARMUP_FRAMES,
        "captureFrames": PERCEPTUAL_CAPTURE_FRAMES,
        "coherentFftFrames": COHERENT_FFT_FRAMES,
        "gates": {
            "minimumAliasImprovementDb": MINIMUM_ALIAS_IMPROVEMENT_DB,
            "maximumCandidateAliasDb": MAXIMUM_CANDIDATE_ALIAS_DB,
            "maximumDcOffset": MAXIMUM_DC_OFFSET,
            "minimumRmsRatio": MINIMUM_RMS_RATIO,
            "maximumRmsRatio": MAXIMUM_RMS_RATIO,
            "maximumSamplePeak": 1.0,
            "maximumTruePeak": 1.35,
            "maximumDiscontinuityRatio": 1.05,
        },
        "rows": rows,
        "result": "pass",
    });
    let mut bytes = serde_json::to_vec_pretty(&report).map_err(Error::other)?;
    bytes.push(b'\n');
    if check_only {
        compare_file(Path::new(REPORT_PATH), &bytes)?;
    } else {
        write(REPORT_PATH, bytes)?;
    }
    println!("Report: {REPORT_PATH}");
    println!("PASS synth quality primitive bakeoff");
    Ok(())
}
