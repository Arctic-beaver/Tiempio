mod engine;
mod scheduler;
mod tempo;

use std::collections::BTreeSet;

pub use engine::{
    CompositeVoiceBank, DrumVoiceBank, DrumVoiceStart, EngineControlError, EngineHealthSnapshot,
    EngineKernel, PlanAcknowledgement, SynthVoiceBank, TransportState, VoiceBank, VoiceIdentity,
    VoiceStart,
};
pub use scheduler::{
    MAX_ACTIONS_PER_BLOCK, MAX_PREPARED_ACTIONS, MAX_PREPARED_BEATS, PreparedAction,
    PreparedActionKind, PreparedBeat, PreparedPlan, PreparedPlanError,
};
pub use tempo::{TempoError, TempoSegment, TempoTimeline};

pub const RENDER_PLAN_VERSION: u32 = 6;
pub const PATCH_MODEL_VERSION: u32 = 4;
pub const TICKS_PER_QUARTER: u32 = 960;
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
pub const MAX_ENGINE_LAYERS: usize = 32;
pub const MAX_SONG_INSTANCES: usize = 4_096;
pub const MAX_TEMPO_POINTS: usize = 256;
pub const MAX_METER_POINTS: usize = 256;
pub const MAX_MUSICAL_EVENTS: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct RenderPlanRevision(u64);

impl RenderPlanRevision {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> u64 {
        self.0
    }

