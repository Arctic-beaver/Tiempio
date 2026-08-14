use crate::{Sample, finite_or_silence};

const MAXIMUM_INPUT: f64 = 4.0;
const DELTA_FLOOR: f64 = 1.0e-8;

#[must_use]
pub fn saturate(input: Sample, drive: f64) -> Sample {
    let safe_input = finite_or_silence(input);
    let bounded_drive = finite_or_silence(drive).clamp(0.0, 1.0);
    if bounded_drive <= 0.0 {
        return safe_input.clamp(-1.0, 1.0);
    }
    let gain = 1.0 + bounded_drive * 8.0;
    let normalization = gain.tanh();
    finite_or_silence((safe_input * gain).tanh() / normalization).clamp(-1.0, 1.0)
}

/// Stateful first-order antiderivative antialiasing for controlled nonlinear colour.
///
/// The processor has fixed storage, performs no allocation and peak-normalizes the antialiased
/// colour before a bounded dry/wet blend. `saturate` remains the stateless drum control; the
/// current synth path opts into this processor explicitly.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct AntialiasedSaturator {
    previous: f64,
    initialized: bool,
}

impl AntialiasedSaturator {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            previous: 0.0,
            initialized: false,
        }
    }

    pub fn reset(&mut self) {
        *self = Self::new();
    }

    #[must_use]
    pub fn process(&mut self, input: Sample, drive: f64) -> Sample {
        let safe_input = finite_or_silence(input).clamp(-MAXIMUM_INPUT, MAXIMUM_INPUT);
        let bounded_drive = finite_or_silence(drive).clamp(0.0, 1.0);
        let gain = bounded_drive.mul_add(4.0, 1.0);
        let shaped_input = safe_input * gain;
        let shaped = if self.initialized {
            adaa_tanh(self.previous, shaped_input)
        } else {
            shaped_input.tanh()
        };
        self.previous = shaped_input;
        self.initialized = true;

        if bounded_drive <= 0.0 {
            return safe_input.clamp(-1.0, 1.0);
        }
        let peak_normalized = shaped / gain.tanh().max(DELTA_FLOOR);
        let mix = bounded_drive.mul_add(0.85, 0.0);
        finite_or_silence((peak_normalized - safe_input).mul_add(mix, safe_input)).clamp(-1.0, 1.0)
    }
}

fn adaa_tanh(previous: f64, current: f64) -> f64 {
    let delta = current - previous;
    if delta.abs() <= DELTA_FLOOR {
        return ((current + previous) * 0.5).tanh();
    }
    finite_or_silence((log_cosh(current) - log_cosh(previous)) / delta)
}

fn log_cosh(value: f64) -> f64 {
    let magnitude = value.abs();
    magnitude + (-2.0 * magnitude).exp().ln_1p() - std::f64::consts::LN_2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_odd_monotonic_and_bounded() {
        let mut previous = -1.0;
        for index in -1_000..=1_000 {
            let input = f64::from(index) / 100.0;
            let output = saturate(input, 0.7);
            assert!(output.is_finite() && (-1.0..=1.0).contains(&output));
            assert!(output >= previous);
            assert!((output + saturate(-input, 0.7)).abs() < 1.0e-12);
            previous = output;
        }
    }

    #[test]
    fn contains_non_finite_input() {
        assert!(saturate(f64::NAN, 1.0).abs() < f64::EPSILON);
        assert!(saturate(f64::INFINITY, f64::NAN).abs() < f64::EPSILON);
        assert!((saturate(0.25, 0.0) - 0.25).abs() < f64::EPSILON);
    }

    #[test]
    fn antialiased_colour_is_bounded_deterministic_and_resettable() {
        let input: Vec<f64> = (0..4_096)
            .map(|index| (std::f64::consts::TAU * f64::from(index) * 0.173).sin() * 0.8)
            .collect();
        let render = || {
            let mut processor = AntialiasedSaturator::new();
            input
                .iter()
                .map(|sample| processor.process(*sample, 0.8))
                .collect::<Vec<_>>()
        };
        let first = render();
        assert_eq!(first, render());
        assert!(
            first
                .iter()
                .all(|sample| sample.is_finite() && (-1.0..=1.0).contains(sample))
        );
        let mut processor = AntialiasedSaturator::new();
        let expected = processor.process(0.25, 0.5);
        let _ = processor.process(-0.8, 0.5);
        processor.reset();
        assert!((processor.process(0.25, 0.5) - expected).abs() < f64::EPSILON);
    }

    #[test]
    fn zero_drive_is_an_exact_bounded_bypass() {
        let mut processor = AntialiasedSaturator::new();
        for input in [-2.0, -0.5, 0.0, 0.5, 2.0] {
            assert!((processor.process(input, 0.0) - input.clamp(-1.0, 1.0)).abs() < f64::EPSILON);
        }
    }
}
