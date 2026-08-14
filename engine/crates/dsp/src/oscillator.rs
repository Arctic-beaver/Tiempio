use std::f64::consts::TAU;

use crate::{Sample, finite_or_silence};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhaseOscillator {
    phase: f64,
    triangle: f64,
    triangle_initialized: bool,
}

impl Default for PhaseOscillator {
    fn default() -> Self {
        Self::new()
    }
}

impl PhaseOscillator {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            phase: 0.0,
            triangle: 0.0,
            triangle_initialized: false,
        }
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
        self.triangle = 0.0;
        self.triangle_initialized = false;
    }

    #[must_use]
    pub fn next_sine(&mut self, frequency_hz: f64, sample_rate_hz: f64) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        let sample = (TAU * self.phase).sin();
        self.advance(step, false);
        finite_or_silence(sample)
    }

    #[must_use]
    pub fn next_saw(&mut self, frequency_hz: f64, sample_rate_hz: f64) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        let sample = 2.0 * self.phase - 1.0 - poly_blep(self.phase, step);
        self.advance(step, false);
        finite_or_silence(sample).clamp(-1.0, 1.0)
    }

    /// Produces a zero-mean `PolyBLEP` pulse with a bounded duty cycle.
    #[must_use]
    pub fn next_pulse(
        &mut self,
        frequency_hz: f64,
        sample_rate_hz: f64,
        pulse_width: f64,
    ) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        let width = finite_or_silence(pulse_width).clamp(0.05, 0.95);
        let sample = band_limited_pulse(self.phase, step, width);
        self.advance(step, false);
        sample
    }

    /// Produces a DC-stable triangle by leaky integration of the band-limited 50% pulse.
    #[must_use]
    pub fn next_triangle(&mut self, frequency_hz: f64, sample_rate_hz: f64) -> Sample {
        let step = normalized_step(frequency_hz, sample_rate_hz);
        if !self.triangle_initialized {
            self.triangle = naive_triangle(self.phase) * 0.25;
            self.triangle_initialized = true;
        }
        let pulse = band_limited_pulse(self.phase, step, 0.5);
        // The bounded one-pole leakage removes the arbitrary integration
        // constant without a per-cycle reset discontinuity. Scaling by four
        // restores the triangle level while preserving the extra high-frequency
        // roll-off contributed by the integrator.
        self.triangle =
            finite_or_silence(step.mul_add(pulse, (1.0 - step) * self.triangle)).clamp(-1.0, 1.0);
        let sample = finite_or_silence(self.triangle * 4.0).clamp(-1.0, 1.0);
        self.advance(step, true);
        sample
    }

    fn advance(&mut self, step: f64, triangle_active: bool) {
        self.phase = (self.phase + step).fract();
        if self.phase.abs() < 1.0e-20 {
            self.phase = 0.0;
        }
        if !triangle_active {
            self.triangle = 0.0;
            self.triangle_initialized = false;
        }
    }
}

fn naive_triangle(phase: f64) -> f64 {
    1.0 - 4.0 * (phase - 0.5).abs()
}

fn band_limited_pulse(phase: f64, step: f64, pulse_width: f64) -> f64 {
    let naive = if phase < pulse_width { 1.0 } else { -1.0 };
    let corrected =
        naive + poly_blep(phase, step) - poly_blep((phase - pulse_width).rem_euclid(1.0), step);
    let dc = pulse_width.mul_add(2.0, -1.0);
    let normalization = 2.0 * pulse_width.max(1.0 - pulse_width);
    finite_or_silence((corrected - dc) / normalization).clamp(-1.0, 1.0)
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

    #[test]
    fn pulse_is_bounded_smooth_and_dc_stable_across_duty_cycles() {
        for width in [0.1, 0.25, 0.5, 0.75, 0.9] {
            let mut oscillator = PhaseOscillator::new();
            let mut previous = oscillator.next_pulse(1_000.0, 48_000.0, width);
            let mut sum = previous;
            let mut largest_delta = 0.0_f64;
            for _ in 1..48_000 {
                let sample = oscillator.next_pulse(1_000.0, 48_000.0, width);
                assert!(sample.is_finite() && (-1.0..=1.0).contains(&sample));
                largest_delta = largest_delta.max((sample - previous).abs());
                previous = sample;
                sum += sample;
            }
            assert!(sum.abs() / 48_000.0 < 1.0e-10);
            assert!(largest_delta < 1.5);
        }
    }

    #[test]
    fn integrated_triangle_is_bounded_and_dc_stable() {
        let mut oscillator = PhaseOscillator::new();
        for _ in 0..2_048 {
            let _ = oscillator.next_triangle(1_000.0, 48_000.0);
        }
        let samples: Vec<f64> = (0..48_000)
            .map(|_| oscillator.next_triangle(1_000.0, 48_000.0))
            .collect();
        let mean = samples.iter().sum::<f64>() / 48_000.0;
        let peak = samples.iter().copied().map(f64::abs).fold(0.0, f64::max);
        assert!(
            mean.abs() < 1.0e-10,
            "triangle DC mean {mean} exceeds the numerical floor"
        );
        assert!(peak > 0.9 && peak <= 1.0);
        assert!(samples.iter().all(|sample| sample.is_finite()));
    }
}