    #[must_use]
    pub const fn is_wire_safe(self) -> bool {
        self.0 <= MAX_SAFE_INTEGER
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TempoPoint {
    pub tick: u64,
    pub micro_bpm: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeterPoint {
    pub tick: u64,
    pub numerator: u8,
    pub denominator: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoopRegion {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SynthWaveform {
    Saw,
    Square,
    Triangle,
    Sine,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthOscillatorPatch {
    pub waveform: SynthWaveform,
    pub detune_cents: f64,
    pub sub_level: f64,
    pub noise_level: f64,
    pub pulse_width: f64,
    pub secondary: SynthSecondaryOscillatorPatch,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthSecondaryOscillatorPatch {
    pub waveform: SynthWaveform,
    pub semitone_offset: i32,
    pub detune_cents: f64,
    pub level: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthFilterPatch {
    pub cutoff_hz: f64,
    pub envelope_amount: f64,
    pub key_tracking: f64,
    pub resonance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthAmplifierPatch {
    pub attack_ms: f64,
    pub decay_ms: f64,
    pub release_ms: f64,
    pub sustain: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthMovementPatch {
    pub rate_hz: f64,
    pub depth: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthExpressionPatch {
    pub amplitude_amount: f64,
    pub attack_scale: f64,
    pub filter_octaves: f64,
    pub velocity_curve: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SynthPatch {
    pub patch_model_version: u32,
    pub oscillator: SynthOscillatorPatch,
    pub filter: SynthFilterPatch,
    pub amplifier: SynthAmplifierPatch,
    pub movement: SynthMovementPatch,
    pub expression: SynthExpressionPatch,
    pub drive: f64,
    pub stereo_width: f64,
    pub output_gain: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DrumInstrument {
    Kick,
    Clap,
    ClosedHat,
    OpenHat,
    Perc,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DrumAlgorithm {
    Kick,
    Clap,
    ClosedHat,
    OpenHat,
    Perc,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DrumVoicePatch {
    pub algorithm: DrumAlgorithm,
    pub pitch_hz: f64,
    pub tone: f64,
    pub decay_ms: f64,
    pub noise: f64,
    pub drive: f64,
    pub gain: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DrumKitPatch {
    pub patch_model_version: u32,
    pub kick: DrumVoicePatch,
    pub clap: DrumVoicePatch,
    pub closed_hat: DrumVoicePatch,
    pub open_hat: DrumVoicePatch,
    pub perc: DrumVoicePatch,
}

impl DrumKitPatch {
    #[must_use]
    pub const fn voice(&self, instrument: DrumInstrument) -> &DrumVoicePatch {
        match instrument {
            DrumInstrument::Kick => &self.kick,
            DrumInstrument::Clap => &self.clap,
            DrumInstrument::ClosedHat => &self.closed_hat,
            DrumInstrument::OpenHat => &self.open_hat,
            DrumInstrument::Perc => &self.perc,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MidiNoteEvent {
    pub id: String,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DrumHitEvent {
    pub id: String,
    pub start_tick: u64,
    pub swing_ticks: u64,
    pub instrument: DrumInstrument,
    pub velocity: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub enum LayerSource {
    Synth {
        patch: SynthPatch,
        events: Vec<MidiNoteEvent>,
    },
    Drums {
        patch: DrumKitPatch,
        events: Vec<DrumHitEvent>,
    },
}

impl LayerSource {
    #[must_use]
    pub fn event_count(&self) -> usize {
        match self {
            Self::Synth { events, .. } => events.len(),
            Self::Drums { events, .. } => events.len(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct InstrumentLayerPlan {
    pub id: String,
    pub gain: f64,
    pub pan: f64,
    pub song_enabled: bool,
    pub cycle_ticks: u64,
    pub source: LayerSource,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SongInstancePlan {
    pub id: String,
    pub source_layer_id: String,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub source_offset_ticks: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderPlan {
    pub plan_version: u32,
    pub project_id: String,
    pub project_revision: RenderPlanRevision,
    pub ticks_per_quarter: u32,
    pub end_tick: u64,
    pub tempo_map: Vec<TempoPoint>,
    pub meter_map: Vec<MeterPoint>,
    pub loop_region: LoopRegion,
    pub layers: Vec<InstrumentLayerPlan>,
    pub instances: Vec<SongInstancePlan>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlanValidationCode {
    DuplicateId,
    InvalidValue,
    LimitExceeded,
    VersionMismatch,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlanValidationFailure {
    pub code: PlanValidationCode,
    pub path: String,
    pub message: String,
}

fn failure(
    code: PlanValidationCode,
    path: impl Into<String>,
    message: impl Into<String>,
) -> PlanValidationFailure {
    PlanValidationFailure {
        code,
        path: path.into(),
        message: message.into(),
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'.' | b'_' | b':' | b'-'))
        })
}

fn finite_range(value: f64, minimum: f64, maximum: f64) -> bool {
    value.is_finite() && value >= minimum && value <= maximum
}

fn validate_secondary_oscillator(
    oscillator: &SynthSecondaryOscillatorPatch,
    location: &str,
) -> Result<(), PlanValidationFailure> {
    if !(-24..=24).contains(&oscillator.semitone_offset) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            format!("{location}.semitoneOffset"),
            "Secondary oscillator semitone offset must be between -24 and 24.",
        ));
    }
    if !finite_range(oscillator.detune_cents, -100.0, 100.0)
        || !finite_range(oscillator.level, 0.0, 1.0)
    {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            location,
            "Secondary oscillator value is not finite or is out of range.",
        ));
    }
    Ok(())
}

fn validate_synth_patch(patch: &SynthPatch, location: &str) -> Result<(), PlanValidationFailure> {
    if patch.patch_model_version != PATCH_MODEL_VERSION {
        return Err(failure(
            PlanValidationCode::VersionMismatch,
            format!("{location}.patchModelVersion"),
            "Synth patch model version is unsupported.",
        ));
    }
    validate_secondary_oscillator(
        &patch.oscillator.secondary,
        &format!("{location}.oscillator.secondary"),
    )?;
    let values = [
        (
            patch.oscillator.detune_cents,
            -100.0,
            100.0,
            "oscillator.detuneCents",
        ),
        (patch.oscillator.sub_level, 0.0, 1.0, "oscillator.subLevel"),
        (
            patch.oscillator.noise_level,
            0.0,
            1.0,
            "oscillator.noiseLevel",
        ),
        (
            patch.oscillator.pulse_width,
            0.05,
            0.95,
            "oscillator.pulseWidth",
        ),
        (patch.filter.cutoff_hz, 20.0, 24_000.0, "filter.cutoffHz"),
        (patch.filter.resonance, 0.0, 1.0, "filter.resonance"),
        (
            patch.filter.envelope_amount,
            -1.0,
            1.0,
            "filter.envelopeAmount",
        ),
        (patch.filter.key_tracking, 0.0, 1.5, "filter.keyTracking"),
        (
            patch.amplifier.attack_ms,
            0.0,
            60_000.0,
            "amplifier.attackMs",
        ),
        (patch.amplifier.decay_ms, 0.0, 60_000.0, "amplifier.decayMs"),
        (patch.amplifier.sustain, 0.0, 1.0, "amplifier.sustain"),
        (
            patch.amplifier.release_ms,
            0.0,
            60_000.0,
            "amplifier.releaseMs",
        ),
        (patch.movement.rate_hz, 0.0, 20.0, "movement.rateHz"),
        (patch.movement.depth, 0.0, 1.0, "movement.depth"),
        (
            patch.expression.amplitude_amount,
            0.0,
            1.0,
            "expression.amplitudeAmount",
        ),
        (
            patch.expression.attack_scale,
            0.0,
            2.0,
            "expression.attackScale",
        ),
        (
            patch.expression.filter_octaves,
            0.0,
            4.0,
            "expression.filterOctaves",
        ),
        (
            patch.expression.velocity_curve,
            0.25,
            4.0,
            "expression.velocityCurve",
        ),
        (patch.drive, 0.0, 1.0, "drive"),
        (patch.stereo_width, 0.0, 1.0, "stereoWidth"),
        (patch.output_gain, 0.0, 2.0, "outputGain"),
    ];
    for (value, minimum, maximum, field) in values {
        if !finite_range(value, minimum, maximum) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{location}.{field}"),
                "Synth patch value is not finite or is out of range.",
            ));
        }
    }
    Ok(())
}

fn validate_drum_voice(
    voice: &DrumVoicePatch,
    algorithm: DrumAlgorithm,
    location: &str,
) -> Result<(), PlanValidationFailure> {
    if voice.algorithm != algorithm
        || !finite_range(voice.pitch_hz, 20.0, 20_000.0)
        || !finite_range(voice.tone, 0.0, 1.0)
        || !finite_range(voice.decay_ms, 1.0, 10_000.0)
        || !finite_range(voice.noise, 0.0, 1.0)
        || !finite_range(voice.drive, 0.0, 1.0)
        || !finite_range(voice.gain, 0.0, 2.0)
    {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            location,
            "Drum voice algorithm or patch value is invalid.",
        ));
    }
    Ok(())
}

fn validate_drum_patch(patch: &DrumKitPatch, location: &str) -> Result<(), PlanValidationFailure> {
    if patch.patch_model_version != PATCH_MODEL_VERSION {
        return Err(failure(
            PlanValidationCode::VersionMismatch,
            format!("{location}.patchModelVersion"),
            "Drum patch model version is unsupported.",
        ));
    }
    validate_drum_voice(
        &patch.kick,
        DrumAlgorithm::Kick,
        &format!("{location}.voices.kick"),
    )?;
    validate_drum_voice(
        &patch.clap,
        DrumAlgorithm::Clap,
        &format!("{location}.voices.clap"),
    )?;
    validate_drum_voice(
        &patch.closed_hat,
        DrumAlgorithm::ClosedHat,
        &format!("{location}.voices.closedHat"),
    )?;
    validate_drum_voice(
        &patch.open_hat,
        DrumAlgorithm::OpenHat,
        &format!("{location}.voices.openHat"),
    )?;
    validate_drum_voice(
        &patch.perc,
        DrumAlgorithm::Perc,
        &format!("{location}.voices.perc"),
    )
}

fn validate_header(plan: &RenderPlan) -> Result<(), PlanValidationFailure> {
    if plan.plan_version != RENDER_PLAN_VERSION {
        return Err(failure(
            PlanValidationCode::VersionMismatch,
            "$.planVersion",
            "Render-plan version is unsupported.",
        ));
    }
    if !plan.project_revision.is_wire_safe() || !valid_id(&plan.project_id) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.projectRevision",
            "Project identity or revision is invalid.",
        ));
    }
    if plan.ticks_per_quarter != TICKS_PER_QUARTER
        || plan.end_tick == 0
        || plan.end_tick > MAX_SAFE_INTEGER
    {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.ticksPerQuarter",
            "Project timing header is invalid.",
        ));
    }
    Ok(())
}

fn validate_tempo_map(tempo_map: &[TempoPoint]) -> Result<(), PlanValidationFailure> {
    if tempo_map.is_empty() || tempo_map.len() > MAX_TEMPO_POINTS || tempo_map[0].tick != 0 {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.tempoMap",
            "Tempo map is empty, unanchored or exceeds the engine ceiling.",
        ));
    }
    for (index, point) in tempo_map.iter().enumerate() {
        if point.tick > MAX_SAFE_INTEGER
            || !(20_000_000..=400_000_000).contains(&point.micro_bpm)
            || (index > 0 && tempo_map[index - 1].tick >= point.tick)
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("$.tempoMap[{index}]"),
                "Tempo points are invalid or unordered.",
            ));
        }
    }
    Ok(())
}

fn validate_meter_map(
    meter_map: &[MeterPoint],
    end_tick: u64,
) -> Result<(), PlanValidationFailure> {
    if meter_map.is_empty() || meter_map.len() > MAX_METER_POINTS || meter_map[0].tick != 0 {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.meterMap",
            "Meter map is empty, unanchored or exceeds the engine ceiling.",
        ));
    }
    let mut prepared_beat_count = 0_usize;
    for (index, point) in meter_map.iter().enumerate() {
        if point.tick >= end_tick
            || !(1..=32).contains(&point.numerator)
            || !matches!(point.denominator, 1 | 2 | 4 | 8 | 16)
            || (index > 0 && meter_map[index - 1].tick >= point.tick)
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("$.meterMap[{index}]"),
                "Meter points are invalid or unordered.",
            ));
        }
        let segment_end = meter_map.get(index + 1).map_or(end_tick, |next| next.tick);
        let ticks_per_beat = u64::from(TICKS_PER_QUARTER) * 4 / u64::from(point.denominator);
        prepared_beat_count = prepared_beat_count
            .checked_add(
                usize::try_from((segment_end - point.tick).div_ceil(ticks_per_beat))
                    .unwrap_or(usize::MAX),
            )
            .ok_or_else(|| {
                failure(
                    PlanValidationCode::LimitExceeded,
                    "$.meterMap",
                    "Prepared beat count overflowed.",
                )
            })?;
        if prepared_beat_count > MAX_PREPARED_BEATS {
            return Err(failure(
                PlanValidationCode::LimitExceeded,
                "$.meterMap",
                "Render plan exceeds the prepared-beat ceiling.",
            ));
        }
    }
    Ok(())
}

fn validate_loop_region(
    loop_region: &LoopRegion,
    end_tick: u64,
) -> Result<(), PlanValidationFailure> {
    if loop_region.start_tick > MAX_SAFE_INTEGER
        || loop_region.end_tick > MAX_SAFE_INTEGER
        || loop_region.start_tick >= loop_region.end_tick
        || loop_region.end_tick > end_tick
    {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.loop",
            "Loop bounds are invalid.",
        ));
    }
    Ok(())
}

