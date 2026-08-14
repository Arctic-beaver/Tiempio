use std::array;

use tiempio_engine_core::{DrumVoiceStart, SynthVoiceBank, VoiceIdentity, VoiceStart};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};

use crate::{SynthVoice, VoiceLifecycle};

pub const SYNTH_VOICE_COUNT: usize = 64;
pub const BASS_VOICE_COUNT: usize = SYNTH_VOICE_COUNT;

pub struct SynthVoicePool {
    voices: [SynthVoice; SYNTH_VOICE_COUNT],
    voice_steals: u64,
}

impl SynthVoicePool {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            voices: array::from_fn(|_| SynthVoice::new(configuration)),
            voice_steals: 0,
        }
    }

    #[must_use]
    pub fn slot_identity(&self, slot: usize) -> Option<VoiceIdentity> {
        self.voices.get(slot).and_then(SynthVoice::identity)
    }

    #[must_use]
    pub fn slot_lifecycle(&self, slot: usize) -> Option<VoiceLifecycle> {
        self.voices.get(slot).map(SynthVoice::lifecycle)
    }

    fn select_slot(&self, identity: VoiceIdentity) -> (usize, bool) {
        if let Some(slot) = self
            .voices
            .iter()
            .position(|voice| voice.identity() == Some(identity))
        {
            return (slot, false);
        }
        if let Some(slot) = self
            .voices
            .iter()
            .position(|voice| voice.lifecycle() == VoiceLifecycle::Free)
        {
            return (slot, false);
        }
        if let Some((slot, _)) = self
            .voices
            .iter()
            .enumerate()
            .filter(|(_, voice)| voice.lifecycle() == VoiceLifecycle::Released)
            .min_by_key(|(slot, voice)| (voice.released_at(), *slot))
        {
            return (slot, true);
        }
        let slot = self
            .voices
            .iter()
            .enumerate()
            .min_by_key(|(slot, voice)| (voice.started_at(), *slot))
            .map_or(0, |(slot, _)| slot);
        (slot, true)
    }
}

impl SynthVoiceBank for SynthVoicePool {
    fn note_on(&mut self, start: VoiceStart<'_>) {
        let (slot, stolen) = self.select_slot(start.identity);
        if stolen {
            self.voice_steals = self.voice_steals.saturating_add(1);
        }
        self.voices[slot].start(start);
    }

    fn note_off(&mut self, identity: VoiceIdentity, released_at: u64) {
        if let Some(voice) = self
            .voices
            .iter_mut()
            .find(|voice| voice.identity() == Some(identity))
        {
            voice.release(released_at);
        }
    }

    fn reset_scheduled(&mut self) {
        for voice in &mut self.voices {
            if matches!(voice.identity(), Some(VoiceIdentity::Scheduled { .. })) {
                voice.reset();
            }
        }
    }

    fn reset_all(&mut self) {
        for voice in &mut self.voices {
            voice.reset();
        }
    }

    fn render_frame(&mut self) -> StereoFrame {
        let mut mixed = StereoFrame::default();
        for voice in &mut self.voices {
            let frame = voice.render();
            mixed.left += frame.left;
            mixed.right += frame.right;
        }
        mixed
    }

    fn active_voice_count(&self) -> usize {
        self.voices
            .iter()
            .filter(|voice| voice.lifecycle() != VoiceLifecycle::Free)
            .count()
    }

    fn voice_steal_count(&self) -> u64 {
        self.voice_steals
    }
}

impl tiempio_engine_core::VoiceBank for SynthVoicePool {
    fn note_on(&mut self, start: VoiceStart<'_>) {
        SynthVoiceBank::note_on(self, start);
    }

    fn drum_hit(&mut self, _start: DrumVoiceStart<'_>) {}

    fn note_off(&mut self, identity: VoiceIdentity, released_at: u64) {
        SynthVoiceBank::note_off(self, identity, released_at);
    }

    fn reset_scheduled(&mut self) {
        SynthVoiceBank::reset_scheduled(self);
    }

    fn reset_all(&mut self) {
        SynthVoiceBank::reset_all(self);
    }

    fn render_frame(&mut self) -> StereoFrame {
        SynthVoiceBank::render_frame(self)
    }

    fn active_voice_count(&self) -> usize {
        SynthVoiceBank::active_voice_count(self)
    }

    fn voice_steal_count(&self) -> u64 {
        SynthVoiceBank::voice_steal_count(self)
    }
}

pub type BassVoicePool = SynthVoicePool;

#[cfg(test)]
mod tests {
    use tiempio_engine_core::{
        PATCH_MODEL_VERSION, SynthAmplifierPatch, SynthExpressionPatch, SynthFilterPatch,
        SynthMovementPatch, SynthOscillatorPatch, SynthPatch, SynthSecondaryOscillatorPatch,
        SynthWaveform,
    };

