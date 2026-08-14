use std::convert::Infallible;
use std::f64::consts::{PI, TAU};

use tiempio_engine_dsp::{DspConfiguration, DspConfigurationError, StereoFrame};

use crate::OfflineBlockSink;

pub const PERCEPTUAL_ANALYZER_REVISION: u32 = 3;
pub const PERCEPTUAL_CAPTURE_FRAMES: usize = 8_192;
pub const PERCEPTUAL_SPECTRAL_FFT_FRAMES: usize = 2_048;
const SPECTRAL_HOP_FRAMES: usize = 1_024;
const TRUE_PEAK_PHASES: usize = 4;
const TRUE_PEAK_TAPS: usize = 16;
const TAIL_THRESHOLD: f64 = 1.0e-4;
const LEVEL_FLOOR: f64 = 1.0e-15;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerceptualAnalysisConfiguration {
    pub sample_rate: u32,
    pub analysis_start_frame: u64,
    pub expected_pitch_hz: Option<f64>,
    pub harmonic_fundamental_hz: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PerceptualAnalysisError {
    Configuration(DspConfigurationError),
    InvalidAnalysisStart,
    InvalidExpectedFrequency,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpectralDescriptors {
    pub centroid_hz: f64,
    pub rolloff_95_hz: f64,
    pub positive_flux: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PitchDescriptor {
    pub confidence: f64,
    pub error_cents: f64,
    pub measured_hz: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerceptualMetrics {
    pub frame_count: u64,
    pub sample_peak: f64,
    pub true_peak: f64,
    pub true_peak_dbtp: f64,
    pub rms: f64,
    pub rms_dbfs: f64,
    pub k_weighted_level_db: f64,
    pub dc_offset_left: f64,
    pub dc_offset_right: f64,
    pub interchannel_correlation: f64,
    pub mono_fold_loss_db: f64,
    pub low_side_to_mid_db: f64,
    pub maximum_sample_discontinuity: f64,
    pub trailing_silent_frames: u64,
    pub captured_frames: usize,
    pub spectral: SpectralDescriptors,
    pub pitch: Option<PitchDescriptor>,
    pub harmonic_alias_ratio_db: Option<f64>,
}

#[derive(Clone, Copy)]
struct BiquadCoefficients {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

#[derive(Clone, Copy, Default)]
struct BiquadState {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl BiquadState {
    fn process(&mut self, sample: f64, coefficients: BiquadCoefficients) -> f64 {
        let output = coefficients.b0.mul_add(
            sample,
            coefficients.b1.mul_add(
                self.x1,
                coefficients.b2.mul_add(
                    self.x2,
                    -coefficients.a1.mul_add(self.y1, coefficients.a2 * self.y2),
                ),
            ),
        );
        self.x2 = self.x1;
        self.x1 = sample;
        self.y2 = self.y1;
        self.y1 = if output.is_finite() { output } else { 0.0 };
        self.y1
    }
}

#[derive(Clone, Copy, Default)]
struct KWeightingChannel {
    shelf: BiquadState,
    high_pass: BiquadState,
}

impl KWeightingChannel {
    fn process(
        &mut self,
        sample: f64,
        shelf_coefficients: BiquadCoefficients,
        high_pass_coefficients: BiquadCoefficients,
    ) -> f64 {
        let filtered = self.shelf.process(sample, shelf_coefficients);
        self.high_pass.process(filtered, high_pass_coefficients)
    }
}

struct TruePeakMeter {
    coefficients: [[f64; TRUE_PEAK_TAPS]; TRUE_PEAK_PHASES],
    left: [f64; TRUE_PEAK_TAPS],
    right: [f64; TRUE_PEAK_TAPS],
    position: usize,
    peak: f64,
}

impl TruePeakMeter {
    fn new() -> Self {
        Self {
            coefficients: interpolation_coefficients(),
            left: [0.0; TRUE_PEAK_TAPS],
            right: [0.0; TRUE_PEAK_TAPS],
            position: 0,
            peak: 0.0,
        }
    }

    fn push(&mut self, left: f64, right: f64) {
        self.left[self.position] = left;
        self.right[self.position] = right;
        self.peak = self.peak.max(left.abs()).max(right.abs());
        for phase in &self.coefficients {
            let mut reconstructed_left = 0.0;
            let mut reconstructed_right = 0.0;
            for (lag, coefficient) in phase.iter().enumerate() {
                let index = (self.position + TRUE_PEAK_TAPS - lag) % TRUE_PEAK_TAPS;
                reconstructed_left = coefficient.mul_add(self.left[index], reconstructed_left);
                reconstructed_right = coefficient.mul_add(self.right[index], reconstructed_right);
            }
            self.peak = self
                .peak
                .max(reconstructed_left.abs())
                .max(reconstructed_right.abs());
        }
        self.position = (self.position + 1) % TRUE_PEAK_TAPS;
    }

    fn finish(mut self) -> f64 {
        for _ in 0..TRUE_PEAK_TAPS {
            self.push(0.0, 0.0);
        }
        self.peak
    }
}

pub struct PerceptualAnalysisSink {
    configuration: PerceptualAnalysisConfiguration,
    true_peak: TruePeakMeter,
    k_shelf: BiquadCoefficients,
    k_high_pass: BiquadCoefficients,
    k_left: KWeightingChannel,
    k_right: KWeightingChannel,
    frame_count: u64,
    sample_peak: f64,
    sum_squares: f64,
    sum_left: f64,
    sum_right: f64,
    sum_left_squares: f64,
    sum_right_squares: f64,
    sum_cross: f64,
    sum_mid_squares: f64,
    k_energy_left: f64,
    k_energy_right: f64,
    low_mid_state: f64,
    low_side_state: f64,
    low_mid_energy: f64,
    low_side_energy: f64,
    low_alpha: f64,
    previous_left: f64,
    previous_right: f64,
    maximum_sample_discontinuity: f64,
    last_audible_frame: Option<u64>,
    capture: Vec<f64>,
}

impl PerceptualAnalysisSink {
    /// Creates a bounded streaming perceptual analyzer for an offline render.
    ///
    /// # Errors
    ///
    /// Returns a stable configuration error for unsupported sample rates, unsafe frame indices or
    /// non-finite expected frequencies.
    pub fn new(
        configuration: PerceptualAnalysisConfiguration,
    ) -> Result<Self, PerceptualAnalysisError> {
        DspConfiguration::new(configuration.sample_rate, 1)
            .map_err(PerceptualAnalysisError::Configuration)?;
        if configuration.analysis_start_frame > tiempio_engine_core::MAX_SAFE_INTEGER {
            return Err(PerceptualAnalysisError::InvalidAnalysisStart);
        }
        for frequency in [
            configuration.expected_pitch_hz,
            configuration.harmonic_fundamental_hz,
        ]
        .into_iter()
        .flatten()
        {
            if !frequency.is_finite()
                || frequency <= 0.0
                || frequency >= f64::from(configuration.sample_rate) * 0.5
            {
                return Err(PerceptualAnalysisError::InvalidExpectedFrequency);
            }
        }
        let (k_shelf, k_high_pass) = k_weighting_coefficients(configuration.sample_rate);
        Ok(Self {
            configuration,
            true_peak: TruePeakMeter::new(),
            k_shelf,
            k_high_pass,
            k_left: KWeightingChannel::default(),
            k_right: KWeightingChannel::default(),
            frame_count: 0,
            sample_peak: 0.0,
            sum_squares: 0.0,
            sum_left: 0.0,
            sum_right: 0.0,
            sum_left_squares: 0.0,
            sum_right_squares: 0.0,
            sum_cross: 0.0,
            sum_mid_squares: 0.0,
            k_energy_left: 0.0,
            k_energy_right: 0.0,
            low_mid_state: 0.0,
            low_side_state: 0.0,
            low_mid_energy: 0.0,
            low_side_energy: 0.0,
            low_alpha: 1.0 - (-TAU * 160.0 / f64::from(configuration.sample_rate)).exp(),
            previous_left: 0.0,
            previous_right: 0.0,
            maximum_sample_discontinuity: 0.0,
            last_audible_frame: None,
            capture: Vec::with_capacity(PERCEPTUAL_CAPTURE_FRAMES),
        })
    }

    #[must_use]
    pub fn finish(self) -> PerceptualMetrics {
        let frame_denominator = count_as_f64(self.frame_count.max(1));
        let sample_denominator = frame_denominator * 2.0;
        let rms = (self.sum_squares / sample_denominator).sqrt();
        let channel_energy = (self.k_energy_left + self.k_energy_right) / frame_denominator;
        let correlation_denominator = (self.sum_left_squares * self.sum_right_squares).sqrt();
        let stereo_reference = (self.sum_left_squares + self.sum_right_squares) * 0.5;
        let true_peak = self.true_peak.finish();
        let spectral = spectral_descriptors(&self.capture, self.configuration.sample_rate);
        PerceptualMetrics {
            frame_count: self.frame_count,
            sample_peak: self.sample_peak,
            true_peak,
            true_peak_dbtp: decibels(true_peak),
            rms,
            rms_dbfs: decibels(rms),
            k_weighted_level_db: -0.691 + 10.0 * channel_energy.max(LEVEL_FLOOR).log10(),
            dc_offset_left: self.sum_left / frame_denominator,
            dc_offset_right: self.sum_right / frame_denominator,
            interchannel_correlation: if correlation_denominator > LEVEL_FLOOR {
                self.sum_cross / correlation_denominator
            } else {
                0.0
            },
            mono_fold_loss_db: 10.0
                * (self.sum_mid_squares / stereo_reference.max(LEVEL_FLOOR))
                    .max(LEVEL_FLOOR)
                    .log10(),
            low_side_to_mid_db: 10.0
                * (self.low_side_energy / self.low_mid_energy.max(LEVEL_FLOOR))
                    .max(LEVEL_FLOOR)
                    .log10(),
            maximum_sample_discontinuity: self.maximum_sample_discontinuity,
            trailing_silent_frames: self.last_audible_frame.map_or(self.frame_count, |frame| {
                self.frame_count.saturating_sub(frame + 1)
            }),
            captured_frames: self.capture.len(),
            spectral,
            pitch: self.configuration.expected_pitch_hz.and_then(|expected| {
                pitch_descriptor(&self.capture, self.configuration.sample_rate, expected)
            }),
            harmonic_alias_ratio_db: self.configuration.harmonic_fundamental_hz.map(
                |fundamental| {
                    harmonic_alias_ratio_db(
                        &self.capture,
                        self.configuration.sample_rate,
                        fundamental,
                    )
                },
            ),
        }
    }
}

impl OfflineBlockSink for PerceptualAnalysisSink {
    type Error = Infallible;

    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error> {
        for frame in block {
            let left = finite_or_silence(frame.left);
            let right = finite_or_silence(frame.right);
            self.sample_peak = self.sample_peak.max(left.abs()).max(right.abs());
            self.true_peak.push(left, right);
            self.sum_squares += left.mul_add(left, right * right);
            self.sum_left += left;
            self.sum_right += right;
            self.sum_left_squares = left.mul_add(left, self.sum_left_squares);
            self.sum_right_squares = right.mul_add(right, self.sum_right_squares);
            self.sum_cross = left.mul_add(right, self.sum_cross);
            let mid = (left + right) * 0.5;
            let side = (left - right) * 0.5;
            self.sum_mid_squares = mid.mul_add(mid, self.sum_mid_squares);
            self.low_mid_state += self.low_alpha * (mid - self.low_mid_state);
            self.low_side_state += self.low_alpha * (side - self.low_side_state);
            self.low_mid_energy = self
                .low_mid_state
                .mul_add(self.low_mid_state, self.low_mid_energy);
            self.low_side_energy = self
                .low_side_state
                .mul_add(self.low_side_state, self.low_side_energy);
            let weighted_left = self.k_left.process(left, self.k_shelf, self.k_high_pass);
            let weighted_right = self.k_right.process(right, self.k_shelf, self.k_high_pass);
            self.k_energy_left = weighted_left.mul_add(weighted_left, self.k_energy_left);
            self.k_energy_right = weighted_right.mul_add(weighted_right, self.k_energy_right);
            self.maximum_sample_discontinuity = self
                .maximum_sample_discontinuity
                .max((left - self.previous_left).abs())
                .max((right - self.previous_right).abs());
            self.previous_left = left;
            self.previous_right = right;
            if left.abs().max(right.abs()) >= TAIL_THRESHOLD {
                self.last_audible_frame = Some(self.frame_count);
            }
            if self.frame_count >= self.configuration.analysis_start_frame
                && self.capture.len() < PERCEPTUAL_CAPTURE_FRAMES
            {
                self.capture.push(mid);
            }
            self.frame_count = self.frame_count.saturating_add(1);
        }
        Ok(())
    }
}

fn finite_or_silence(sample: f64) -> f64 {
    if sample.is_finite() { sample } else { 0.0 }
}

fn decibels(value: f64) -> f64 {
    20.0 * value.max(LEVEL_FLOOR).log10()
}

fn count_as_f64(value: u64) -> f64 {
    let high = u32::try_from(value >> 32).unwrap_or(u32::MAX);
    let low = u32::try_from(value & u64::from(u32::MAX)).unwrap_or(u32::MAX);
    f64::from(high).mul_add(4_294_967_296.0, f64::from(low))
}

fn interpolation_coefficients() -> [[f64; TRUE_PEAK_TAPS]; TRUE_PEAK_PHASES] {
    let mut coefficients = [[0.0; TRUE_PEAK_TAPS]; TRUE_PEAK_PHASES];
    for (phase, taps) in coefficients.iter_mut().enumerate() {
        let fraction = count_as_f64(u64::try_from(phase).unwrap_or(0))
            / count_as_f64(u64::try_from(TRUE_PEAK_PHASES).unwrap_or(1));
        let mut sum = 0.0;
        for (tap, coefficient) in taps.iter_mut().enumerate() {
            let offset = count_as_f64(u64::try_from(tap).unwrap_or(0)) - 8.0 + fraction;
            let sinc = if offset.abs() < f64::EPSILON {
                1.0
            } else {
                (PI * offset).sin() / (PI * offset)
            };
            let window = if offset.abs() < 8.0 {
                0.5 + 0.5 * (PI * offset / 8.0).cos()
            } else {
                0.0
            };
            *coefficient = sinc * window;
            sum += *coefficient;
        }
        for coefficient in taps {
            *coefficient /= sum.max(LEVEL_FLOOR);
        }
    }
    coefficients
}

fn k_weighting_coefficients(sample_rate: u32) -> (BiquadCoefficients, BiquadCoefficients) {
    let shelf = high_shelf_coefficients(
        sample_rate,
        1_681.974_450_955_533,
        3.999_843_853_973_347,
        0.707_175_236_955_419_6,
    );
    let high_pass =
        high_pass_coefficients(sample_rate, 38.135_470_876_024_44, 0.500_327_037_323_877_3);
    (shelf, high_pass)
}

fn high_shelf_coefficients(
    sample_rate: u32,
    frequency_hz: f64,
    gain_db: f64,
    quality: f64,
) -> BiquadCoefficients {
    let amplitude = 10.0_f64.powf(gain_db / 40.0);
    let omega = TAU * frequency_hz / f64::from(sample_rate);
    let cosine = omega.cos();
    let sine = omega.sin();
    let alpha = sine / (2.0 * quality);
    let root = amplitude.sqrt();
    normalize_biquad(
        amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cosine + 2.0 * root * alpha),
        -2.0 * amplitude * ((amplitude - 1.0) + (amplitude + 1.0) * cosine),
        amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cosine - 2.0 * root * alpha),
        (amplitude + 1.0) - (amplitude - 1.0) * cosine + 2.0 * root * alpha,
        2.0 * ((amplitude - 1.0) - (amplitude + 1.0) * cosine),
        (amplitude + 1.0) - (amplitude - 1.0) * cosine - 2.0 * root * alpha,
    )
}

fn high_pass_coefficients(sample_rate: u32, frequency_hz: f64, quality: f64) -> BiquadCoefficients {
    let omega = TAU * frequency_hz / f64::from(sample_rate);
    let cosine = omega.cos();
    let alpha = omega.sin() / (2.0 * quality);
    normalize_biquad(
        (1.0 + cosine) * 0.5,
        -(1.0 + cosine),
        (1.0 + cosine) * 0.5,
        1.0 + alpha,
        -2.0 * cosine,
        1.0 - alpha,
    )
}

fn normalize_biquad(b0: f64, b1: f64, b2: f64, a0: f64, a1: f64, a2: f64) -> BiquadCoefficients {
    BiquadCoefficients {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

#[derive(Clone, Copy, Default)]
struct Complex {
    real: f64,
    imaginary: f64,
}

impl Complex {
    fn magnitude_squared(self) -> f64 {
        self.real
            .mul_add(self.real, self.imaginary * self.imaginary)
    }
}

fn fft(samples: &[f64], frame_size: usize) -> Vec<Complex> {
    let mut spectrum = vec![Complex::default(); frame_size];
    let denominator = count_as_f64(u64::try_from(frame_size.saturating_sub(1)).unwrap_or(1));
    for (index, bin) in spectrum.iter_mut().enumerate() {
        let sample = samples.get(index).copied().unwrap_or(0.0);
        let phase = TAU * count_as_f64(u64::try_from(index).unwrap_or(0)) / denominator;
        bin.real = sample * (0.5 - 0.5 * phase.cos());
    }
    let bits = frame_size.trailing_zeros();
    for index in 0..frame_size {
        let reversed = index.reverse_bits() >> (usize::BITS - bits);
        if reversed > index {
            spectrum.swap(index, reversed);
        }
    }
    let mut width = 2;
    while width <= frame_size {
        let half = width / 2;
        let angle = -TAU / count_as_f64(u64::try_from(width).unwrap_or(1));
        for start in (0..frame_size).step_by(width) {
            for offset in 0..half {
                let twiddle_angle = angle * count_as_f64(u64::try_from(offset).unwrap_or(0));
                let cosine = twiddle_angle.cos();
                let sine = twiddle_angle.sin();
                let right = spectrum[start + offset + half];
                let rotated = Complex {
                    real: right.real.mul_add(cosine, -right.imaginary * sine),
                    imaginary: right.real.mul_add(sine, right.imaginary * cosine),
                };
                let left = spectrum[start + offset];
                spectrum[start + offset] = Complex {
                    real: left.real + rotated.real,
                    imaginary: left.imaginary + rotated.imaginary,
                };
                spectrum[start + offset + half] = Complex {
                    real: left.real - rotated.real,
                    imaginary: left.imaginary - rotated.imaginary,
                };
            }
        }
        width = width.saturating_mul(2);
    }
    spectrum
}

fn spectral_descriptors(samples: &[f64], sample_rate: u32) -> SpectralDescriptors {
    if samples.is_empty() {
        return SpectralDescriptors::default();
    }
    let frame_count = if samples.len() <= PERCEPTUAL_SPECTRAL_FFT_FRAMES {
        1
    } else {
        1 + (samples.len() - PERCEPTUAL_SPECTRAL_FFT_FRAMES) / SPECTRAL_HOP_FRAMES
    };
    let mut centroid_sum = 0.0;
    let mut rolloff_sum = 0.0;
    let mut flux_sum = 0.0;
    let mut previous = Vec::new();
    for frame_index in 0..frame_count {
        let start = frame_index.saturating_mul(SPECTRAL_HOP_FRAMES);
        let spectrum = fft(&samples[start..], PERCEPTUAL_SPECTRAL_FFT_FRAMES);
        let energies: Vec<f64> = spectrum
            .iter()
            .take(PERCEPTUAL_SPECTRAL_FFT_FRAMES / 2 + 1)
            .map(|bin| bin.magnitude_squared())
            .collect();
        let total_energy = energies.iter().sum::<f64>().max(LEVEL_FLOOR);
        let bin_hz = f64::from(sample_rate)
            / count_as_f64(u64::try_from(PERCEPTUAL_SPECTRAL_FFT_FRAMES).unwrap_or(1));
        centroid_sum += energies
            .iter()
            .enumerate()
            .map(|(index, energy)| {
                count_as_f64(u64::try_from(index).unwrap_or(0)) * bin_hz * energy
            })
            .sum::<f64>()
            / total_energy;
        let target = total_energy * 0.95;
        let mut cumulative = 0.0;
        let mut rolloff_bin = 0;
        for (index, energy) in energies.iter().enumerate() {
            cumulative += energy;
            if cumulative >= target {
                rolloff_bin = index;
                break;
            }
        }
        rolloff_sum += count_as_f64(u64::try_from(rolloff_bin).unwrap_or(0)) * bin_hz;
        let normalized: Vec<f64> = energies
            .iter()
            .map(|energy| energy / total_energy)
            .collect();
        if !previous.is_empty() {
            flux_sum += normalized
                .iter()
                .zip(&previous)
                .map(|(current, prior)| (current - prior).max(0.0))
                .sum::<f64>();
        }
        previous = normalized;
    }
    let denominator = count_as_f64(u64::try_from(frame_count).unwrap_or(1));
    SpectralDescriptors {
        centroid_hz: centroid_sum / denominator,
        rolloff_95_hz: rolloff_sum / denominator,
        positive_flux: flux_sum / denominator,
    }
}

fn pitch_descriptor(
    samples: &[f64],
    sample_rate: u32,
    expected_hz: f64,
) -> Option<PitchDescriptor> {
    if samples.len() < 256 {
        return None;
    }
    let normalized_samples = local_level_normalized(samples, sample_rate);
    let samples = normalized_samples.as_slice();
    let mean =
        samples.iter().sum::<f64>() / count_as_f64(u64::try_from(samples.len()).unwrap_or(1));
    let mut best_lag = 0;
    let mut best_correlation = f64::NEG_INFINITY;
    for lag in 1..=samples.len() / 2 {
        let lag_frequency =
            f64::from(sample_rate) / count_as_f64(u64::try_from(lag).unwrap_or(u64::MAX));
        if lag_frequency < expected_hz * 0.88 || lag_frequency > expected_hz * 1.12 {
            continue;
        }
        let correlation = normalized_autocorrelation(samples, mean, lag);
        if correlation > best_correlation {
            best_correlation = correlation;
            best_lag = lag;
        }
    }
    if best_lag == 0 {
        return None;
    }
    let prior = best_lag.checked_sub(1).map_or(best_correlation, |lag| {
        normalized_autocorrelation(samples, mean, lag)
    });
    let next = if best_lag + 1 < samples.len() {
        normalized_autocorrelation(samples, mean, best_lag + 1)
    } else {
        best_correlation
    };
    let curvature = prior - 2.0 * best_correlation + next;
    let offset = if curvature.abs() > LEVEL_FLOOR {
        (0.5 * (prior - next) / curvature).clamp(-0.5, 0.5)
    } else {
        0.0
    };
    let interpolated_lag = count_as_f64(u64::try_from(best_lag).unwrap_or(u64::MAX)) + offset;
    let measured_hz = f64::from(sample_rate) / interpolated_lag.max(1.0);
    Some(PitchDescriptor {
        confidence: best_correlation.max(0.0),
        error_cents: 1_200.0 * (measured_hz / expected_hz).log2(),
        measured_hz,
    })
}

fn local_level_normalized(samples: &[f64], sample_rate: u32) -> Vec<f64> {
    let radius = usize::try_from(sample_rate / 100).unwrap_or(1).max(1);
    let mut prefix_energy = Vec::with_capacity(samples.len() + 1);
    prefix_energy.push(0.0);
    for sample in samples {
        let previous = prefix_energy.last().copied().unwrap_or(0.0);
        prefix_energy.push(sample.mul_add(*sample, previous));
    }

    samples
        .iter()
        .enumerate()
        .map(|(index, sample)| {
            let start = index.saturating_sub(radius);
            let end = index.saturating_add(radius + 1).min(samples.len());
            let count = count_as_f64(u64::try_from(end - start).unwrap_or(1));
            let rms = ((prefix_energy[end] - prefix_energy[start]) / count)
                .max(LEVEL_FLOOR)
                .sqrt();
            sample / rms
        })
        .collect()
}

fn normalized_autocorrelation(samples: &[f64], mean: f64, lag: usize) -> f64 {
    if lag == 0 || lag >= samples.len() {
        return f64::NEG_INFINITY;
    }
    let mut cross = 0.0;
    let mut left_energy = 0.0;
    let mut right_energy = 0.0;
    for index in 0..samples.len() - lag {
        let left = samples[index] - mean;
        let right = samples[index + lag] - mean;
        cross = left.mul_add(right, cross);
        left_energy = left.mul_add(left, left_energy);
        right_energy = right.mul_add(right, right_energy);
    }
    cross / (left_energy * right_energy).sqrt().max(LEVEL_FLOOR)
}

fn harmonic_alias_ratio_db(samples: &[f64], sample_rate: u32, fundamental_hz: f64) -> f64 {
    let spectrum = fft(samples, PERCEPTUAL_SPECTRAL_FFT_FRAMES);
    let bin_hz = f64::from(sample_rate)
        / count_as_f64(u64::try_from(PERCEPTUAL_SPECTRAL_FFT_FRAMES).unwrap_or(1));
    let mut intended = vec![false; PERCEPTUAL_SPECTRAL_FFT_FRAMES / 2 + 1];
    for (index, is_intended) in intended.iter_mut().enumerate().skip(1) {
        let frequency = count_as_f64(u64::try_from(index).unwrap_or(0)) * bin_hz;
        let harmonic_number = (frequency / fundamental_hz).round();
        let harmonic_frequency = harmonic_number * fundamental_hz;
        *is_intended =
            harmonic_number >= 1.0 && (frequency - harmonic_frequency).abs() <= bin_hz * 2.5;
    }
    let mut intended_energy = 0.0;
    let mut alias_energy = 0.0;
    for (index, bin) in spectrum.iter().take(intended.len()).enumerate().skip(1) {
        if intended[index] {
            intended_energy += bin.magnitude_squared();
        } else {
            alias_energy += bin.magnitude_squared();
        }
    }
    10.0 * (alias_energy / intended_energy.max(LEVEL_FLOOR))
        .max(LEVEL_FLOOR)
        .log10()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn analyze(
        frames: &[StereoFrame],
        expected_pitch_hz: Option<f64>,
        harmonic_fundamental_hz: Option<f64>,
    ) -> PerceptualMetrics {
        let mut sink = PerceptualAnalysisSink::new(PerceptualAnalysisConfiguration {
            sample_rate: 48_000,
            analysis_start_frame: 0,
            expected_pitch_hz,
            harmonic_fundamental_hz,
        })
        .unwrap();
        sink.write_block(frames).unwrap();
        sink.finish()
    }

    fn sine(frequency_hz: f64, amplitude: f64, frames: usize) -> Vec<StereoFrame> {
        (0..frames)
            .map(|index| {
                let phase =
                    TAU * frequency_hz * count_as_f64(u64::try_from(index).unwrap_or(0)) / 48_000.0;
                let sample = amplitude * phase.sin();
                StereoFrame {
                    left: sample,
                    right: sample,
                }
            })
            .collect()
    }

    fn decaying_sine(
        frequency_hz: f64,
        amplitude: f64,
        decay_ms: f64,
        frames: usize,
    ) -> Vec<StereoFrame> {
        let decay_seconds = decay_ms / 1_000.0;
        (0..frames)
            .map(|index| {
                let time = count_as_f64(u64::try_from(index).unwrap_or(0)) / 48_000.0;
                let sample =
                    amplitude * (-time / decay_seconds).exp() * (TAU * frequency_hz * time).sin();
                StereoFrame {
                    left: sample,
                    right: sample,
                }
            })
            .collect()
    }

    #[test]
    fn rejects_invalid_frequency_configuration() {
        let result = PerceptualAnalysisSink::new(PerceptualAnalysisConfiguration {
            sample_rate: 48_000,
            analysis_start_frame: 0,
            expected_pitch_hz: Some(f64::NAN),
            harmonic_fundamental_hz: None,
        });
        assert!(matches!(
            result,
            Err(PerceptualAnalysisError::InvalidExpectedFrequency)
        ));
    }

    #[test]
    fn measures_level_pitch_spectrum_and_bounded_capture() {
        let frequency = 468.75;
        let metrics = analyze(
            &sine(frequency, 0.5, 16_384),
            Some(frequency),
            Some(frequency),
        );
        assert_eq!(metrics.captured_frames, PERCEPTUAL_CAPTURE_FRAMES);
        assert!((metrics.rms_dbfs + 9.0309).abs() < 0.02);
        assert!((metrics.true_peak_dbtp + 6.0206).abs() < 0.08);
        assert!(
            metrics
                .pitch
                .is_some_and(|pitch| { pitch.error_cents.abs() < 8.0 && pitch.confidence > 0.95 })
        );
        assert!((metrics.spectral.centroid_hz - frequency).abs() < 20.0);
        assert!(
            metrics
                .harmonic_alias_ratio_db
                .is_some_and(|ratio| ratio < -50.0)
        );
    }

    #[test]
    fn pitch_estimate_is_not_biased_by_a_short_decay() {
        let frequency = 130.812_78;
        let metrics = analyze(
            &decaying_sine(frequency, 0.5, 150.0, 8_192),
            Some(frequency),
            Some(frequency),
        );
        assert!(
            metrics
                .pitch
                .is_some_and(|pitch| { pitch.error_cents.abs() < 8.0 && pitch.confidence > 0.9 })
        );
    }

    #[test]
    fn exposes_dc_antiphase_and_sample_discontinuity_controls() {
        let frames: Vec<StereoFrame> = (0..4_096)
            .map(|index| {
                let sample = if index < 2_048 { 0.1 } else { -0.1 };
                StereoFrame {
                    left: sample,
                    right: -sample,
                }
            })
            .collect();
        let metrics = analyze(&frames, None, None);
        assert!(metrics.interchannel_correlation < -0.999);
        assert!(metrics.mono_fold_loss_db < -100.0);
        assert!((metrics.maximum_sample_discontinuity - 0.2).abs() < f64::EPSILON);
        assert!(metrics.low_side_to_mid_db > 100.0);
    }

    #[test]
    fn true_peak_never_under_reports_sample_peak() {
        let mut frames = sine(18_000.0, 0.9, 4_096);
        for frame in &mut frames {
            frame.left *= 0.93;
        }
        let metrics = analyze(&frames, None, None);
        assert!(metrics.true_peak >= metrics.sample_peak);
        assert!(metrics.true_peak.is_finite());
        assert!(metrics.k_weighted_level_db.is_finite());
    }

    #[test]
    fn harmonic_probe_rejects_an_inharmonic_control() {
        let fundamental = 468.75;
        let mut frames = sine(fundamental, 0.5, 8_192);
        for (index, frame) in frames.iter_mut().enumerate() {
            let phase = TAU * 7_312.5 * count_as_f64(u64::try_from(index).unwrap_or(0)) / 48_000.0;
            let defect = 0.25 * phase.sin();
            frame.left += defect;
            frame.right += defect;
        }
        let metrics = analyze(&frames, Some(fundamental), Some(fundamental));
        assert!(
            metrics
                .harmonic_alias_ratio_db
                .is_some_and(|ratio| ratio > -15.0)
        );
    }
}