fn remember_event_id(
    id: &str,
    location: &str,
    ids: &mut BTreeSet<String>,
) -> Result<(), PlanValidationFailure> {
    if !valid_id(id) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            location,
            "Event ID is invalid.",
        ));
    }
    if !ids.insert(id.to_owned()) {
        return Err(failure(
            PlanValidationCode::DuplicateId,
            location,
            "Event ID is duplicated.",
        ));
    }
    Ok(())
}

fn validate_midi_events(
    events: &[MidiNoteEvent],
    cycle_ticks: u64,
    location: &str,
    ids: &mut BTreeSet<String>,
) -> Result<(), PlanValidationFailure> {
    let mut previous: Option<&MidiNoteEvent> = None;
    for (index, event) in events.iter().enumerate() {
        let event_location = format!("{location}.events[{index}]");
        remember_event_id(&event.id, &format!("{event_location}.id"), ids)?;
        if event.duration_ticks == 0
            || event
                .start_tick
                .checked_add(event.duration_ticks)
                .is_none_or(|end| end > cycle_ticks)
            || event.velocity == 0
            || event.velocity > 127
            || event.pitch > 127
            || previous.is_some_and(|candidate| {
                (candidate.start_tick, candidate.id.as_str())
                    > (event.start_tick, event.id.as_str())
            })
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                event_location,
                "MIDI event is invalid or unordered.",
            ));
        }
        previous = Some(event);
    }
    Ok(())
}

