use std::f64::consts::TAU;

use crate::{DspConfiguration, Sample, finite_or_silence};

pub(crate) struct OnePoleHighPass {
    coefficient: f64,
    normalization: f64,
    previous_input: f64,
    previous_output: f64,
}

impl OnePoleHighPass {
    pub(crate) fn new(configuration: DspConfiguration, cutoff_hz: f64) -> Self {
        let maximum_cutoff = configuration.sample_rate_hz() * 0.45;
        let cutoff_hz = finite_or_silence(cutoff_hz).clamp(0.0, maximum_cutoff);
        let coefficient = (-TAU * cutoff_hz / configuration.sample_rate_hz()).exp();
        Self {
            coefficient,
            normalization: 0.5 * (1.0 + coefficient),
            previous_input: 0.0,
            previous_output: 0.0,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.previous_input = 0.0;
        self.previous_output = 0.0;
    }

    pub(crate) fn process(&mut self, input: Sample) -> Sample {
        let input = finite_or_silence(input);
        let output = self.normalization.mul_add(
            input - self.previous_input,
            self.coefficient * self.previous_output,
        );
        self.previous_input = input;
        self.previous_output = finite_or_silence(output);
        self.previous_output
    }
}
