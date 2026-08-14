use crate::{Sample, finite_or_silence};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EnvelopeSettings {
    pub attack_ms: f64,
    pub decay_ms: f64,
    pub sustain: Sample,
    pub release_ms: f64,
}

impl EnvelopeSettings {
    #[must_use]
    pub fn bounded(attack_ms: f64, decay_ms: f64, sustain: Sample, release_ms: f64) -> Self {
        Self {
            attack_ms: finite_or_silence(attack_ms).clamp(0.0, 60_000.0),
            decay_ms: finite_or_silence(decay_ms).clamp(0.0, 60_000.0),
            sustain: finite_or_silence(sustain).clamp(0.0, 1.0),
            release_ms: finite_or_silence(release_ms).clamp(0.0, 60_000.0),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum EnvelopeStage {
    #[default]
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct AdsrEnvelope {
    stage: EnvelopeStage,
    value: Sample,
    segment_start: Sample,
    elapsed_samples: u64,
}

impl AdsrEnvelope {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            stage: EnvelopeStage::Idle,
            value: 0.0,
            segment_start: 0.0,
            elapsed_samples: 0,
        }
    }

    #[must_use]
    pub const fn stage(self) -> EnvelopeStage {
        self.stage
    }

    #[must_use]
    pub const fn value(self) -> Sample {
        self.value
    }

    pub fn reset(&mut self) {
        *self = Self::new();
    }

    pub fn note_on(&mut self, settings: EnvelopeSettings) {
        self.segment_start = self.value;
        self.elapsed_samples = 0;
        if settings.attack_ms <= 0.0 {
            self.value = 1.0;
            self.begin_decay(settings);
        } else {
            self.stage = EnvelopeStage::Attack;
        }
    }

    pub fn note_off(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        if self.stage == EnvelopeStage::Idle {
            return;
        }
        if settings.release_ms <= 0.0 || sample_rate_hz <= 0.0 {
            self.reset();
            return;
        }
        self.segment_start = self.value;
        self.elapsed_samples = 0;
        self.stage = EnvelopeStage::Release;
    }

    #[must_use]
    pub fn next(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) -> Sample {
        if !sample_rate_hz.is_finite() || sample_rate_hz <= 0.0 {
            self.reset();
            return 0.0;
        }
        match self.stage {
            EnvelopeStage::Idle => {}
            EnvelopeStage::Attack => self.advance_attack(settings, sample_rate_hz),
            EnvelopeStage::Decay => self.advance_decay(settings, sample_rate_hz),
            EnvelopeStage::Sustain => self.value = settings.sustain,
            EnvelopeStage::Release => self.advance_release(settings, sample_rate_hz),
        }
        self.value = finite_or_silence(self.value).clamp(0.0, 1.0);
        self.value
    }

    fn advance_attack(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        let progress = self.advance_progress(settings.attack_ms, sample_rate_hz);
        self.value = smooth_step(progress).mul_add(1.0 - self.segment_start, self.segment_start);
        if progress >= 1.0 {
            self.value = 1.0;
            self.begin_decay(settings);
        }
    }

    fn advance_decay(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        let progress = self.advance_progress(settings.decay_ms, sample_rate_hz);
        self.value = smooth_step(progress).mul_add(settings.sustain - 1.0, 1.0);
        if progress >= 1.0 {
            self.value = settings.sustain;
            self.stage = EnvelopeStage::Sustain;
        }
    }

    fn advance_release(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        let progress = self.advance_progress(settings.release_ms, sample_rate_hz);
        self.value = self.segment_start * (1.0 - smooth_step(progress));
        if progress >= 1.0 || !self.value.is_finite() {
            self.reset();
        }
    }

    fn begin_decay(&mut self, settings: EnvelopeSettings) {
        self.segment_start = 1.0;
        self.elapsed_samples = 0;
        if settings.decay_ms <= 0.0 {
            self.value = settings.sustain;
            self.stage = EnvelopeStage::Sustain;
        } else {
            self.stage = EnvelopeStage::Decay;
        }
    }

    fn advance_progress(&mut self, milliseconds: f64, sample_rate_hz: f64) -> f64 {
        let duration = duration_samples(milliseconds, sample_rate_hz);
        self.elapsed_samples = self.elapsed_samples.saturating_add(1).min(duration);
        count_as_f64(self.elapsed_samples) / count_as_f64(duration)
    }
}

fn duration_samples(milliseconds: f64, sample_rate_hz: f64) -> u64 {
    let samples = finite_or_silence(milliseconds) * finite_or_silence(sample_rate_hz) / 1_000.0;
    if !samples.is_finite() || samples <= 1.0 {
        1
    } else if samples >= u32::MAX.into() {
        u64::from(u32::MAX)
    } else {
        rounded_sample_count(samples)
    }
}

// `duration_samples` proves that the input is finite, positive, and no greater
// than `u32::MAX`, so this conversion cannot lose sign or truncate the rounded
// integral result.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn rounded_sample_count(samples: f64) -> u64 {
    samples.round() as u64
}

fn count_as_f64(value: u64) -> f64 {
    let high = u32::try_from(value >> 32).unwrap_or(u32::MAX);
    let low = u32::try_from(value & u64::from(u32::MAX)).unwrap_or(u32::MAX);
    f64::from(high).mul_add(4_294_967_296.0, f64::from(low))
}

fn smooth_step(progress: f64) -> f64 {
    let bounded = finite_or_silence(progress).clamp(0.0, 1.0);
    bounded * bounded * (3.0 - 2.0 * bounded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traverses_attack_decay_sustain_and_release() {
        let settings = EnvelopeSettings::bounded(1.0, 1.0, 0.5, 1.0);
        let mut envelope = AdsrEnvelope::new();
        envelope.note_on(settings);
        for _ in 0..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        assert_eq!(envelope.stage(), EnvelopeStage::Decay);
        for _ in 0..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        assert_eq!(envelope.stage(), EnvelopeStage::Sustain);
        assert!((envelope.value() - 0.5).abs() < 1.0e-12);
        envelope.note_off(settings, 48_000.0);
        for _ in 0..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        assert_eq!(envelope.stage(), EnvelopeStage::Idle);
        assert!(envelope.value().abs() < f64::EPSILON);
    }

    #[test]
    fn handles_zero_times_and_non_finite_settings() {
        let settings = EnvelopeSettings::bounded(f64::NAN, 0.0, 0.75, f64::INFINITY);
        let mut envelope = AdsrEnvelope::new();
        envelope.note_on(settings);
        assert_eq!(envelope.stage(), EnvelopeStage::Sustain);
        assert!((envelope.next(settings, 48_000.0) - 0.75).abs() < f64::EPSILON);
        envelope.note_off(settings, 48_000.0);
        assert_eq!(envelope.stage(), EnvelopeStage::Idle);
    }

    #[test]
    fn retrigger_preserves_the_current_value_without_a_reset_click() {
        let settings = EnvelopeSettings::bounded(10.0, 20.0, 0.4, 30.0);
        let mut envelope = AdsrEnvelope::new();
        envelope.note_on(settings);
        for _ in 0..120 {
            let _ = envelope.next(settings, 48_000.0);
        }
        let before = envelope.value();
        envelope.note_on(settings);
        assert!((envelope.value() - before).abs() < f64::EPSILON);
        let first = envelope.next(settings, 48_000.0);
        assert!(first >= before && first - before < 1.0e-4);
    }

    #[test]
    fn curved_segments_finish_at_exact_bounded_sample_counts() {
        let settings = EnvelopeSettings::bounded(1.0, 1.0, 0.5, 1.0);
        let mut envelope = AdsrEnvelope::new();
        envelope.note_on(settings);
        let first = envelope.next(settings, 48_000.0);
        assert!(first > 0.0 && first < 1.0 / 48.0);
        for _ in 1..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        assert_eq!(envelope.stage(), EnvelopeStage::Decay);
        for _ in 0..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        envelope.note_off(settings, 48_000.0);
        for _ in 0..48 {
            let _ = envelope.next(settings, 48_000.0);
        }
        assert_eq!(envelope.stage(), EnvelopeStage::Idle);
    }
}
