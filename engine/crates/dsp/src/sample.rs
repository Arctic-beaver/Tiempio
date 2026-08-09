pub type Sample = f64;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StereoFrame {
    pub left: Sample,
    pub right: Sample,
}

impl StereoFrame {
    #[must_use]
    pub const fn new(left: Sample, right: Sample) -> Self {
        Self { left, right }
    }

    #[must_use]
    pub const fn mono(sample: Sample) -> Self {
        Self::new(sample, sample)
    }

    #[must_use]
    pub fn is_finite(self) -> bool {
        self.left.is_finite() && self.right.is_finite()
    }
}

#[must_use]
pub fn finite_or_silence(sample: Sample) -> Sample {
    if sample.is_finite() { sample } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_non_finite_samples_with_silence() {
        assert!(finite_or_silence(f64::NAN).abs() < f64::EPSILON);
        assert!(finite_or_silence(f64::INFINITY).abs() < f64::EPSILON);
        assert!((finite_or_silence(-0.25) + 0.25).abs() < f64::EPSILON);
    }
}
