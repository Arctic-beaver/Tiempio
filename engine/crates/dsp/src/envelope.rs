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
    release_step: Sample,
}

impl AdsrEnvelope {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            stage: EnvelopeStage::Idle,
            value: 0.0,
            release_step: 0.0,
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
        self.value = 0.0;
        self.release_step = 0.0;
        if settings.attack_ms <= 0.0 {
            self.value = 1.0;
            self.stage = if settings.decay_ms <= 0.0 {
                self.value = settings.sustain;
                EnvelopeStage::Sustain
            } else {
                EnvelopeStage::Decay
            };
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
        self.release_step = self.value * 1_000.0 / (settings.release_ms * sample_rate_hz);
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
            EnvelopeStage::Release => self.advance_release(),
        }
        self.value = finite_or_silence(self.value).clamp(0.0, 1.0);
        self.value
    }

    fn advance_attack(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        self.value += 1_000.0 / (settings.attack_ms * sample_rate_hz);
        if self.value >= 1.0 - 1.0e-12 {
            self.value = 1.0;
            self.stage = if settings.decay_ms <= 0.0 {
                self.value = settings.sustain;
                EnvelopeStage::Sustain
            } else {
                EnvelopeStage::Decay
            };
        }
    }

    fn advance_decay(&mut self, settings: EnvelopeSettings, sample_rate_hz: f64) {
        self.value -= (1.0 - settings.sustain) * 1_000.0 / (settings.decay_ms * sample_rate_hz);
        if self.value <= settings.sustain + 1.0e-12 {
            self.value = settings.sustain;
            self.stage = EnvelopeStage::Sustain;
        }
    }

    fn advance_release(&mut self) {
        self.value -= self.release_step;
        if self.value <= 1.0e-12 || !self.value.is_finite() {
            self.reset();
        }
    }
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
}
