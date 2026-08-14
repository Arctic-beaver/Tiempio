use std::convert::Infallible;

use tiempio_engine_dsp::StereoFrame;

use crate::{
    OfflineBlockSink, PerceptualAnalysisConfiguration, PerceptualAnalysisError,
    PerceptualAnalysisSink, PerceptualMetrics, RenderMetrics, RenderMetricsSink,
};

const STEADY_DC_WINDOW_SECONDS: u64 = 2;

#[derive(Clone, Debug, PartialEq)]
pub struct CatalogAnalysisConfiguration {
    pub sample_rate: u32,
    pub spectral_start_frame: u64,
    pub steady_analysis_frame: u64,
    pub expected_pitch_hz: f64,
    pub discontinuity_probe_frames: Vec<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CatalogAnalysisError {
    InvalidWindow,
    Perceptual(PerceptualAnalysisError),
}

#[derive(Clone, Debug, PartialEq)]
pub struct CatalogAnalysisResult {
    pub metrics: RenderMetrics,
    pub perceptual: PerceptualMetrics,
    pub attack_frames: u64,
    pub steady_dc_offset: f64,
    pub side_to_mid_db: f64,
    pub maximum_event_discontinuity: f64,
}

pub struct CatalogAnalysisSink {
    metrics: RenderMetricsSink,
    perceptual: PerceptualAnalysisSink,
    onset: Vec<f64>,
    onset_limit: usize,
    onset_state: f64,
    onset_alpha: f64,
    frame_index: u64,
    spectral_start: u64,
    spectral_end: u64,
    dc_start: u64,
    dc_end: u64,
    dc_sum_left: f64,
    dc_sum_right: f64,
    dc_frames: u64,
    mid_energy: f64,
    side_energy: f64,
    discontinuity_probe_frames: Vec<u64>,
    previous_frame: StereoFrame,
    previous_delta: StereoFrame,
    pending_event: Option<PendingEvent>,
    maximum_event_discontinuity: f64,
}

#[derive(Clone, Copy)]
struct PendingEvent {
    delta: StereoFrame,
    prior_delta: StereoFrame,
}

impl CatalogAnalysisSink {
    /// Creates one bounded catalog-analysis sink.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid window or perceptual analyzer configuration.
    pub fn new(configuration: CatalogAnalysisConfiguration) -> Result<Self, CatalogAnalysisError> {
        if configuration.spectral_start_frame > configuration.steady_analysis_frame {
            return Err(CatalogAnalysisError::InvalidWindow);
        }
        let onset_limit = usize::try_from(configuration.steady_analysis_frame)
            .map_err(|_| CatalogAnalysisError::InvalidWindow)?;
        let perceptual = PerceptualAnalysisSink::new(PerceptualAnalysisConfiguration {
            sample_rate: configuration.sample_rate,
            analysis_start_frame: configuration.spectral_start_frame,
            expected_pitch_hz: Some(configuration.expected_pitch_hz),
            harmonic_fundamental_hz: None,
        })
        .map_err(CatalogAnalysisError::Perceptual)?;
        let metrics = RenderMetricsSink::new(configuration.sample_rate).map_err(|error| {
            CatalogAnalysisError::Perceptual(PerceptualAnalysisError::Configuration(error))
        })?;
        let dc_end = configuration.steady_analysis_frame;
        let dc_start = dc_end.saturating_sub(
            u64::from(configuration.sample_rate).saturating_mul(STEADY_DC_WINDOW_SECONDS),
        );
        let mut discontinuity_probe_frames = configuration.discontinuity_probe_frames;
        discontinuity_probe_frames.sort_unstable();
        discontinuity_probe_frames.dedup();
        Ok(Self {
            metrics,
            perceptual,
            onset: Vec::with_capacity(onset_limit),
            onset_limit,
            onset_state: 0.0,
            onset_alpha: 1.0 - (-1.0 / (f64::from(configuration.sample_rate) * 0.005)).exp(),
            frame_index: 0,
            spectral_start: configuration.spectral_start_frame,
            spectral_end: configuration.spectral_start_frame.saturating_add(8_192),
            dc_start,
            dc_end,
            dc_sum_left: 0.0,
            dc_sum_right: 0.0,
            dc_frames: 0,
            mid_energy: 0.0,
            side_energy: 0.0,
            discontinuity_probe_frames,
            previous_frame: StereoFrame::default(),
            previous_delta: StereoFrame::default(),
            pending_event: None,
            maximum_event_discontinuity: 0.0,
        })
    }

