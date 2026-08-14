use crate::{DspConfiguration, Sample, high_pass::OnePoleHighPass};

const DC_BLOCKER_CUTOFF_HZ: f64 = 5.0;

/// A bounded one-pole high-pass that removes oscillator, filter and nonlinear DC residue.
pub struct DcBlocker {
    filter: OnePoleHighPass,
}

impl DcBlocker {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            filter: OnePoleHighPass::new(configuration, DC_BLOCKER_CUTOFF_HZ),
        }
    }

    pub fn reset(&mut self) {
        self.filter.reset();
    }

    #[must_use]
    pub fn process(&mut self, input: Sample) -> Sample {
        self.filter.process(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::TAU;

    fn configuration() -> DspConfiguration {
        DspConfiguration::new(48_000, 128).unwrap()
    }

    #[test]
    fn rejects_dc_without_damaging_deep_bass() {
        let mut dc = DcBlocker::new(configuration());
        let residual = (0..48_000).fold(0.0, |_, _| dc.process(0.25));
        assert!(residual.abs() < 1.0e-8);

        dc.reset();
        let frequency = 41.0;
        let mut input_energy = 0.0;
        let mut output_energy = 0.0;
        for frame in 0..48_000 {
            let input = (TAU * frequency * f64::from(frame) / 48_000.0).sin();
            let output = dc.process(input);
            input_energy = input.mul_add(input, input_energy);
            output_energy = output.mul_add(output, output_energy);
        }
        let gain = (output_energy / input_energy).sqrt();
        assert!(gain > 0.99 && gain <= 1.0);
    }

    #[test]
    fn resets_and_contains_non_finite_input() {
        let mut dc = DcBlocker::new(configuration());
        assert!(dc.process(f64::NAN).abs() < f64::EPSILON);
        let _ = dc.process(0.5);
        dc.reset();
        assert!(dc.process(0.0).abs() < f64::EPSILON);
    }
}
