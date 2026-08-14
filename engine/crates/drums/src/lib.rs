use std::array;

use tiempio_engine_core::{
    DrumAlgorithm, DrumInstrument, DrumVoiceBank, DrumVoiceStart, VoiceIdentity,
};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame, apply_gain_pan, saturate};

pub const DRUM_MODEL_VERSION: u32 = 2;
pub const DRUM_VOICE_COUNT: usize = 32;

#[derive(Clone, Copy, Debug)]
struct DrumVoice {
    identity: Option<VoiceIdentity>,
    instrument: DrumInstrument,
    algorithm: DrumAlgorithm,
    started_at: u64,
    phase: f64,
    pitch_hz: f64,
    tone: f64,
    noise: f64,
    drive: f64,
    gain: f64,
    layer_gain: f64,
    layer_pan: f64,
    velocity_gain: f64,
    remaining_frames: u32,
    total_frames: u32,
    noise_state: u64,
    previous_noise: f64,
}

impl Default for DrumVoice {
    fn default() -> Self {
        Self {
            identity: None,
            instrument: DrumInstrument::Kick,
            algorithm: DrumAlgorithm::Kick,
            started_at: 0,
            phase: 0.0,
            pitch_hz: 50.0,
            tone: 0.5,
            noise: 0.0,
            drive: 0.0,
            gain: 0.0,
            layer_gain: 0.0,
            layer_pan: 0.0,
            velocity_gain: 0.0,
            remaining_frames: 0,
            total_frames: 1,
            noise_state: 1,
            previous_noise: 0.0,
        }
    }
}

impl DrumVoice {
    fn is_active(&self) -> bool {
        self.remaining_frames > 0
    }

    fn start(&mut self, start: DrumVoiceStart<'_>, sample_rate: u32) {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let decay_frames = (start.patch.decay_ms * f64::from(sample_rate) / 1_000.0)
            .round()
            .clamp(1.0, f64::from(u32::MAX)) as u32;
        self.identity = Some(start.identity);
        self.instrument = start.instrument;
        self.algorithm = start.patch.algorithm;
        self.started_at = start.started_at;
        self.phase = 0.0;
        self.pitch_hz = start.patch.pitch_hz;
        self.tone = start.patch.tone;
        self.noise = start.patch.noise;
        self.drive = start.patch.drive;
        self.gain = start.patch.gain;
        self.layer_gain = start.layer_gain;
        self.layer_pan = start.layer_pan;
        self.velocity_gain = f64::from(start.velocity) / 127.0;
        self.remaining_frames = decay_frames;
        self.total_frames = decay_frames;
        self.noise_state = identity_seed(start.identity);
        self.previous_noise = 0.0;
    }

    fn reset(&mut self) {
        self.identity = None;
        self.remaining_frames = 0;
    }

    fn choke(&mut self, frames: u32) {
        self.remaining_frames = self.remaining_frames.min(frames);
        self.total_frames = self.total_frames.max(1);
    }

    fn render(&mut self, sample_rate: f64) -> StereoFrame {
        if !self.is_active() {
            return StereoFrame::default();
        }
        let elapsed = 1.0 - f64::from(self.remaining_frames) / f64::from(self.total_frames);
        let envelope = (1.0 - elapsed).powf(1.5 + self.tone * 2.5);
        let raw_noise = next_noise(&mut self.noise_state);
        let high_noise = raw_noise - self.previous_noise * 0.94;
        self.previous_noise = raw_noise;
        let sample = match self.algorithm {
            DrumAlgorithm::Kick => {
                let pitch =
                    self.pitch_hz * (1.0 + (1.0 - elapsed).powi(3) * (2.0 + self.tone * 5.0));
                self.phase = (self.phase + pitch / sample_rate).fract();
                let body = (std::f64::consts::TAU * self.phase).sin();
                let click = high_noise * self.noise * (1.0 - elapsed).powi(12);
                body + click
            }
            DrumAlgorithm::Clap => {
                let burst = if elapsed < 0.08
                    || (0.16..0.23).contains(&elapsed)
                    || (0.31..0.38).contains(&elapsed)
                {
                    1.0
                } else {
                    0.42
                };
                high_noise * burst * (0.6 + self.noise * 0.4)
            }
            DrumAlgorithm::ClosedHat | DrumAlgorithm::OpenHat => {
                high_noise * (0.45 + self.tone * 0.55)
            }
            DrumAlgorithm::Perc => {
                let pitch = self.pitch_hz * (1.0 + (1.0 - elapsed) * self.tone * 1.5);
                self.phase = (self.phase + pitch / sample_rate).fract();
                let body = (std::f64::consts::TAU * self.phase).sin();
                body * (1.0 - self.noise) + high_noise * self.noise
            }
        };
        self.remaining_frames -= 1;
        if self.remaining_frames == 0 {
            self.identity = None;
        }
        let mono = saturate(
            sample * envelope * self.velocity_gain * self.gain,
            self.drive,
        );
        apply_gain_pan(StereoFrame::mono(mono), self.layer_gain, self.layer_pan)
    }
}

