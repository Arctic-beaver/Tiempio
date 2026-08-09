use std::convert::Infallible;
use std::f64::consts::TAU;

use tiempio_engine_dsp::{DspConfiguration, DspConfigurationError, StereoFrame};

use crate::OfflineBlockSink;
use crate::wav::quantize_pcm16;

const NON_SILENT_THRESHOLD: f64 = 1.0e-6;
const CLIPPED_THRESHOLD: f64 = 0.999;
const FNV_OFFSET_BASIS: u64 = 14_695_981_039_346_656_037;
const FNV_PRIME: u64 = 1_099_511_628_211;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpectralBandEnergy {
    pub low: f64,
    pub mid: f64,
    pub high: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RenderMetrics {
    pub frame_count: u64,
    pub peak: f64,
    pub rms: f64,
    pub dc_offset_left: f64,
    pub dc_offset_right: f64,
    pub non_silent_frames: u64,
    pub leading_silent_frames: u64,
    pub trailing_silent_frames: u64,
    pub first_non_silent_frame: Option<u64>,
    pub last_non_silent_frame: Option<u64>,
    pub clipped_sample_count: u64,
    pub non_finite_sample_count: u64,
    pub spectral_band_energy: SpectralBandEnergy,
    pub pcm16_fnv1a64: u64,
}

pub struct RenderMetricsSink {
    frame_count: u64,
    peak: f64,
    sum_squares: f64,
    sum_left: f64,
    sum_right: f64,
    non_silent_frames: u64,
    leading_silent_frames: u64,
    trailing_silent_frames: u64,
    first_non_silent_frame: Option<u64>,
    last_non_silent_frame: Option<u64>,
    clipped_sample_count: u64,
    non_finite_sample_count: u64,
    low_state: f64,
    mid_state: f64,
    low_energy: f64,
    mid_energy: f64,
    high_energy: f64,
    low_alpha: f64,
    mid_alpha: f64,
    pcm16_fnv1a64: u64,
}

impl RenderMetricsSink {
    /// Creates deterministic streaming analysis for one supported sample rate.
    ///
    /// # Errors
    ///
    /// Returns the DSP configuration error when the rate is outside Stage 4 limits.
    pub fn new(sample_rate: u32) -> Result<Self, DspConfigurationError> {
        let _ = DspConfiguration::new(sample_rate, 1)?;
        let sample_rate_hz = f64::from(sample_rate);
        Ok(Self {
            frame_count: 0,
            peak: 0.0,
            sum_squares: 0.0,
            sum_left: 0.0,
            sum_right: 0.0,
            non_silent_frames: 0,
            leading_silent_frames: 0,
            trailing_silent_frames: 0,
            first_non_silent_frame: None,
            last_non_silent_frame: None,
            clipped_sample_count: 0,
            non_finite_sample_count: 0,
            low_state: 0.0,
            mid_state: 0.0,
            low_energy: 0.0,
            mid_energy: 0.0,
            high_energy: 0.0,
            low_alpha: 1.0 - (-TAU * 200.0 / sample_rate_hz).exp(),
            mid_alpha: 1.0 - (-TAU * 2_000.0 / sample_rate_hz).exp(),
            pcm16_fnv1a64: FNV_OFFSET_BASIS,
        })
    }

    #[must_use]
    pub fn finish(self) -> RenderMetrics {
        let sample_count = self.frame_count.saturating_mul(2);
        let sample_denominator = count_as_f64(sample_count.max(1));
        let frame_denominator = count_as_f64(self.frame_count.max(1));
        RenderMetrics {
            frame_count: self.frame_count,
            peak: self.peak,
            rms: (self.sum_squares / sample_denominator).sqrt(),
            dc_offset_left: self.sum_left / frame_denominator,
            dc_offset_right: self.sum_right / frame_denominator,
            non_silent_frames: self.non_silent_frames,
            leading_silent_frames: self.leading_silent_frames,
            trailing_silent_frames: self.trailing_silent_frames,
            first_non_silent_frame: self.first_non_silent_frame,
            last_non_silent_frame: self.last_non_silent_frame,
            clipped_sample_count: self.clipped_sample_count,
            non_finite_sample_count: self.non_finite_sample_count,
            spectral_band_energy: SpectralBandEnergy {
                low: self.low_energy / frame_denominator,
                mid: self.mid_energy / frame_denominator,
                high: self.high_energy / frame_denominator,
            },
            pcm16_fnv1a64: self.pcm16_fnv1a64,
        }
    }

    fn hash_sample(&mut self, sample: f64) {
        for byte in quantize_pcm16(sample).to_le_bytes() {
            self.pcm16_fnv1a64 ^= u64::from(byte);
            self.pcm16_fnv1a64 = self.pcm16_fnv1a64.wrapping_mul(FNV_PRIME);
        }
    }
}

fn count_as_f64(value: u64) -> f64 {
    let high = u32::try_from(value >> 32).unwrap_or(u32::MAX);
    let low = u32::try_from(value & u64::from(u32::MAX)).unwrap_or(u32::MAX);
    f64::from(high).mul_add(4_294_967_296.0, f64::from(low))
}

impl OfflineBlockSink for RenderMetricsSink {
    type Error = Infallible;

    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error> {
        for frame in block {
            let left = if frame.left.is_finite() {
                frame.left
            } else {
                self.non_finite_sample_count = self.non_finite_sample_count.saturating_add(1);
                0.0
            };
            let right = if frame.right.is_finite() {
                frame.right
            } else {
                self.non_finite_sample_count = self.non_finite_sample_count.saturating_add(1);
                0.0
            };
            self.peak = self.peak.max(left.abs()).max(right.abs());
            self.sum_squares += left.mul_add(left, right * right);
            self.sum_left += left;
            self.sum_right += right;
            self.clipped_sample_count = self.clipped_sample_count.saturating_add(
                u64::from(left.abs() >= CLIPPED_THRESHOLD)
                    + u64::from(right.abs() >= CLIPPED_THRESHOLD),
            );

            let non_silent = left.abs().max(right.abs()) >= NON_SILENT_THRESHOLD;
            if non_silent {
                self.non_silent_frames = self.non_silent_frames.saturating_add(1);
                self.first_non_silent_frame.get_or_insert(self.frame_count);
                self.last_non_silent_frame = Some(self.frame_count);
                self.trailing_silent_frames = 0;
            } else if self.first_non_silent_frame.is_none() {
                self.leading_silent_frames = self.leading_silent_frames.saturating_add(1);
            } else {
                self.trailing_silent_frames = self.trailing_silent_frames.saturating_add(1);
            }

            let mono = (left + right) * 0.5;
            self.low_state += self.low_alpha * (mono - self.low_state);
            self.mid_state += self.mid_alpha * (mono - self.mid_state);
            let low = self.low_state;
            let mid = self.mid_state - self.low_state;
            let high = mono - self.mid_state;
            self.low_energy = low.mul_add(low, self.low_energy);
            self.mid_energy = mid.mul_add(mid, self.mid_energy);
            self.high_energy = high.mul_add(high, self.high_energy);
            self.hash_sample(left);
            self.hash_sample(right);
            self.frame_count = self.frame_count.saturating_add(1);
        }
        Ok(())
    }
}