    use super::*;

    fn patch() -> SynthPatch {
        SynthPatch {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: SynthOscillatorPatch {
                waveform: SynthWaveform::Saw,
                detune_cents: -3.0,
                sub_level: 0.75,
                noise_level: 0.0,
                pulse_width: 0.5,
                secondary: SynthSecondaryOscillatorPatch {
                    waveform: SynthWaveform::Sine,
                    semitone_offset: 0,
                    detune_cents: 7.0,
                    level: 0.16,
                },
            },
            filter: SynthFilterPatch {
                cutoff_hz: 340.0,
                envelope_amount: 0.42,
                key_tracking: 0.45,
                resonance: 0.34,
            },
            amplifier: SynthAmplifierPatch {
                attack_ms: 2.0,
                decay_ms: 30.0,
                release_ms: 10.0,
                sustain: 0.7,
            },
            movement: SynthMovementPatch {
                rate_hz: 0.0,
                depth: 0.0,
            },
            expression: SynthExpressionPatch {
                amplitude_amount: 0.9,
                attack_scale: 0.5,
                filter_octaves: 1.5,
                velocity_curve: 0.8,
            },
            drive: 0.08,
            stereo_width: 0.03,
            output_gain: 0.7,
        }
    }

    fn start(identifier: u64, started_at: u64, patch: &SynthPatch) -> VoiceStart<'_> {
        VoiceStart {
            identity: VoiceIdentity::Audition(identifier),
            pitch: 36,
            velocity: 100,
            patch,
            layer_gain: 1.0,
            layer_pan: 0.0,
            started_at,
        }
    }

    #[test]
    fn uses_lowest_free_then_oldest_released_then_oldest_active_slot() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let patch = patch();
        let mut pool = SynthVoicePool::new(configuration);
        for identifier in 0..BASS_VOICE_COUNT {
            pool.note_on(start(
                u64::try_from(identifier).expect("voice index"),
                u64::try_from(identifier).expect("voice index"),
                &patch,
            ));
        }
        pool.note_on(start(100, 100, &patch));
        assert_eq!(pool.slot_identity(0), Some(VoiceIdentity::Audition(100)));
        pool.note_off(VoiceIdentity::Audition(1), 101);
        pool.note_on(start(101, 102, &patch));
        assert_eq!(pool.slot_identity(1), Some(VoiceIdentity::Audition(101)));
        assert_eq!(pool.voice_steal_count(), 2);
    }

    #[test]
    fn retriggers_a_matching_identity_and_ignores_unknown_or_repeated_note_off() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let patch = patch();
        let mut pool = SynthVoicePool::new(configuration);
        pool.note_on(start(7, 10, &patch));
        pool.note_on(start(7, 20, &patch));
        assert_eq!(pool.slot_identity(0), Some(VoiceIdentity::Audition(7)));
        assert_eq!(pool.active_voice_count(), 1);
        assert_eq!(pool.voice_steal_count(), 0);

        pool.note_off(VoiceIdentity::Audition(99), 25);
        assert_eq!(pool.slot_lifecycle(0), Some(VoiceLifecycle::Active));
        pool.note_off(VoiceIdentity::Audition(7), 30);
        assert_eq!(pool.slot_lifecycle(0), Some(VoiceLifecycle::Released));
        assert_eq!(pool.voices[0].released_at(), 30);
        pool.note_off(VoiceIdentity::Audition(7), 40);
        assert_eq!(pool.voices[0].released_at(), 30);
    }

    #[test]
    fn renders_finite_non_silent_deep_bass_and_releases_to_free() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let patch = patch();
        let mut pool = SynthVoicePool::new(configuration);
        pool.note_on(start(1, 0, &patch));
        let mut energy = 0.0;
        for _ in 0..4_800 {
            let frame = pool.render_frame();
            assert!(frame.is_finite());
            energy += frame.left.abs() + frame.right.abs();
        }
        assert!(energy > 1.0);
        pool.note_off(VoiceIdentity::Audition(1), 4_800);
        for _ in 0..1_000 {
            let _ = pool.render_frame();
        }
        assert_eq!(pool.active_voice_count(), 0);
    }
}
