use tiempio_engine_core::{SynthPatchV2, SynthWaveform, VoiceIdentity, VoiceStart};
use tiempio_engine_dsp::{
    AdsrEnvelope, DspConfiguration, EnvelopeSettings, EnvelopeStage, LinearSmoother,
    PhaseOscillator, StateVariableLowPass, StereoFrame, apply_gain_pan, apply_stereo_width,
    saturate,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum VoiceLifecycle {
    #[default]
    Free,
    Active,
    Released,
}

pub struct SynthVoice {
    configuration: DspConfiguration,
    identity: Option<VoiceIdentity>,
    lifecycle: VoiceLifecycle,
    started_at: u64,
    released_at: u64,
    frequency_hz: f64,
    detune_cents: f64,
    sub_level: f64,
    noise_level: f64,
    pulse_width: f64,
    waveform: SynthWaveform,
    filter_envelope_amount: f64,
    movement_depth: f64,
    movement_rate_hz: f64,
    noise_state: u64,
    velocity_gain: f64,
    layer_gain: f64,
    layer_pan: f64,
    envelope_settings: EnvelopeSettings,
    envelope: AdsrEnvelope,
    left_saw: PhaseOscillator,
    right_saw: PhaseOscillator,
    sub: PhaseOscillator,
    movement: PhaseOscillator,
    left_filter: StateVariableLowPass,
    right_filter: StateVariableLowPass,
    cutoff: LinearSmoother,
    resonance: LinearSmoother,
    drive: LinearSmoother,
    width: LinearSmoother,
    output_gain: LinearSmoother,
}

impl SynthVoice {
    #[must_use]
    pub fn new(configuration: DspConfiguration) -> Self {
        Self {
            configuration,
            identity: None,
            lifecycle: VoiceLifecycle::Free,
            started_at: 0,
            released_at: 0,
            frequency_hz: 0.0,
            detune_cents: 0.0,
            sub_level: 0.0,
            noise_level: 0.0,
            pulse_width: 0.5,
            waveform: SynthWaveform::Saw,
            filter_envelope_amount: 0.0,
            movement_depth: 0.0,
            movement_rate_hz: 0.0,
            noise_state: 1,
            velocity_gain: 0.0,
            layer_gain: 0.0,
            layer_pan: 0.0,
            envelope_settings: EnvelopeSettings::bounded(0.0, 0.0, 0.0, 0.0),
            envelope: AdsrEnvelope::new(),
            left_saw: PhaseOscillator::new(),
            right_saw: PhaseOscillator::new(),
            sub: PhaseOscillator::new(),
            movement: PhaseOscillator::new(),
            left_filter: StateVariableLowPass::new(configuration),
            right_filter: StateVariableLowPass::new(configuration),
            cutoff: LinearSmoother::new(20.0),
            resonance: LinearSmoother::new(0.0),
            drive: LinearSmoother::new(0.0),
            width: LinearSmoother::new(0.0),
            output_gain: LinearSmoother::new(0.0),
        }
    }

    #[must_use]
    pub const fn identity(&self) -> Option<VoiceIdentity> {
        self.identity
    }

    #[must_use]
    pub const fn lifecycle(&self) -> VoiceLifecycle {
        self.lifecycle
    }

    #[must_use]
    pub const fn started_at(&self) -> u64 {
        self.started_at
    }

    #[must_use]
    pub const fn released_at(&self) -> u64 {
        self.released_at
    }

    pub fn start(&mut self, start: VoiceStart<'_>) {
        self.identity = Some(start.identity);
        self.lifecycle = VoiceLifecycle::Active;
        self.started_at = start.started_at;
        self.released_at = 0;
        self.frequency_hz = midi_frequency(start.pitch);
        self.detune_cents = start.patch.oscillator.detune_cents;
        self.sub_level = start.patch.oscillator.sub_level;
        self.noise_level = start.patch.oscillator.noise_level;
        self.pulse_width = start.patch.oscillator.pulse_width;
        self.waveform = start.patch.oscillator.waveform;
        self.filter_envelope_amount = start.patch.filter.envelope_amount;
        self.movement_depth = start.patch.movement.depth;
        self.movement_rate_hz = start.patch.movement.rate_hz;
        self.noise_state = identity_seed(start.identity);
        self.velocity_gain = f64::from(start.velocity) / 127.0;
        self.layer_gain = start.layer_gain;
        self.layer_pan = start.layer_pan;
        self.envelope_settings = EnvelopeSettings::bounded(
            start.patch.amplifier.attack_ms,
            start.patch.amplifier.decay_ms,
            start.patch.amplifier.sustain,
            start.patch.amplifier.release_ms,
        );
        self.envelope.note_on(self.envelope_settings);
        self.left_saw.reset(0.0);
        self.right_saw.reset(0.5);
        self.sub.reset(0.25);
        self.movement.reset(0.0);
        self.left_filter.reset();
        self.right_filter.reset();
        self.cutoff.reset(start.patch.filter.cutoff_hz);
        self.resonance.reset(start.patch.filter.resonance);
        self.drive.reset(start.patch.drive);
        self.width.reset(start.patch.stereo_width);
        self.output_gain.reset(start.patch.output_gain);
    }

    pub fn release(&mut self, released_at: u64) {
        if self.lifecycle != VoiceLifecycle::Active {
            return;
        }
        self.released_at = released_at;
        self.lifecycle = VoiceLifecycle::Released;
        self.envelope
            .note_off(self.envelope_settings, self.configuration.sample_rate_hz());
    }

    pub fn reset(&mut self) {
        self.identity = None;
        self.lifecycle = VoiceLifecycle::Free;
        self.frequency_hz = 0.0;
        self.envelope.reset();
        self.left_filter.reset();
        self.right_filter.reset();
    }

    pub fn set_patch_targets(&mut self, patch: &SynthPatchV2) {
        let rate = self.configuration.sample_rate_hz();
        self.detune_cents = patch.oscillator.detune_cents;
        self.sub_level = patch.oscillator.sub_level;
        self.noise_level = patch.oscillator.noise_level;
        self.pulse_width = patch.oscillator.pulse_width;
        self.waveform = patch.oscillator.waveform;
        self.filter_envelope_amount = patch.filter.envelope_amount;
        self.movement_depth = patch.movement.depth;
        self.movement_rate_hz = patch.movement.rate_hz;
        self.cutoff.set_target(patch.filter.cutoff_hz, 10.0, rate);
        self.resonance
            .set_target(patch.filter.resonance, 10.0, rate);
        self.drive.set_target(patch.drive, 10.0, rate);
        self.width.set_target(patch.stereo_width, 10.0, rate);
        self.output_gain.set_target(patch.output_gain, 10.0, rate);
    }

    #[must_use]
    pub fn render(&mut self) -> StereoFrame {
        if self.lifecycle == VoiceLifecycle::Free {
            return StereoFrame::default();
        }
        let sample_rate = self.configuration.sample_rate_hz();
        let envelope = self.envelope.next(self.envelope_settings, sample_rate);
        if self.envelope.stage() == EnvelopeStage::Idle {
            self.reset();
            return StereoFrame::default();
        }
        let detune = 2.0_f64.powf(self.detune_cents / 2_400.0);
        let left_oscillator = oscillator_sample(
            &mut self.left_saw,
            self.waveform,
            self.pulse_width,
            self.frequency_hz / detune,
            sample_rate,
        );
        let right_oscillator = oscillator_sample(
            &mut self.right_saw,
            self.waveform,
            self.pulse_width,
            self.frequency_hz * detune,
            sample_rate,
        );
        let sub = self.sub.next_sine(self.frequency_hz * 0.5, sample_rate) * self.sub_level;
        let noise = next_noise(&mut self.noise_state) * self.noise_level;
        let normalization = 1.0 / (1.0 + self.sub_level + self.noise_level);
        let movement =
            self.movement.next_sine(self.movement_rate_hz, sample_rate) * self.movement_depth;
        let cutoff = self.cutoff.advance()
            * (1.0 + self.filter_envelope_amount * envelope * 4.0)
            * 2.0_f64.powf(movement);
        let resonance = self.resonance.advance();
        self.left_filter.set_parameters(cutoff, resonance);
        self.right_filter.set_parameters(cutoff, resonance);
        let amplitude = envelope * self.velocity_gain * normalization;
        let drive = self.drive.advance();
        let mut frame = StereoFrame::new(
            saturate(
                self.left_filter.process(left_oscillator + sub + noise) * amplitude,
                drive,
            ),
            saturate(
                self.right_filter
                    .process(right_oscillator + sub - noise * 0.35)
                    * amplitude,
                drive,
            ),
        );
        frame = apply_stereo_width(frame, self.width.advance());
        apply_gain_pan(
            frame,
            self.output_gain.advance() * self.layer_gain,
            self.layer_pan,
        )
    }
}

pub type DeepBassVoice = SynthVoice;

fn oscillator_sample(
    oscillator: &mut PhaseOscillator,
    waveform: SynthWaveform,
    pulse_width: f64,
    frequency_hz: f64,
    sample_rate_hz: f64,
) -> f64 {
    let phase = oscillator.phase();
    let saw = oscillator.next_saw(frequency_hz, sample_rate_hz);
    match waveform {
        SynthWaveform::Saw => saw,
        SynthWaveform::Square => {
            if phase < pulse_width {
                1.0
            } else {
                -1.0
            }
        }
        SynthWaveform::Triangle => 1.0 - 4.0 * (phase - 0.5).abs(),
        SynthWaveform::Sine => (std::f64::consts::TAU * phase).sin(),
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
                ^ u64::try_from(layer_index).unwrap_or(0).rotate_left(17)
                ^ u64::try_from(event_index).unwrap_or(0).rotate_left(33)
                ^ 0x9E37_79B9_7F4A_7C15
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

fn midi_frequency(pitch: u8) -> f64 {
    440.0 * 2.0_f64.powf((f64::from(pitch) - 69.0) / 12.0)
}
