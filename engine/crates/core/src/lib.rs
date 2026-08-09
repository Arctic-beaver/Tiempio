mod engine;
mod scheduler;
mod tempo;

use std::collections::BTreeSet;

pub use engine::{
    EngineControlError, EngineHealthSnapshot, EngineKernel, PlanAcknowledgement, TransportState,
    VoiceBank, VoiceIdentity, VoiceStart,
};
pub use scheduler::{
    MAX_ACTIONS_PER_BLOCK, MAX_PREPARED_ACTIONS, PreparedAction, PreparedActionKind, PreparedPlan,
    PreparedPlanError,
};
pub use tempo::{TempoError, TempoSegment, TempoTimeline};

pub const RENDER_PLAN_VERSION: u32 = 1;
pub const PATCH_MODEL_VERSION: u32 = 1;
pub const TICKS_PER_QUARTER: u32 = 960;
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
pub const MAX_ENGINE_LAYERS: usize = 32;
pub const MAX_TEMPO_POINTS: usize = 256;
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
pub struct LoopRegion {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BassOscillatorPatchV1 {
    pub detune_cents: f64,
    pub sub_level: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BassFilterPatchV1 {
    pub cutoff_hz: f64,
    pub envelope_amount: f64,
    pub resonance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BassAmplifierPatchV1 {
    pub attack_ms: f64,
    pub decay_ms: f64,
    pub release_ms: f64,
    pub sustain: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BassPatchV1 {
    pub patch_model_version: u32,
    pub oscillator: BassOscillatorPatchV1,
    pub filter: BassFilterPatchV1,
    pub amplifier: BassAmplifierPatchV1,
    pub drive: f64,
    pub stereo_width: f64,
    pub output_gain: f64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MidiNoteEvent {
    pub id: String,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BassLayerPlan {
    pub id: String,
    pub gain: f64,
    pub pan: f64,
    pub patch: BassPatchV1,
    pub events: Vec<MidiNoteEvent>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RenderPlan {
    pub plan_version: u32,
    pub project_id: String,
    pub project_revision: RenderPlanRevision,
    pub ticks_per_quarter: u32,
    pub tempo_map: Vec<TempoPoint>,
    pub loop_region: LoopRegion,
    pub layers: Vec<BassLayerPlan>,
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

fn validate_patch(patch: &BassPatchV1, location: &str) -> Result<(), PlanValidationFailure> {
    if patch.patch_model_version != PATCH_MODEL_VERSION {
        return Err(failure(
            PlanValidationCode::VersionMismatch,
            format!("{location}.patchModelVersion"),
            "Bass patch model version is unsupported.",
        ));
    }
    let values = [
        (
            patch.oscillator.detune_cents,
            -100.0,
            100.0,
            "oscillator.detuneCents",
        ),
        (patch.oscillator.sub_level, 0.0, 1.0, "oscillator.subLevel"),
        (patch.filter.cutoff_hz, 20.0, 24_000.0, "filter.cutoffHz"),
        (patch.filter.resonance, 0.0, 1.0, "filter.resonance"),
        (
            patch.filter.envelope_amount,
            0.0,
            1.0,
            "filter.envelopeAmount",
        ),
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
        (patch.drive, 0.0, 1.0, "drive"),
        (patch.stereo_width, 0.0, 1.0, "stereoWidth"),
        (patch.output_gain, 0.0, 2.0, "outputGain"),
    ];
    for (value, minimum, maximum, field) in values {
        if !finite_range(value, minimum, maximum) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{location}.{field}"),
                "Bass patch value is not finite or is out of range.",
            ));
        }
    }
    Ok(())
}

fn validate_header(plan: &RenderPlan) -> Result<(), PlanValidationFailure> {
    if plan.plan_version != RENDER_PLAN_VERSION {
        return Err(failure(
            PlanValidationCode::VersionMismatch,
            "$.planVersion",
            "Render-plan version is unsupported.",
        ));
    }
    if !plan.project_revision.is_wire_safe() {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.projectRevision",
            "Project revision exceeds the cross-language safe-integer ceiling.",
        ));
    }
    if !valid_id(&plan.project_id) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.projectId",
            "Project ID is invalid.",
        ));
    }
    if plan.ticks_per_quarter != TICKS_PER_QUARTER {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.ticksPerQuarter",
            "The initial engine accepts exactly 960 ticks per quarter.",
        ));
    }
    Ok(())
}

