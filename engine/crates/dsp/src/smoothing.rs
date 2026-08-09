use crate::{Sample, finite_or_silence};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinearSmoother {
    current: Sample,
    target: Sample,
    step: Sample,
    remaining_samples: f64,
}

impl LinearSmoother {
    #[must_use]
    pub fn new(value: Sample) -> Self {
        let initial = finite_or_silence(value);
        Self {
            current: initial,
            target: initial,
            step: 0.0,
            remaining_samples: 0.0,
        }
    }

    #[must_use]
    pub const fn current(self) -> Sample {
        self.current
    }

    pub fn reset(&mut self, value: Sample) {
        *self = Self::new(value);
    }

    pub fn set_target(&mut self, target: Sample, duration_ms: f64, sample_rate_hz: f64) {
        let next_target = finite_or_silence(target);
        let duration_samples = duration_ms * sample_rate_hz / 1_000.0;
        if !duration_samples.is_finite() || duration_samples <= 1.0 {
            self.reset(next_target);
            return;
        }
        self.target = next_target;
        self.remaining_samples = duration_samples.round();
        self.step = (self.target - self.current) / self.remaining_samples;
    }

    #[must_use]
    pub fn advance(&mut self) -> Sample {
        if self.remaining_samples <= 0.0 {
            return self.current;
        }
        self.current = finite_or_silence(self.current + self.step);
        self.remaining_samples -= 1.0;
        if self.remaining_samples <= 0.0 {
            self.current = self.target;
            self.step = 0.0;
        }
        self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_the_target_at_the_exact_rounded_sample() {
        let mut smoother = LinearSmoother::new(0.0);
        smoother.set_target(1.0, 1.0, 48_000.0);
        for _ in 0..47 {
            assert!(smoother.advance() < 1.0);
        }
        assert!((smoother.advance() - 1.0).abs() < f64::EPSILON);
        assert!((smoother.advance() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn invalid_or_immediate_ramps_are_finite() {
        let mut smoother = LinearSmoother::new(f64::NAN);
        smoother.set_target(f64::INFINITY, 0.0, 48_000.0);
        assert!(smoother.advance().abs() < f64::EPSILON);
    }
}