pub struct DrumVoicePool {
    configuration: DspConfiguration,
    voices: [DrumVoice; DRUM_VOICE_COUNT],
    voice_steals: u64,
}

impl DrumVoicePool {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            configuration,
            voices: array::from_fn(|_| DrumVoice::default()),
            voice_steals: 0,
        }
    }

    fn select_slot(&self) -> (usize, bool) {
        if let Some(slot) = self.voices.iter().position(|voice| !voice.is_active()) {
            return (slot, false);
        }
        let slot = self
            .voices
            .iter()
            .enumerate()
            .min_by_key(|(slot, voice)| (voice.remaining_frames, voice.started_at, *slot))
            .map_or(0, |(slot, _)| slot);
        (slot, true)
    }
}

impl DrumVoiceBank for DrumVoicePool {
    fn drum_hit(&mut self, start: DrumVoiceStart<'_>) {
        if start.instrument == DrumInstrument::ClosedHat {
            let choke_frames = (self.configuration.sample_rate() / 100).max(1);
            for voice in &mut self.voices {
                if voice.instrument == DrumInstrument::OpenHat && voice.is_active() {
                    voice.choke(choke_frames);
                }
            }
        }
        let (slot, stolen) = self.select_slot();
        if stolen {
            self.voice_steals = self.voice_steals.saturating_add(1);
        }
        self.voices[slot].start(start, self.configuration.sample_rate());
    }

    fn reset_scheduled(&mut self) {
        for voice in &mut self.voices {
            if matches!(voice.identity, Some(VoiceIdentity::Scheduled { .. })) {
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
            let frame = voice.render(self.configuration.sample_rate_hz());
            mixed.left += frame.left;
            mixed.right += frame.right;
        }
        mixed
    }

    fn active_voice_count(&self) -> usize {
        self.voices.iter().filter(|voice| voice.is_active()).count()
    }

    fn voice_steal_count(&self) -> u64 {
        self.voice_steals
    }
}

fn identity_seed(identity: VoiceIdentity) -> u64 {
    match identity {
        VoiceIdentity::Audition(value) => value.saturating_add(1),
        VoiceIdentity::Scheduled {
            generation,
            layer_index,
            event_index,
        } => {
            generation
                ^ u64::try_from(layer_index).unwrap_or(0).rotate_left(19)
                ^ u64::try_from(event_index).unwrap_or(0).rotate_left(37)
                ^ 0xA076_1D64_78BD_642F
        }
    }
}

#[allow(clippy::cast_precision_loss)]
fn next_noise(state: &mut u64) -> f64 {
    *state = state
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1);
    let value = (*state >> 11) as f64 / ((1_u64 << 53) as f64);
    value * 2.0 - 1.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use tiempio_engine_core::{DrumVoicePatch, VoiceIdentity};

    fn patch(algorithm: DrumAlgorithm) -> DrumVoicePatch {
        DrumVoicePatch {
            algorithm,
            pitch_hz: 70.0,
            tone: 0.5,
            decay_ms: 120.0,
            noise: 0.2,
            drive: 0.1,
            gain: 0.8,
        }
    }

    #[test]
    fn renders_each_algorithm_as_finite_audio() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let mut pool = DrumVoicePool::new(configuration);
        for (index, (instrument, algorithm)) in [
            (DrumInstrument::Kick, DrumAlgorithm::Kick),
            (DrumInstrument::Clap, DrumAlgorithm::Clap),
            (DrumInstrument::ClosedHat, DrumAlgorithm::ClosedHat),
            (DrumInstrument::OpenHat, DrumAlgorithm::OpenHat),
            (DrumInstrument::Perc, DrumAlgorithm::Perc),
        ]
        .into_iter()
        .enumerate()
        {
            let voice_patch = patch(algorithm);
            pool.drum_hit(DrumVoiceStart {
                identity: VoiceIdentity::Audition(u64::try_from(index).expect("index")),
                instrument,
                velocity: 100,
                patch: &voice_patch,
                layer_gain: 1.0,
                layer_pan: 0.0,
                started_at: u64::try_from(index).expect("index"),
            });
        }
        let mut energy = 0.0;
        for _ in 0..2_000 {
            let frame = pool.render_frame();
            assert!(frame.left.is_finite() && frame.right.is_finite());
            energy += frame.left.abs() + frame.right.abs();
        }
        assert!(energy > 1.0);
    }
}