fn validate_tempo_map(tempo_map: &[TempoPoint]) -> Result<(), PlanValidationFailure> {
    if tempo_map.is_empty() || tempo_map.len() > MAX_TEMPO_POINTS {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.tempoMap",
            "Tempo map is empty or exceeds the engine ceiling.",
        ));
    }
    if tempo_map[0].tick != 0 {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.tempoMap[0].tick",
            "Tempo map must begin at tick zero.",
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
                "Tempo points must be ordered, wire-safe and between 20 and 400 BPM.",
            ));
        }
    }
    Ok(())
}

fn validate_loop_region(loop_region: &LoopRegion) -> Result<(), PlanValidationFailure> {
    if loop_region.start_tick > MAX_SAFE_INTEGER
        || loop_region.end_tick > MAX_SAFE_INTEGER
        || loop_region.start_tick >= loop_region.end_tick
    {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            "$.loop",
            "Loop bounds are invalid.",
        ));
    }
    Ok(())
}

fn validate_events(
    events: &[MidiNoteEvent],
    layer_location: &str,
    ids: &mut BTreeSet<String>,
) -> Result<(), PlanValidationFailure> {
    let mut previous: Option<&MidiNoteEvent> = None;
    for (event_index, event) in events.iter().enumerate() {
        let event_location = format!("{layer_location}.events[{event_index}]");
        if !valid_id(&event.id) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{event_location}.id"),
                "Note ID is invalid.",
            ));
        }
        if !ids.insert(event.id.clone()) {
            return Err(failure(
                PlanValidationCode::DuplicateId,
                format!("{event_location}.id"),
                "Note ID is duplicated.",
            ));
        }
        if event.duration_ticks == 0
            || event.start_tick > MAX_SAFE_INTEGER
            || event.duration_ticks > MAX_SAFE_INTEGER
            || event
                .start_tick
                .checked_add(event.duration_ticks)
                .is_none_or(|end| end > MAX_SAFE_INTEGER)
            || event.velocity == 0
            || event.velocity > 127
            || event.pitch > 127
        {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                event_location,
                "Note timing, pitch or velocity is invalid.",
            ));
        }
        if previous.is_some_and(|candidate| {
            (candidate.start_tick, candidate.id.as_str()) > (event.start_tick, event.id.as_str())
        }) {
            return Err(failure(
                PlanValidationCode::InvalidValue,
                format!("{layer_location}.events"),
                "Layer events are not in stable tick/ID order.",
            ));
        }
        previous = Some(event);
    }
    Ok(())
}

fn validate_layer(
    layer: &BassLayerPlan,
    layer_index: usize,
    ids: &mut BTreeSet<String>,
    event_count: &mut usize,
) -> Result<(), PlanValidationFailure> {
    let location = format!("$.layers[{layer_index}]");
    if !valid_id(&layer.id) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            format!("{location}.id"),
            "Layer ID is invalid.",
        ));
    }
    if !ids.insert(layer.id.clone()) {
        return Err(failure(
            PlanValidationCode::DuplicateId,
            format!("{location}.id"),
            "Layer ID is duplicated.",
        ));
    }
    if !finite_range(layer.gain, 0.0, 2.0) || !finite_range(layer.pan, -1.0, 1.0) {
        return Err(failure(
            PlanValidationCode::InvalidValue,
            location.clone(),
            "Layer gain or pan is invalid.",
        ));
    }
    validate_patch(&layer.patch, &format!("{location}.source.patch"))?;
    *event_count = event_count.checked_add(layer.events.len()).ok_or_else(|| {
        failure(
            PlanValidationCode::LimitExceeded,
            format!("{location}.events"),
            "Event count overflowed.",
        )
    })?;
    if *event_count > MAX_MUSICAL_EVENTS {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.layers[*].events",
            "Render plan exceeds the musical-event ceiling.",
        ));
    }
    validate_events(&layer.events, &location, ids)
}