fn validate_drum_events(
    events: &[DrumHitEvent],
    cycle_ticks: u64,
    location: &str,
    ids: &mut BTreeSet<String>,
) -> Result<(), PlanValidationFailure> {
    let mut previous: Option<&DrumHitEvent> = None;
    for (index, event) in events.iter().enumerate() {
        let event_location = format!("{location}.events[{index}]");
        remember_event_id(&event.id, &format!("{event_location}.id"), ids)?;
        if event.start_tick > MAX_SAFE_INTEGER
            || event.swing_ticks > u64::from(TICKS_PER_QUARTER / 4)
            || event
                .start_tick
                .checked_add(event.swing_ticks)
                .is_none_or(|tick| tick >= cycle_ticks)
            || event.velocity == 0
            || event.velocity > 127
            || previous.is_some_and(|candidate| {
                (candidate.start_tick, candidate.id.as_str())
                    > (event.start_tick, event.id.as_str())
            })
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                event_location,
                "Drum event is invalid or unordered.",
            ));
        }
        previous = Some(event);
    }
    Ok(())
}

fn validate_layers(
    layers: &[InstrumentLayerPlan],
) -> Result<(BTreeSet<String>, BTreeSet<String>), PlanValidationFailure> {
    if layers.len() > MAX_ENGINE_LAYERS {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.layers",
            "Render plan exceeds the engine layer ceiling.",
        ));
    }
    let mut ids = BTreeSet::<String>::new();
    let mut layer_ids = BTreeSet::<String>::new();
    let mut event_count = 0_usize;
    for (index, layer) in layers.iter().enumerate() {
        let location = format!("$.layers[{index}]");
        if !valid_id(&layer.id) || !ids.insert(layer.id.clone()) {
            return Err(failure(
                PlanValidationCode::DuplicateId,
                format!("{location}.id"),
                "Layer ID is invalid or duplicated.",
            ));
        }
        layer_ids.insert(layer.id.clone());
        if !finite_range(layer.gain, 0.0, 2.0) || !finite_range(layer.pan, -1.0, 1.0) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                &location,
                "Layer gain or pan is invalid.",
            ));
        }
        if layer.cycle_ticks == 0 || layer.cycle_ticks > MAX_SAFE_INTEGER {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{location}.cycleTicks"),
                "Layer cycle must be a positive wire-safe tick count.",
            ));
        }
        event_count = event_count
            .checked_add(layer.source.event_count())
            .ok_or_else(|| {
                failure(
                    PlanValidationCode::LimitExceeded,
                    &location,
                    "Event count overflowed.",
                )
            })?;
        if event_count > MAX_MUSICAL_EVENTS {
            return Err(failure(
                PlanValidationCode::LimitExceeded,
                "$.layers[*].events",
                "Render plan exceeds the musical-event ceiling.",
            ));
        }
        match &layer.source {
            LayerSource::Synth { patch, events } => {
                validate_synth_patch(patch, &format!("{location}.source.patch"))?;
                validate_midi_events(events, layer.cycle_ticks, &location, &mut ids)?;
            }
            LayerSource::Drums { patch, events } => {
                validate_drum_patch(patch, &format!("{location}.source.patch"))?;
                validate_drum_events(events, layer.cycle_ticks, &location, &mut ids)?;
            }
        }
    }
    Ok((ids, layer_ids))
}

