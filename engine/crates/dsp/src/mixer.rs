use std::f64::consts::FRAC_PI_4;

use crate::{DspConfiguration, Sample, StereoFrame, finite_or_silence, high_pass::OnePoleHighPass};

const LOW_SIDE_CUTOFF_HZ: f64 = 160.0;

pub fn clear_block(output: &mut [StereoFrame]) {
    output.fill(StereoFrame::default());
}

#[must_use]
pub fn apply_stereo_width(frame: StereoFrame, width: f64) -> StereoFrame {
    let bounded_width = finite_or_silence(width).clamp(0.0, 1.0);
    let middle = (frame.left + frame.right) * 0.5;
    let side = (frame.left - frame.right) * 0.5 * bounded_width;
    StereoFrame::new(middle + side, middle - side)
}

/// Keeps the low-frequency stereo image bounded while preserving high-frequency side detail.
pub struct LowSideGuard {
    side_high_pass: OnePoleHighPass,
}

impl LowSideGuard {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            side_high_pass: OnePoleHighPass::new(configuration, LOW_SIDE_CUTOFF_HZ),
        }
    }

    pub fn reset(&mut self) {
        self.side_high_pass.reset();
    }

    #[must_use]
    pub fn process(&mut self, frame: StereoFrame) -> StereoFrame {
        let middle = (frame.left + frame.right) * 0.5;
        let side = self
            .side_high_pass
            .process((frame.left - frame.right) * 0.5);
        StereoFrame::new(middle + side, middle - side)
    }
}

#[must_use]
pub fn apply_gain_pan(frame: StereoFrame, gain: f64, pan: f64) -> StereoFrame {
    let bounded_gain = finite_or_silence(gain).clamp(0.0, 2.0);
    let angle = (finite_or_silence(pan).clamp(-1.0, 1.0) + 1.0) * FRAC_PI_4;
    StereoFrame::new(
        frame.left * bounded_gain * angle.cos(),
        frame.right * bounded_gain * angle.sin(),
    )
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct OutputGuard {
    non_finite_replacements: u64,
    ceiling_clamps: u64,
}

impl OutputGuard {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            non_finite_replacements: 0,
            ceiling_clamps: 0,
        }
    }

    #[must_use]
    pub const fn non_finite_replacements(self) -> u64 {
        self.non_finite_replacements
    }

    #[must_use]
    pub const fn ceiling_clamps(self) -> u64 {
        self.ceiling_clamps
    }

    pub fn reset_counters(&mut self) {
        self.non_finite_replacements = 0;
        self.ceiling_clamps = 0;
    }

    #[must_use]
    pub fn process(&mut self, frame: StereoFrame) -> StereoFrame {
        StereoFrame::new(
            self.process_channel(frame.left),
            self.process_channel(frame.right),
        )
    }

    fn process_channel(&mut self, input: Sample) -> Sample {
        if !input.is_finite() {
            self.non_finite_replacements = self.non_finite_replacements.saturating_add(1);
            return 0.0;
        }
        let magnitude = input.abs();
        if magnitude <= 0.8 {
            return input;
        }
        if magnitude > 1.0 {
            self.ceiling_clamps = self.ceiling_clamps.saturating_add(1);
        }
        let excess = magnitude - 0.8;
        let softened = 0.8 + 0.2 * (1.0 - (-excess / 0.2).exp());
        input.signum() * softened.min(0.999)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::TAU;

    #[test]
    fn clears_visible_output_and_applies_bounded_stereo_controls() {
        let mut block = [StereoFrame::mono(1.0); 16];
        clear_block(&mut block);
        assert!(block.iter().all(|frame| *frame == StereoFrame::default()));
        assert_eq!(
            apply_stereo_width(StereoFrame::new(1.0, -1.0), 0.0),
            StereoFrame::default()
        );
        let left = apply_gain_pan(StereoFrame::mono(1.0), 1.0, -1.0);
        assert!(left.left > 0.99 && left.right.abs() < 1.0e-12);
    }

    #[test]
    fn output_guard_replaces_non_finite_values_and_limits_peaks() {
        let mut guard = OutputGuard::new();
        let frame = guard.process(StereoFrame::new(f64::NAN, 100.0));
        assert!(frame.left.abs() < f64::EPSILON);
        assert!(frame.right <= 0.999);
        assert_eq!(guard.non_finite_replacements(), 1);
        assert_eq!(guard.ceiling_clamps(), 1);
    }

    #[test]
    fn low_side_guard_centers_bass_and_preserves_high_frequency_width() {
        let configuration = DspConfiguration::new(48_000, 128).unwrap();
        let gain_at = |frequency: f64| {
            let mut guard = LowSideGuard::new(configuration);
            let mut input_energy = 0.0;
            let mut output_energy = 0.0;
            for frame in 0..48_000 {
                let side = (TAU * frequency * f64::from(frame) / 48_000.0).sin();
                let output = guard.process(StereoFrame::new(side, -side));
                input_energy = side.mul_add(side, input_energy);
                let output_side = (output.left - output.right) * 0.5;
                output_energy = output_side.mul_add(output_side, output_energy);
            }
            (output_energy / input_energy).sqrt()
        };

        assert!(gain_at(80.0) < 0.46);
        assert!(gain_at(1_000.0) > 0.98);

        let mut guard = LowSideGuard::new(configuration);
        let mono = guard.process(StereoFrame::mono(0.25));
        assert!((mono.left - 0.25).abs() < f64::EPSILON);
        assert!((mono.right - 0.25).abs() < f64::EPSILON);
    }
}