    #[must_use]
    pub fn finish(mut self) -> CatalogAnalysisResult {
        if let Some(pending) = self.pending_event.take() {
            self.maximum_event_discontinuity = self
                .maximum_event_discontinuity
                .max(event_excess(pending, StereoFrame::default()));
        }
        let attack_frames = attack_frames(&self.onset);
        let dc_denominator = count_as_f64(self.dc_frames.max(1));
        let steady_dc_offset = (self.dc_sum_left / dc_denominator)
            .abs()
            .max((self.dc_sum_right / dc_denominator).abs());
        let side_to_mid_db =
            10.0 * ((self.side_energy + f64::EPSILON) / (self.mid_energy + f64::EPSILON)).log10();
        CatalogAnalysisResult {
            metrics: self.metrics.finish(),
            perceptual: self.perceptual.finish(),
            attack_frames,
            steady_dc_offset,
            side_to_mid_db,
            maximum_event_discontinuity: self.maximum_event_discontinuity,
        }
    }
}

impl OfflineBlockSink for CatalogAnalysisSink {
    type Error = Infallible;

    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error> {
        self.metrics.write_block(block)?;
        self.perceptual.write_block(block)?;
        for frame in block {
            let mid = 0.5 * (frame.left + frame.right);
            let delta = StereoFrame::new(
                (frame.left - self.previous_frame.left).abs(),
                (frame.right - self.previous_frame.right).abs(),
            );
            if let Some(pending) = self.pending_event.take() {
                self.maximum_event_discontinuity = self
                    .maximum_event_discontinuity
                    .max(event_excess(pending, delta));
            }
            if self
                .discontinuity_probe_frames
                .binary_search(&self.frame_index)
                .is_ok()
            {
                self.pending_event = Some(PendingEvent {
                    delta,
                    prior_delta: self.previous_delta,
                });
            }
            if self.onset.len() < self.onset_limit {
                self.onset_state += self.onset_alpha * (mid.abs() - self.onset_state);
                self.onset.push(self.onset_state);
            }
            if (self.dc_start..self.dc_end).contains(&self.frame_index) {
                self.dc_sum_left += frame.left;
                self.dc_sum_right += frame.right;
                self.dc_frames = self.dc_frames.saturating_add(1);
            }
            if (self.spectral_start..self.spectral_end).contains(&self.frame_index) {
                let side = 0.5 * (frame.left - frame.right);
                self.mid_energy = mid.mul_add(mid, self.mid_energy);
                self.side_energy = side.mul_add(side, self.side_energy);
            }
            self.previous_frame = *frame;
            self.previous_delta = delta;
            self.frame_index = self.frame_index.saturating_add(1);
        }
        Ok(())
    }
}

fn event_excess(pending: PendingEvent, next_delta: StereoFrame) -> f64 {
    (pending.delta.left - pending.prior_delta.left.max(next_delta.left))
        .max(0.0)
        .max((pending.delta.right - pending.prior_delta.right.max(next_delta.right)).max(0.0))
}

fn attack_frames(samples: &[f64]) -> u64 {
    let peak = samples.iter().copied().fold(0.0_f64, f64::max);
    let threshold = peak * 0.9;
    let index = samples
        .iter()
        .position(|sample| *sample >= threshold)
        .unwrap_or(samples.len());
    u64::try_from(index).unwrap_or(u64::MAX)
}

fn count_as_f64(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_spectral_window_after_the_steady_window() {
        let result = CatalogAnalysisSink::new(CatalogAnalysisConfiguration {
            sample_rate: 48_000,
            spectral_start_frame: 8_193,
            steady_analysis_frame: 8_192,
            expected_pitch_hz: 440.0,
            discontinuity_probe_frames: Vec::new(),
        });
        assert!(matches!(result, Err(CatalogAnalysisError::InvalidWindow)));
    }

    #[test]
    fn measures_only_declared_event_discontinuities() {
        let mut sink = CatalogAnalysisSink::new(CatalogAnalysisConfiguration {
            sample_rate: 48_000,
            spectral_start_frame: 0,
            steady_analysis_frame: 4,
            expected_pitch_hz: 440.0,
            discontinuity_probe_frames: vec![1],
        })
        .unwrap();
        sink.write_block(&[
            StereoFrame::new(0.0, 0.0),
            StereoFrame::new(0.8, -0.8),
            StereoFrame::new(0.9, -0.9),
        ])
        .unwrap();
        assert!((sink.finish().maximum_event_discontinuity - 0.7).abs() < f64::EPSILON);
    }
}
