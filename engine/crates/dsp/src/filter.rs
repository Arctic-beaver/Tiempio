use std::f64::consts::PI;

use crate::{DspConfiguration, Sample, finite_or_silence};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StateVariableLowPass {
    sample_rate_hz: f64,
    cutoff_hz: f64,
    resonance: f64,
    integrator_one: f64,
    integrator_two: f64,
}

impl StateVariableLowPass {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            sample_rate_hz: configuration.sample_rate_hz(),
            cutoff_hz: 1_000.0,
            resonance: 0.0,
            integrator_one: 0.0,
            integrator_two: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.integrator_one = 0.0;
        self.integrator_two = 0.0;
    }

    pub fn set_parameters(&mut self, cutoff_hz: f64, resonance: f64) {
        let maximum_cutoff = (self.sample_rate_hz * 0.45).min(24_000.0);
        self.cutoff_hz = finite_or_silence(cutoff_hz).clamp(20.0, maximum_cutoff);
        self.resonance = finite_or_silence(resonance).clamp(0.0, 1.0);
    }

    #[must_use]
    pub fn process(&mut self, input: Sample) -> Sample {
        let safe_input = finite_or_silence(input);
        let tangent = (PI * self.cutoff_hz / self.sample_rate_hz).tan();
        let damping = 2.0 - 1.9 * self.resonance;
        let coefficient_one = 1.0 / (1.0 + tangent * (tangent + damping));
        let coefficient_two = tangent * coefficient_one;
        let coefficient_three = tangent * coefficient_two;
        let residual = safe_input - self.integrator_two;
        let band = coefficient_one * self.integrator_one + coefficient_two * residual;
        let low = self.integrator_two
            + coefficient_two * self.integrator_one
            + coefficient_three * residual;
        self.integrator_one = denormal_to_zero(2.0 * band - self.integrator_one);
        self.integrator_two = denormal_to_zero(2.0 * low - self.integrator_two);
        if !self.integrator_one.is_finite() || !self.integrator_two.is_finite() {
            self.reset();
            return 0.0;
        }
        finite_or_silence(low)
    }
}

fn denormal_to_zero(value: f64) -> f64 {
    if value.abs() < 1.0e-20 { 0.0 } else { value }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remains_finite_for_extreme_parameters_and_impulses() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid test config");
        let mut filter = StateVariableLowPass::new(configuration);
        filter.set_parameters(100_000.0, 1.0);
        let mut energy = 0.0;
        for index in 0..200_000 {
            let output = filter.process(if index == 0 { 1.0 } else { 0.0 });
            assert!(output.is_finite());
            energy += output.abs();
        }
        assert!(energy > 0.0 && energy < 100.0);
    }

    #[test]
    fn resets_after_non_finite_input_without_poisoning_state() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid test config");
        let mut filter = StateVariableLowPass::new(configuration);
        assert!(filter.process(f64::NAN).is_finite());
        assert!(filter.process(0.5).is_finite());
        filter.reset();
        assert!(filter.process(0.0).abs() < f64::EPSILON);
    }
}