fn validate_layers(layers: &[BassLayerPlan]) -> Result<(), PlanValidationFailure> {
    if layers.len() > MAX_ENGINE_LAYERS {
        return Err(failure(
            PlanValidationCode::LimitExceeded,
            "$.layers",
            "Render plan exceeds the engine layer ceiling.",
        ));
    }

    let mut ids = BTreeSet::<String>::new();
    let mut event_count = 0_usize;
    for (layer_index, layer) in layers.iter().enumerate() {
        validate_layer(layer, layer_index, &mut ids, &mut event_count)?;
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
    validate_loop_region(&plan.loop_region)?;
    validate_layers(&plan.layers)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_patch() -> BassPatchV1 {
        BassPatchV1 {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: BassOscillatorPatchV1 {
                detune_cents: -3.36,
                sub_level: 0.7624,
            },
            filter: BassFilterPatchV1 {
                cutoff_hz: 342.72,
                envelope_amount: 0.426,
                resonance: 0.3396,
            },
            amplifier: BassAmplifierPatchV1 {
                attack_ms: 25.08,
                decay_ms: 307.0,
                sustain: 0.716,
                release_ms: 395.0,
            },
            drive: 0.0864,
            stereo_width: 0.028,
            output_gain: 0.7056,
        }
    }

    pub(crate) fn valid_plan() -> RenderPlan {
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.fixture".to_owned(),
            project_revision: RenderPlanRevision::new(7),
            ticks_per_quarter: TICKS_PER_QUARTER,
            tempo_map: vec![TempoPoint {
                tick: 0,
                micro_bpm: 108_000_000,
            }],
            loop_region: LoopRegion {
                enabled: true,
                start_tick: 0,
                end_tick: 3_840,
            },
            layers: vec![BassLayerPlan {
                id: "layer.bass".to_owned(),
                gain: 1.0,
                pan: 0.0,
                patch: valid_patch(),
                events: vec![MidiNoteEvent {
                    id: "note.one".to_owned(),
                    start_tick: 0,
                    duration_ticks: 960,
                    pitch: 36,
                    velocity: 100,
                }],
            }],
        }
    }

    #[test]
    fn accepts_a_bounded_bass_plan() {
        assert_eq!(validate_render_plan(&valid_plan()), Ok(()));
    }

    #[test]
    fn rejects_duplicate_ids_and_non_finite_patch_values() {
        let mut duplicate = valid_plan();
        duplicate.layers[0].events[0].id = duplicate.layers[0].id.clone();
        assert_eq!(
            validate_render_plan(&duplicate).unwrap_err().code,
            PlanValidationCode::DuplicateId
        );

        let mut invalid_patch = valid_plan();
        invalid_patch.layers[0].patch.filter.cutoff_hz = f64::NAN;
        assert_eq!(
            validate_render_plan(&invalid_patch).unwrap_err().code,
            PlanValidationCode::InvalidValue
        );
    }

    #[test]
    fn rejects_an_unsafe_revision_and_unsorted_events() {
        let mut unsafe_revision = valid_plan();
        unsafe_revision.project_revision = RenderPlanRevision::new(MAX_SAFE_INTEGER + 1);
        assert!(validate_render_plan(&unsafe_revision).is_err());

        let mut unsorted = valid_plan();
        unsorted.layers[0].events.push(MidiNoteEvent {
            id: "note.earlier".to_owned(),
            start_tick: 0,
            duration_ticks: 960,
            pitch: 40,
            velocity: 100,
        });
        assert!(validate_render_plan(&unsorted).is_err());
    }
}