fn validate_instances(
    instances: &[SongInstancePlan],
    end_tick: u64,
    layer_ids: &BTreeSet<String>,
    ids: &mut BTreeSet<String>,
) -> Result<(), PlanValidationFailure> {
    if instances.len() > MAX_SONG_INSTANCES {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.instances",
            "Render plan exceeds the song-instance ceiling.",
        ));
    }
    let mut previous: Option<&SongInstancePlan> = None;
    for (index, instance) in instances.iter().enumerate() {
        let location = format!("$.instances[{index}]");
        if !valid_id(&instance.id) || !ids.insert(instance.id.clone()) {
            return Err(failure(
                PlanValidationCode::DuplicateId,
                format!("{location}.id"),
                "Song-instance ID is invalid or duplicated.",
            ));
        }
        if !layer_ids.contains(&instance.source_layer_id) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{location}.sourceLayerId"),
                "Song instance references an unknown source layer.",
            ));
        }
        if instance.duration_ticks == 0
            || instance.source_offset_ticks > MAX_SAFE_INTEGER
            || instance
                .start_tick
                .checked_add(instance.duration_ticks)
                .is_none_or(|tick| tick > end_tick)
            || previous.is_some_and(|candidate| {
                (candidate.start_tick, candidate.id.as_str())
                    > (instance.start_tick, instance.id.as_str())
            })
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                location,
                "Song instance is invalid or unordered.",
            ));
        }
        previous = Some(instance);
    }
    Ok(())
}

