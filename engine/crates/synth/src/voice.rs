use tiempio_engine_core::{SynthPatch, SynthWaveform, VoiceIdentity, VoiceStart};
use tiempio_engine_dsp::{
    AdsrEnvelope, AntialiasedSaturator, DcBlocker, DspConfiguration, EnvelopeSettings,
    EnvelopeStage, LinearSmoother, LowSideGuard, PhaseOscillator, StateVariableLowPass,
    StereoFrame, apply_gain_pan, apply_stereo_width,
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
    pitch: u8,
    velocity: u8,
    frequency_hz: f64,
    detune_cents: f64,
    sub_level: f64,
    noise_level: f64,
    pulse_width: f64,
    waveform: SynthWaveform,
    secondary_waveform: SynthWaveform,
    secondary_semitone_offset: i32,
    secondary_detune_cents: f64,
    filter_envelope_amount: f64,
    movement_depth: f64,
    movement_rate_hz: f64,
    noise_state: u64,
    velocity_gain: f64,
    filter_expression_ratio: f64,
    layer_gain: f64,
    layer_pan: f64,
    envelope_settings: EnvelopeSettings,
    envelope: AdsrEnvelope,
    left_primary: PhaseOscillator,
    right_primary: PhaseOscillator,
    left_secondary: PhaseOscillator,
    right_secondary: PhaseOscillator,
    sub: PhaseOscillator,
    movement: PhaseOscillator,
    left_filter: StateVariableLowPass,
    right_filter: StateVariableLowPass,
    left_colour: AntialiasedSaturator,
    right_colour: AntialiasedSaturator,
    left_dc: DcBlocker,
    right_dc: DcBlocker,
    low_side_guard: LowSideGuard,
    cutoff: LinearSmoother,
    resonance: LinearSmoother,
    drive: LinearSmoother,
    width: LinearSmoother,
    secondary_level: LinearSmoother,
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
            pitch: 0,
            velocity: 0,
            frequency_hz: 0.0,
            detune_cents: 0.0,
            sub_level: 0.0,
            noise_level: 0.0,
            pulse_width: 0.5,
            waveform: SynthWaveform::Saw,
            secondary_waveform: SynthWaveform::Sine,
            secondary_semitone_offset: 0,
            secondary_detune_cents: 0.0,
            filter_envelope_amount: 0.0,
            movement_depth: 0.0,
            movement_rate_hz: 0.0,
            noise_state: 1,
            velocity_gain: 0.0,
            filter_expression_ratio: 1.0,
            layer_gain: 0.0,
            layer_pan: 0.0,
            envelope_settings: EnvelopeSettings::bounded(0.0, 0.0, 0.0, 0.0),
            envelope: AdsrEnvelope::new(),
            left_primary: PhaseOscillator::new(),
            right_primary: PhaseOscillator::new(),
            left_secondary: PhaseOscillator::new(),
            right_secondary: PhaseOscillator::new(),
            sub: PhaseOscillator::new(),
            movement: PhaseOscillator::new(),
            left_filter: StateVariableLowPass::new(configuration),
            right_filter: StateVariableLowPass::new(configuration),
            left_colour: AntialiasedSaturator::new(),
            right_colour: AntialiasedSaturator::new(),
            left_dc: DcBlocker::new(configuration),
            right_dc: DcBlocker::new(configuration),
            low_side_guard: LowSideGuard::new(configuration),
            cutoff: LinearSmoother::new(20.0),
            resonance: LinearSmoother::new(0.0),
            drive: LinearSmoother::new(0.0),
            width: LinearSmoother::new(0.0),
            secondary_level: LinearSmoother::new(0.0),
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
        self.pitch = start.pitch;
        self.velocity = start.velocity;
        self.frequency_hz = midi_frequency(start.pitch);
        self.detune_cents = start.patch.oscillator.detune_cents;
        self.sub_level = start.patch.oscillator.sub_level;
        self.noise_level = start.patch.oscillator.noise_level;
        self.pulse_width = start.patch.oscillator.pulse_width;
        self.waveform = start.patch.oscillator.waveform;
        self.secondary_waveform = start.patch.oscillator.secondary.waveform;
        self.secondary_semitone_offset = start.patch.oscillator.secondary.semitone_offset;
        self.secondary_detune_cents = start.patch.oscillator.secondary.detune_cents;
        self.filter_envelope_amount = start.patch.filter.envelope_amount;
        self.movement_depth = start.patch.movement.depth;
        self.movement_rate_hz = start.patch.movement.rate_hz;
        self.noise_state = identity_seed(start.identity);
        let expression = expression_response(start.pitch, start.velocity, start.patch);
        self.velocity_gain = expression.amplitude_gain;
        self.filter_expression_ratio = expression.filter_ratio;
        self.layer_gain = start.layer_gain;
        self.layer_pan = start.layer_pan;
        self.envelope_settings = EnvelopeSettings::bounded(
            start.patch.amplifier.attack_ms * expression.attack_ratio,
            start.patch.amplifier.decay_ms,
            start.patch.amplifier.sustain,
            start.patch.amplifier.release_ms,
        );
        self.envelope.note_on(self.envelope_settings);
        self.left_primary.reset(0.0);
        self.right_primary.reset(0.0);
        self.left_secondary.reset(0.0);
        self.right_secondary.reset(0.0);
        self.sub.reset(0.0);
        self.movement.reset(0.0);
        self.left_filter.reset();
        self.right_filter.reset();
        self.left_colour.reset();
        self.right_colour.reset();
        self.left_dc.reset();
        self.right_dc.reset();
        self.low_side_guard.reset();
        self.cutoff.reset(start.patch.filter.cutoff_hz);
        self.resonance.reset(start.patch.filter.resonance);
        self.drive.reset(start.patch.drive);
        self.width.reset(start.patch.stereo_width);
        self.secondary_level
            .reset(start.patch.oscillator.secondary.level);
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
        self.pitch = 0;
        self.velocity = 0;
        self.envelope.reset();
        self.left_filter.reset();
        self.right_filter.reset();
        self.left_colour.reset();
        self.right_colour.reset();
        self.left_dc.reset();
        self.right_dc.reset();
        self.low_side_guard.reset();
    }

    pub fn set_patch_targets(&mut self, patch: &SynthPatch) {
        let rate = self.configuration.sample_rate_hz();
        self.detune_cents = patch.oscillator.detune_cents;
        self.sub_level = patch.oscillator.sub_level;
        self.noise_level = patch.oscillator.noise_level;
        self.pulse_width = patch.oscillator.pulse_width;
        self.waveform = patch.oscillator.waveform;
        self.secondary_waveform = patch.oscillator.secondary.waveform;
        self.secondary_semitone_offset = patch.oscillator.secondary.semitone_offset;
        self.secondary_detune_cents = patch.oscillator.secondary.detune_cents;
        self.filter_envelope_amount = patch.filter.envelope_amount;
        self.movement_depth = patch.movement.depth;
        self.movement_rate_hz = patch.movement.rate_hz;
        let expression = expression_response(self.pitch, self.velocity, patch);
        self.velocity_gain = expression.amplitude_gain;
        self.filter_expression_ratio = expression.filter_ratio;
        self.cutoff.set_target(patch.filter.cutoff_hz, 10.0, rate);
        self.resonance
            .set_target(patch.filter.resonance, 10.0, rate);
        self.drive.set_target(patch.drive, 10.0, rate);
        self.width.set_target(patch.stereo_width, 10.0, rate);
        self.secondary_level
            .set_target(patch.oscillator.secondary.level, 10.0, rate);
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
            &mut self.left_primary,
            self.waveform,
            self.pulse_width,
            self.frequency_hz / detune,
            sample_rate,
        );
        let right_oscillator = oscillator_sample(
            &mut self.right_primary,
            self.waveform,
            self.pulse_width,
            self.frequency_hz * detune,
            sample_rate,
        );
        let secondary_level = self.secondary_level.advance();
        let secondary_base =
            self.frequency_hz * 2.0_f64.powf(f64::from(self.secondary_semitone_offset) / 12.0);
        let secondary_detune = 2.0_f64.powf(self.secondary_detune_cents / 2_400.0);
        let left_secondary = oscillator_sample(
            &mut self.left_secondary,
            self.secondary_waveform,
            self.pulse_width,
            secondary_base / secondary_detune,
            sample_rate,
        ) * secondary_level;
        let right_secondary = oscillator_sample(
            &mut self.right_secondary,
            self.secondary_waveform,
            self.pulse_width,
            secondary_base * secondary_detune,
            sample_rate,
        ) * secondary_level;
        let sub = self.sub.next_sine(self.frequency_hz * 0.5, sample_rate) * self.sub_level;
        let noise = next_noise(&mut self.noise_state) * self.noise_level;
        let normalization = 1.0 / (1.0 + secondary_level + self.sub_level + self.noise_level);
        let movement =
            self.movement.next_sine(self.movement_rate_hz, sample_rate) * self.movement_depth;
        let cutoff = self.cutoff.advance()
            * (1.0 + self.filter_envelope_amount * envelope * 4.0)
            * self.filter_expression_ratio
            * 2.0_f64.powf(movement);
        let resonance = self.resonance.advance();
        self.left_filter.set_parameters(cutoff, resonance);
        self.right_filter.set_parameters(cutoff, resonance);
        let amplitude = envelope * self.velocity_gain * normalization;
        let drive = self.drive.advance();
        let mut frame = StereoFrame::new(
            self.left_colour.process(
                self.left_filter
                    .process(left_oscillator + left_secondary + sub + noise),
                drive,
            ) * amplitude,
            self.right_colour.process(
                self.right_filter
                    .process(right_oscillator + right_secondary + sub - noise * 0.35),
                drive,
            ) * amplitude,
        );
        frame = apply_stereo_width(frame, self.width.advance());
        frame = self.low_side_guard.process(frame);
        frame.left = self.left_dc.process(frame.left);
        frame.right = self.right_dc.process(frame.right);
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
    match waveform {
        SynthWaveform::Saw => oscillator.next_saw(frequency_hz, sample_rate_hz),
        SynthWaveform::Square => oscillator.next_pulse(frequency_hz, sample_rate_hz, pulse_width),
        SynthWaveform::Triangle => oscillator.next_triangle(frequency_hz, sample_rate_hz),
        SynthWaveform::Sine => oscillator.next_sine(frequency_hz, sample_rate_hz),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ExpressionResponse {
    amplitude_gain: f64,
    attack_ratio: f64,
    filter_ratio: f64,
}

fn expression_response(pitch: u8, velocity: u8, voice_patch: &SynthPatch) -> ExpressionResponse {
    let normalized_velocity = f64::from(velocity) / 127.0;
    let expressed_velocity = normalized_velocity.powf(voice_patch.expression.velocity_curve);
    let amplitude_gain = voice_patch
        .expression
        .amplitude_amount
        .mul_add(expressed_velocity - 1.0, 1.0);
    let attack_ratio = voice_patch
        .expression
        .attack_scale
        .mul_add(1.0 - expressed_velocity, 1.0);
    let key_octaves = voice_patch.filter.key_tracking * (f64::from(pitch) - 60.0) / 12.0;
    let velocity_octaves = voice_patch.expression.filter_octaves * (expressed_velocity - 1.0);
    ExpressionResponse {
        amplitude_gain,
        attack_ratio,
        filter_ratio: 2.0_f64.powf(key_octaves + velocity_octaves),
    }
}

fn identity_seed(identity: VoiceIdentity) -> u64 {
    match identity {
        VoiceIdentity::Audition(value) => value.saturating_add(1),
        VoiceIdentity::Scheduled {
            generation,
            layer_index,
            instance_index,
            event_index,
            iteration,
        } => {
            generation
                ^ u64::try_from(layer_index).unwrap_or(0).rotate_left(17)
                ^ u64::try_from(instance_index).unwrap_or(0).rotate_left(25)
                ^ u64::try_from(event_index).unwrap_or(0).rotate_left(33)
                ^ iteration.rotate_left(43)
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

#[cfg(test)]
mod tests {
    use tiempio_engine_core::{
        PATCH_MODEL_VERSION, SynthAmplifierPatch, SynthExpressionPatch, SynthFilterPatch,
        SynthMovementPatch, SynthOscillatorPatch, SynthSecondaryOscillatorPatch,
    };

    use super::*;

    fn expression_patch() -> SynthPatch {
        SynthPatch {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: SynthOscillatorPatch {
                waveform: SynthWaveform::Saw,
                detune_cents: 0.0,
                sub_level: 0.0,
                noise_level: 0.0,
                pulse_width: 0.5,
                secondary: SynthSecondaryOscillatorPatch {
                    waveform: SynthWaveform::Sine,
                    semitone_offset: 12,
                    detune_cents: 3.0,
                    level: 0.2,
                },
            },
            filter: SynthFilterPatch {
                cutoff_hz: 1_000.0,
                envelope_amount: 0.0,
                key_tracking: 0.5,
                resonance: 0.0,
            },
            amplifier: SynthAmplifierPatch {
                attack_ms: 10.0,
                decay_ms: 20.0,
                release_ms: 30.0,
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
                velocity_curve: 0.75,
            },
            drive: 0.0,
            stereo_width: 0.0,
            output_gain: 1.0,
        }
    }

    #[test]
    fn velocity_and_key_tracking_are_bounded_and_musical() {
        let patch = expression_patch();
        let soft = expression_response(60, 32, &patch);
        let loud = expression_response(60, 127, &patch);
        let high = expression_response(72, 127, &patch);
        let low = expression_response(48, 127, &patch);

        assert!(soft.amplitude_gain > f64::from(32_u8) / 127.0);
        assert!(soft.amplitude_gain < loud.amplitude_gain);
        assert!(soft.attack_ratio > loud.attack_ratio);
        assert!(soft.filter_ratio < loud.filter_ratio);
        assert!(high.filter_ratio > loud.filter_ratio);
        assert!(low.filter_ratio < loud.filter_ratio);
    }

    fn render_patch(patch: &SynthPatch, midi_note: u8) -> Vec<StereoFrame> {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let mut voice = SynthVoice::new(configuration);
        voice.start(VoiceStart {
            identity: VoiceIdentity::Audition(1),
            pitch: midi_note,
            velocity: 112,
            patch,
            layer_gain: 1.0,
            layer_pan: 0.0,
            started_at: 0,
        });
        (0..2_048).map(|_| voice.render()).collect()
    }

    #[test]
    fn secondary_oscillator_is_deterministic_finite_and_audible() {
        let patch = expression_patch();
        let first = render_patch(&patch, 84);
        let second = render_patch(&patch, 84);
        assert_eq!(first, second);
        assert!(
            first
                .iter()
                .all(|frame| frame.left.is_finite() && frame.right.is_finite())
        );
        assert!(
            first
                .iter()
                .all(|frame| frame.left.abs() <= 1.0 && frame.right.abs() <= 1.0)
        );

        let mut primary_only = patch.clone();
        primary_only.oscillator.secondary.level = 0.0;
        assert_ne!(first, render_patch(&primary_only, 84));
    }
}
