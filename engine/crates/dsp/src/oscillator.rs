use std::f64::consts::TAU;

use crate::{Sample, finite_or_silence};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PhaseOscillator {
    phase: f64,
}

impl PhaseOscillator {
    #[must_use]
    pub const fn new() -> Self {
        Self { phase: 0.0 }
    }

    #[must_use]
    pub const fn phase(self) -> f64 {
        self.phase
    }

    pub fn reset(&mut self, phase: f64) {
        self.phase = if phase.is_finite() {
            phase.rem_euclid(1.0)
        } else {
            0.0
        };
    }

    #[must_use]
    pub fn next_sine(&mut self, frequency_hz: f64, sample_rate_hz: f64) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        let sample = (TAU * self.phase).sin();
        self.advance(step);
        finite_or_silence(sample)
    }

    #[must_use]
    pub fn next_saw(&mut self, frequency_hz: f64, sample_rate_hz: f64) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        let sample = 2.0 * self.phase - 1.0 - poly_blep(self.phase, step);
        self.advance(step);
        finite_or_silence(sample).clamp(-1.0, 1.0)
    }

    fn advance(&mut self, step: f64) {
        self.phase = (self.phase + step).fract();
        if self.phase.abs() < 1.0e-20 {
            self.phase = 0.0;
        }
    }
}

fn normalized_step(frequency_hz: f64, sample_rate_hz: f64) -> f64 {
    if !frequency_hz.is_finite()
        || !sample_rate_hz.is_finite()
        || frequency_hz <= 0.0
        || sample_rate_hz <= 0.0
    {
        return 0.0;
    }
    (frequency_hz / sample_rate_hz).clamp(0.0, 0.5)
}

fn poly_blep(phase: f64, step: f64) -> f64 {
    if step <= 0.0 {
        return 0.0;
    }
    if phase < step {
        let normalized = phase / step;
        return normalized + normalized - normalized * normalized - 1.0;
    }
    if phase > 1.0 - step {
        let normalized = (phase - 1.0) / step;
        return normalized * normalized + normalized + normalized + 1.0;
    }
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_phase_and_samples_bounded() {
        let mut oscillator = PhaseOscillator::new();
        for _ in 0..200_000 {
            let sample = oscillator.next_saw(440.0, 48_000.0);
            assert!(sample.is_finite() && (-1.0..=1.0).contains(&sample));
            assert!((0.0..1.0).contains(&oscillator.phase()));
        }
    }

    #[test]
    fn smooths_the_saw_wrap_discontinuity() {
        let mut oscillator = PhaseOscillator::new();
        let mut previous = oscillator.next_saw(440.0, 48_000.0);
        let mut largest_blep_delta = 0.0_f64;
        let mut naive_phase = 0.0_f64;
        let mut previous_naive = -1.0_f64;
        let mut largest_naive_delta = 0.0_f64;
        let step = 440.0 / 48_000.0;
        for _ in 0..4_800 {
            let sample = oscillator.next_saw(440.0, 48_000.0);
            largest_blep_delta = largest_blep_delta.max((sample - previous).abs());
            previous = sample;
            naive_phase = (naive_phase + step).fract();
            let naive = 2.0 * naive_phase - 1.0;
            largest_naive_delta = largest_naive_delta.max((naive - previous_naive).abs());
            previous_naive = naive;
        }
        assert!(
            largest_blep_delta < largest_naive_delta * 0.8,
            "PolyBLEP delta {largest_blep_delta} did not improve naive delta {largest_naive_delta}"
        );
    }

    #[test]
    fn sine_has_negligible_dc_over_whole_cycles() {
        let mut oscillator = PhaseOscillator::new();
        let sum = (0..4_800)
            .map(|_| oscillator.next_sine(100.0, 48_000.0))
            .sum::<f64>();
        assert!(sum.abs() < 1.0e-10);
    }
}