/// Validates a render plan before it can enter prepared engine state.
///
/// # Errors
///
/// Returns the first stable path and validation code for an unsupported version,
/// invalid value, duplicate identifier or exceeded engine ceiling.
pub fn validate_render_plan(plan: &RenderPlan) -> Result<(), PlanValidationFailure> {
    validate_header(plan)?;
    validate_tempo_map(&plan.tempo_map)?;
    validate_meter_map(&plan.meter_map, plan.end_tick)?;
    validate_loop_region(&plan.loop_region, plan.end_tick)?;
    let (mut ids, layer_ids) = validate_layers(&plan.layers)?;
    validate_instances(&plan.instances, plan.end_tick, &layer_ids, &mut ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn valid_synth_patch() -> SynthPatch {
        SynthPatch {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: SynthOscillatorPatch {
                waveform: SynthWaveform::Saw,
                detune_cents: -3.36,
                sub_level: 0.7624,
                noise_level: 0.02,
                pulse_width: 0.5,
                secondary: SynthSecondaryOscillatorPatch {
                    waveform: SynthWaveform::Sine,
                    semitone_offset: 12,
                    detune_cents: 4.0,
                    level: 0.16,
                },
            },
            filter: SynthFilterPatch {
                cutoff_hz: 342.72,
                envelope_amount: 0.426,
                key_tracking: 0.45,
                resonance: 0.3396,
            },
            amplifier: SynthAmplifierPatch {
                attack_ms: 25.08,
                decay_ms: 307.0,
                sustain: 0.716,
                release_ms: 395.0,
            },
            movement: SynthMovementPatch {
                rate_hz: 0.2,
                depth: 0.1,
            },
            expression: SynthExpressionPatch {
                amplitude_amount: 0.9,
                attack_scale: 0.45,
                filter_octaves: 1.5,
                velocity_curve: 0.8,
            },
            drive: 0.0864,
            stereo_width: 0.028,
            output_gain: 0.7056,
        }
    }

    pub(crate) fn valid_drum_patch() -> DrumKitPatch {
        let voice = |algorithm, pitch_hz, decay_ms, noise| DrumVoicePatch {
            algorithm,
            pitch_hz,
            tone: 0.5,
            decay_ms,
            noise,
            drive: 0.1,
            gain: 0.75,
        };
        DrumKitPatch {
            patch_model_version: PATCH_MODEL_VERSION,
            kick: voice(DrumAlgorithm::Kick, 52.0, 280.0, 0.05),
            clap: voice(DrumAlgorithm::Clap, 1_200.0, 180.0, 0.9),
            closed_hat: voice(DrumAlgorithm::ClosedHat, 7_200.0, 72.0, 1.0),
            open_hat: voice(DrumAlgorithm::OpenHat, 6_800.0, 420.0, 1.0),
            perc: voice(DrumAlgorithm::Perc, 320.0, 210.0, 0.2),
        }
    }

    pub(crate) fn valid_plan() -> RenderPlan {
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.fixture".to_owned(),
            project_revision: RenderPlanRevision::new(7),
            ticks_per_quarter: TICKS_PER_QUARTER,
            end_tick: 3_840,
            tempo_map: vec![TempoPoint {
                tick: 0,
                micro_bpm: 108_000_000,
            }],
            meter_map: vec![MeterPoint {
                tick: 0,
                numerator: 4,
                denominator: 4,
            }],
            loop_region: LoopRegion {
                enabled: true,
                start_tick: 0,
                end_tick: 3_840,
            },
            layers: vec![InstrumentLayerPlan {
                id: "layer.synth".to_owned(),
                gain: 1.0,
                pan: 0.0,
                song_enabled: true,
                cycle_ticks: 3_840,
                source: LayerSource::Synth {
                    patch: valid_synth_patch(),
                    events: vec![MidiNoteEvent {
                        id: "note.one".to_owned(),
                        start_tick: 0,
                        duration_ticks: 960,
                        pitch: 36,
                        velocity: 100,
                    }],
                },
            }],
            instances: vec![SongInstancePlan {
                id: "instance.synth".to_owned(),
                source_layer_id: "layer.synth".to_owned(),
                start_tick: 0,
                duration_ticks: 3_840,
                source_offset_ticks: 0,
            }],
        }
    }

    #[test]
    fn accepts_a_bounded_synth_plan() {
        assert_eq!(validate_render_plan(&valid_plan()), Ok(()));
    }

    #[test]
    fn rejects_duplicate_ids_and_non_finite_patch_values() {
        let mut duplicate = valid_plan();
        let layer_id = duplicate.layers[0].id.clone();
        if let LayerSource::Synth { events, .. } = &mut duplicate.layers[0].source {
            events[0].id = layer_id;
        }
        assert_eq!(
            validate_render_plan(&duplicate).unwrap_err().code,
            PlanValidationCode::DuplicateId
        );

        let mut invalid_patch = valid_plan();
        if let LayerSource::Synth { patch, .. } = &mut invalid_patch.layers[0].source {
            patch.filter.cutoff_hz = f64::NAN;
        }
        assert_eq!(
            validate_render_plan(&invalid_patch).unwrap_err().code,
            PlanValidationCode::InvalidValue
        );
    }
}
