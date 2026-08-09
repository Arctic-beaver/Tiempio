use crate::{Sample, finite_or_silence};

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
}
