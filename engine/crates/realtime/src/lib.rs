use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
#[cfg(not(target_family = "wasm"))]
use std::time::Instant;

use rtrb::{Consumer, PopError, Producer, PushError};
use tiempio_engine_core::{
    CompositeVoiceBank, DrumInstrument, DrumKitPatch, DrumVoicePatch, EngineControlError,
    EngineKernel, LayerSource, MAX_SAFE_INTEGER, PreparedPlan, RenderPlan, SynthPatch,
    TempoTimeline, TransportState,
};
use tiempio_engine_drums::DrumVoicePool;
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_protocol::{
    ENGINE_PROTOCOL_MAX_BLOCK_FRAMES, ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES,
    ENGINE_PROTOCOL_MAX_PREPARED_ACTIONS, ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE,
    ENGINE_PROTOCOL_MAX_RECORDING_COUNT_IN_BEATS, ENGINE_PROTOCOL_MAX_RECORDING_HELD_INPUTS,
    EngineEvent, PreviewProgramPayload, StartBrickPreviewPayload, StartRecordingPayload,
};
use tiempio_engine_synth::SynthVoicePool;

pub type RealtimeVoiceBank = CompositeVoiceBank<SynthVoicePool, DrumVoicePool>;

pub const CONTROL_QUEUE_CAPACITY: usize = 128;
pub const EVENT_QUEUE_CAPACITY: usize = 256;
const MAX_COMMANDS_PER_BLOCK: usize = 64;
const SNAPSHOTS_PER_SECOND: u64 = 30;
const PENDING_CRITICAL_EVENT_CAPACITY: usize = ENGINE_PROTOCOL_MAX_RECORDING_HELD_INPUTS * 2 + 8;
const PREVIEW_IDENTITY_FLAG: u64 = 1_u64 << 63;
const PREVIEW_HASH_MASK: u64 = (1_u64 << 54) - 1;
const BRICK_PREVIEW_IDENTITY_PREFIX: u64 = 3_u64 << 62;

#[derive(Clone, Debug)]
pub enum AuditionPatch {
    Synth(SynthPatch),
    Drums(DrumKitPatch),
}

#[must_use]
pub fn synth_patch_for_layer(plan: &RenderPlan, layer_id: &str) -> Option<SynthPatch> {
    match audition_patch_for_layer(plan, layer_id) {
        Some(AuditionPatch::Synth(patch)) => Some(patch),
        Some(AuditionPatch::Drums(_)) | None => None,
    }
}

#[must_use]
pub fn audition_patch_for_layer(plan: &RenderPlan, layer_id: &str) -> Option<AuditionPatch> {
    plan.layers
        .iter()
        .find(|layer| layer.id == layer_id)
        .map(|layer| match &layer.source {
            LayerSource::Synth { patch, .. } => AuditionPatch::Synth(patch.clone()),
            LayerSource::Drums { patch, .. } => AuditionPatch::Drums(patch.clone()),
        })
}

#[must_use]
pub const fn drum_instrument_for_pitch(pitch: u8) -> DrumInstrument {
    match pitch {
        36 => DrumInstrument::Kick,
        39 => DrumInstrument::Clap,
        42 => DrumInstrument::ClosedHat,
        46 => DrumInstrument::OpenHat,
        _ => DrumInstrument::Perc,
    }
}

#[must_use]
pub fn stable_audition_identifier(value: &str) -> u64 {
    value.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    }) & MAX_SAFE_INTEGER
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreviewId {
    bytes: [u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES],
    len: u16,
}

impl PreviewId {
    #[must_use]
    pub fn new(value: &str) -> Option<Self> {
        let source = value.as_bytes();
        if source.is_empty() || source.len() > ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES {
            return None;
        }
        let mut bytes = [0_u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES];
        bytes[..source.len()].copy_from_slice(source);
        Some(Self {
            bytes,
            len: u16::try_from(source.len()).ok()?,
        })
    }

    #[must_use]
    /// Returns the validated preview identifier.
    ///
    /// # Panics
    ///
    /// Panics only if this type's private UTF-8 construction invariant is broken.
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.bytes[..usize::from(self.len)])
            .expect("PreviewId stores bytes copied from a UTF-8 string")
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RecordingIdentifier {
    bytes: [u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES],
    len: u16,
}

impl RecordingIdentifier {
    #[must_use]
    pub fn new(value: &str) -> Option<Self> {
        let source = value.as_bytes();
        if source.is_empty() || source.len() > ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES {
            return None;
        }
        let mut bytes = [0_u8; ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES];
        bytes[..source.len()].copy_from_slice(source);
        Some(Self {
            bytes,
            len: u16::try_from(source.len()).ok()?,
        })
    }

    #[must_use]
    /// Returns the validated recording identifier.
    ///
    /// # Panics
    ///
    /// Panics only if this type's private UTF-8 construction invariant is broken.
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.bytes[..usize::from(self.len)])
            .expect("RecordingIdentifier stores validated UTF-8")
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecordingStopReason {
    Stopped,
    CountInCanceled,
    Interrupted,
}

impl RecordingStopReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::CountInCanceled => "count-in-canceled",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct PreparedCountInBeat {
    frame_offset: u64,
    downbeat: bool,
}

#[derive(Debug)]
pub struct PreparedRecording {
    id: RecordingIdentifier,
    start_tick: u64,
    anchor_timeline_sample: u64,
    count_in_frames: u64,
    pre_roll_delay_frames: u64,
    pre_roll_start_tick: u64,
    beats: Box<[PreparedCountInBeat]>,
}

impl PreparedRecording {
    #[must_use]
    pub fn prepare(
        payload: &StartRecordingPayload,
        plan: &RenderPlan,
        sample_rate: u32,
    ) -> Option<Self> {
        if plan.project_revision.value() != payload.project_revision {
            return None;
        }
        let id = RecordingIdentifier::new(&payload.recording_id)?;
        let timeline = TempoTimeline::new(plan, sample_rate).ok()?;
        let meter = plan
            .meter_map
            .iter()
            .rev()
            .find(|point| point.tick <= payload.start_tick)?;
        let beat_numerator = u64::from(plan.ticks_per_quarter).checked_mul(4)?;
        let denominator = u64::from(meter.denominator);
        if denominator == 0 || beat_numerator % denominator != 0 {
            return None;
        }
        let ticks_per_beat = beat_numerator / denominator;
        let total_beats =
            usize::from(meter.numerator).checked_mul(usize::from(payload.count_in_bars))?;
        if total_beats > ENGINE_PROTOCOL_MAX_RECORDING_COUNT_IN_BEATS {
            return None;
        }
        let count_in_ticks = ticks_per_beat.checked_mul(u64::try_from(total_beats).ok()?)?;
        let available_ticks = payload.start_tick.min(count_in_ticks);
        let missing_ticks = count_in_ticks.saturating_sub(available_ticks);
        let pre_roll_start_tick = payload.start_tick.saturating_sub(available_ticks);
        let anchor_timeline_sample = timeline.tick_to_sample(payload.start_tick).ok()?;
        let pre_roll_start_sample = timeline.tick_to_sample(pre_roll_start_tick).ok()?;
        let missing_end_sample = timeline
            .tick_to_sample(payload.start_tick.checked_add(missing_ticks)?)
            .ok()?;
        let pre_roll_delay_frames = missing_end_sample.checked_sub(anchor_timeline_sample)?;
        let available_frames = anchor_timeline_sample.checked_sub(pre_roll_start_sample)?;
        let count_in_frames = pre_roll_delay_frames.checked_add(available_frames)?;
        let mut beats = Vec::with_capacity(total_beats);
        for beat_index in 0..total_beats {
            let virtual_offset_ticks =
                ticks_per_beat.checked_mul(u64::try_from(beat_index).ok()?)?;
            let frame_offset = if virtual_offset_ticks <= missing_ticks {
                timeline
                    .tick_to_sample(payload.start_tick.checked_add(virtual_offset_ticks)?)
                    .ok()?
                    .checked_sub(anchor_timeline_sample)?
            } else {
                let actual_tick = pre_roll_start_tick
                    .checked_add(virtual_offset_ticks.checked_sub(missing_ticks)?)?;
                pre_roll_delay_frames.checked_add(
                    timeline
                        .tick_to_sample(actual_tick)
                        .ok()?
                        .checked_sub(pre_roll_start_sample)?,
                )?
            };
            beats.push(PreparedCountInBeat {
                frame_offset,
                downbeat: beat_index % usize::from(meter.numerator) == 0,
            });
        }
        Some(Self {
            id,
            start_tick: payload.start_tick,
            anchor_timeline_sample,
            count_in_frames,
            pre_roll_delay_frames,
            pre_roll_start_tick,
            beats: beats.into_boxed_slice(),
        })
    }
}

#[derive(Clone, Copy, Debug)]
struct PreviewAction {
    sample_offset: u64,
    event_index: u8,
    pitches: [u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE],
    pitch_count: u8,
    velocity: u8,
    active: bool,
}

#[derive(Debug)]
pub struct PreparedPreview {
    id: PreviewId,
    base_identifier: u64,
    duration_frames: u64,
    actions: Box<[PreviewAction]>,
    patch: SynthPatch,
}

impl PreparedPreview {
    #[must_use]
    pub fn prepare(
        program: PreviewProgramPayload,
        sample_rate: u32,
        patch: SynthPatch,
    ) -> Option<Self> {
        let id = PreviewId::new(&program.preview_id)?;
        let base_identifier = stable_preview_hash(&program.preview_id);
        let mut actions = Vec::with_capacity(program.events.len().saturating_mul(2));
        let mut duration_frames = 0_u64;
        for (event_index, event) in program.events.into_iter().enumerate() {
            let start = milliseconds_to_frames(event.offset_ms, sample_rate, false)?;
            let end_ms = event.offset_ms.checked_add(event.duration_ms)?;
            let end = milliseconds_to_frames(end_ms, sample_rate, true)?.max(start + 1);
            duration_frames = duration_frames.max(end);
            let mut pitches = [0_u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE];
            pitches[..event.pitches.len()].copy_from_slice(&event.pitches);
            let event_index = u8::try_from(event_index).ok()?;
            let pitch_count = u8::try_from(event.pitches.len()).ok()?;
            actions.push(PreviewAction {
                sample_offset: start,
                event_index,
                pitches,
                pitch_count,
                velocity: event.velocity,
                active: true,
            });
            actions.push(PreviewAction {
                sample_offset: end,
                event_index,
                pitches,
                pitch_count,
                velocity: event.velocity,
                active: false,
            });
        }
        actions.sort_by_key(|action| (action.sample_offset, action.active));
        Some(Self {
            id,
            base_identifier,
            duration_frames,
            actions: actions.into_boxed_slice(),
            patch,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BrickPreviewActionKind {
    NoteOff,
    DrumHit(DrumInstrument),
    NoteOn,
}

impl BrickPreviewActionKind {
    const fn order(self) -> u8 {
        match self {
            Self::NoteOff => 0,
            Self::DrumHit(_) => 1,
            Self::NoteOn => 2,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct BrickPreviewAction {
    sample_offset: u64,
    event_index: u16,
    kind: BrickPreviewActionKind,
    pitch: u8,
    velocity: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct BrickPreviewVoice {
    start_frame: u64,
    end_frame: u64,
    event_index: u16,
    pitch: u8,
    velocity: u8,
}

#[derive(Debug)]
struct PreparedBrickPreviewSource {
    id: PreviewId,
    source_index: u8,
    cycle_ticks: u64,
    cycle_frames: u64,
    actions: Box<[BrickPreviewAction]>,
    voices: Box<[BrickPreviewVoice]>,
    patch: AuditionPatch,
    enabled: bool,
    running: bool,
    cursor: usize,
    position: u64,
    cycle_iteration: u64,
}

#[derive(Debug)]
pub struct PreparedBrickPreview {
    generation: u64,
    render_plan_revision: u64,
    timeline: TempoTimeline,
    sources: Box<[PreparedBrickPreviewSource]>,
}

fn prepare_brick_preview_source(
    layer: &tiempio_engine_core::InstrumentLayerPlan,
    source_index: usize,
    enabled: bool,
    timeline: &TempoTimeline,
) -> Option<PreparedBrickPreviewSource> {
    let id = PreviewId::new(&layer.id)?;
    let cycle_frames = timeline.tick_to_sample(layer.cycle_ticks).ok()?;
    if cycle_frames == 0 {
        return None;
    }
    let mut actions = Vec::new();
    let mut voices = Vec::new();
    let patch = match &layer.source {
        LayerSource::Synth { patch, events } => {
            actions.reserve(events.len().checked_mul(2)?);
            voices.reserve(events.len());
            for (event_index, event) in events.iter().enumerate() {
                let start_frame = timeline.tick_to_sample(event.start_tick).ok()?;
                let end_frame = timeline
                    .tick_to_sample(event.start_tick.checked_add(event.duration_ticks)?)
                    .ok()?;
                let event_index = u16::try_from(event_index).ok()?;
                voices.push(BrickPreviewVoice {
                    start_frame,
                    end_frame,
                    event_index,
                    pitch: event.pitch,
                    velocity: event.velocity,
                });
                for (sample_offset, kind) in [
                    (start_frame, BrickPreviewActionKind::NoteOn),
                    (end_frame, BrickPreviewActionKind::NoteOff),
                ] {
                    actions.push(BrickPreviewAction {
                        sample_offset,
                        event_index,
                        kind,
                        pitch: event.pitch,
                        velocity: event.velocity,
                    });
                }
            }
            AuditionPatch::Synth(patch.clone())
        }
        LayerSource::Drums { patch, events } => {
            actions.reserve(events.len());
            for (event_index, event) in events.iter().enumerate() {
                let tick = event.start_tick.checked_add(event.swing_ticks)?;
                actions.push(BrickPreviewAction {
                    sample_offset: timeline.tick_to_sample(tick).ok()?,
                    event_index: u16::try_from(event_index).ok()?,
                    kind: BrickPreviewActionKind::DrumHit(event.instrument),
                    pitch: 0,
                    velocity: event.velocity,
                });
            }
            AuditionPatch::Drums(patch.clone())
        }
    };
    actions.sort_by_key(|action| {
        (
            action.sample_offset,
            action.kind.order(),
            action.event_index,
        )
    });
    Some(PreparedBrickPreviewSource {
        id,
        source_index: u8::try_from(source_index).ok()?,
        cycle_ticks: layer.cycle_ticks,
        cycle_frames,
        actions: actions.into_boxed_slice(),
        voices: voices.into_boxed_slice(),
        patch,
        enabled,
        running: enabled,
        cursor: 0,
        position: 0,
        cycle_iteration: 0,
    })
}

impl PreparedBrickPreview {
    #[must_use]
    pub fn prepare(
        payload: &StartBrickPreviewPayload,
        plan: &RenderPlan,
        sample_rate: u32,
    ) -> Option<Self> {
        if payload.preview_generation == 0
            || payload.render_plan_revision != plan.project_revision.value()
        {
            return None;
        }
        let timeline = TempoTimeline::new(plan, sample_rate).ok()?;
        let mut sources = Vec::with_capacity(plan.layers.len());
        let mut prepared_action_count = 0_usize;
        let mut enabled_count = 0_usize;
        for (source_index, layer) in plan.layers.iter().enumerate() {
            let enabled = payload
                .source_layer_ids
                .iter()
                .any(|source_id| source_id == &layer.id);
            enabled_count = enabled_count.checked_add(usize::from(enabled))?;
            let source = prepare_brick_preview_source(layer, source_index, enabled, &timeline)?;
            prepared_action_count = prepared_action_count.checked_add(source.actions.len())?;
            if prepared_action_count > ENGINE_PROTOCOL_MAX_PREPARED_ACTIONS {
                return None;
            }
            sources.push(source);
        }
        if enabled_count != payload.source_layer_ids.len() {
            return None;
        }
        Some(Self {
            generation: payload.preview_generation,
            render_plan_revision: payload.render_plan_revision,
            timeline,
            sources: sources.into_boxed_slice(),
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrickPreviewEndReason {
    Stopped,
    Interrupted,
}

impl BrickPreviewEndReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PreviewEndReason {
    Completed,
    Canceled,
    Interrupted,
}

impl PreviewEndReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Canceled => "canceled",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Debug)]
pub enum RetiredRealtimeAllocation {
    Plan(PreparedPlan),
    Preview(PreparedPreview),
    BrickPreview(PreparedBrickPreview),
    Recording(PreparedRecording),
}

#[derive(Debug)]
struct ActivePreview {
    prepared: PreparedPreview,
    cursor: usize,
    position: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecordingPhase {
    CountIn,
    Recording,
}

impl RecordingPhase {
    const fn as_str(self) -> &'static str {
        match self {
            Self::CountIn => "count-in",
            Self::Recording => "recording",
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct HeldRecordingInput {
    id: RecordingIdentifier,
    voice_identifier: u64,
    pitch: u8,
    velocity: u8,
    acknowledged: bool,
}

#[derive(Debug)]
struct ActiveRecording {
    prepared: PreparedRecording,
    phase: RecordingPhase,
    count_in_position: u64,
    count_in_beat_cursor: usize,
    recording_anchor_clock: u64,
    previous_metronome_enabled: bool,
    pre_roll_started: bool,
    held: [Option<HeldRecordingInput>; ENGINE_PROTOCOL_MAX_RECORDING_HELD_INPUTS],
}

fn milliseconds_to_frames(milliseconds: u32, sample_rate: u32, round_up: bool) -> Option<u64> {
    let numerator = u64::from(milliseconds).checked_mul(u64::from(sample_rate))?;
    Some(if round_up {
        numerator.checked_add(999)? / 1_000
    } else {
        numerator / 1_000
    })
}

fn stable_preview_hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    }) & PREVIEW_HASH_MASK
}

fn preview_voice_identifier(base: u64, event_index: u8, pitch_index: usize) -> u64 {
    PREVIEW_IDENTITY_FLAG
        | ((base & PREVIEW_HASH_MASK) << 9)
        | (u64::from(event_index) << 3)
        | u64::try_from(pitch_index).unwrap_or(0)
}

fn brick_preview_voice_identifier(source_index: u8, event_index: u16) -> u64 {
    BRICK_PREVIEW_IDENTITY_PREFIX | (u64::from(source_index) << 16) | u64::from(event_index)
}

#[derive(Debug)]
pub enum RealtimeCommand {
    PublishPlan(PreparedPlan),
    Play(u64),
    Stop,
    Seek(u64),
    SetLoop {
        enabled: bool,
        start_tick: u64,
        end_tick: u64,
    },
    SetMetronomeEnabled(bool),
    SetMetronomeVolume(f64),
    NoteOn {
        identifier: u64,
        pitch: u8,
        velocity: u8,
        patch: SynthPatch,
    },
    DrumHit {
        identifier: u64,
        instrument: DrumInstrument,
        velocity: u8,
        patch: DrumVoicePatch,
    },
    NoteOff(u64),
    StartPreview(PreparedPreview),
    CancelPreview {
        preview_id: PreviewId,
        reason: PreviewEndReason,
    },
    StartBrickPreview(PreparedBrickPreview),
    SetBrickPreviewSourceEnabled {
        generation: u64,
        source_layer_id: PreviewId,
        enabled: bool,
    },
    SeekBrickPreviewSource {
        generation: u64,
        source_layer_id: PreviewId,
        local_tick: u64,
        cycle_iteration: u64,
        running: bool,
    },
    StopBrickPreview {
        generation: u64,
        reason: BrickPreviewEndReason,
    },
    StartRecording(PreparedRecording),
    RecordingNoteOn {
        recording_id: RecordingIdentifier,
        input_id: RecordingIdentifier,
        voice_identifier: u64,
        pitch: u8,
        velocity: u8,
        patch: SynthPatch,
    },
    RecordingNoteOff {
        recording_id: RecordingIdentifier,
        input_id: RecordingIdentifier,
    },
    StopRecording {
        recording_id: RecordingIdentifier,
        reason: RecordingStopReason,
    },
    Shutdown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RealtimeDiagnostic {
    ControlFailure,
    NonFiniteOutput,
    RenderOverload,
}

#[derive(Clone, Copy, Debug)]
pub enum RealtimeEvent {
    PlanAcknowledged {
        project_revision: u64,
        plan_generation: u64,
    },
    Transport {
        playing: bool,
        project_revision: u64,
        sample_position: u64,
        tick: f64,
    },
    Meter {
        left_peak: f64,
        right_peak: f64,
    },
    PreviewStarted {
        preview_id: PreviewId,
        duration_frames: u64,
    },
    PreviewState {
        preview_id: PreviewId,
        pitches: [u8; ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE],
        pitch_count: u8,
        active: bool,
        sample_position: u64,
    },
    PreviewEnded {
        preview_id: PreviewId,
        reason: PreviewEndReason,
    },
    BrickPreviewStarted {
        generation: u64,
        render_plan_revision: u64,
        engine_frame: u64,
    },
    BrickPreviewCursor {
        source_layer_id: PreviewId,
        generation: u64,
        running: bool,
        local_tick: u64,
        cycle_iteration: u64,
        engine_frame: u64,
        render_plan_revision: u64,
    },
    BrickPreviewEnded {
        generation: u64,
        reason: BrickPreviewEndReason,
        engine_frame: u64,
    },
    RecordingState {
        recording_id: RecordingIdentifier,
        state: RecordingPhase,
        sample_position: u64,
        source_tick: u64,
        count_in_beats_remaining: u8,
    },
    RecordingInputApplied {
        recording_id: RecordingIdentifier,
        input_id: RecordingIdentifier,
        active: bool,
        pitch: u8,
        velocity: u8,
        sample_position: u64,
        source_tick: u64,
    },
    RecordingStopped {
        recording_id: RecordingIdentifier,
        reason: RecordingStopReason,
        sample_position: u64,
        stop_tick: u64,
    },
    RealtimeDiagnostic(RealtimeDiagnostic),
}

fn map_recording_event(event: &RealtimeEvent) -> Option<EngineEvent> {
    match event {
        RealtimeEvent::RecordingState {
            recording_id,
            state,
            sample_position,
            source_tick,
            count_in_beats_remaining,
        } => Some(EngineEvent::RecordingState {
            recording_id: recording_id.as_str().to_owned(),
            state: state.as_str().to_owned(),
            sample_position: *sample_position,
            source_tick: *source_tick,
            count_in_beats_remaining: *count_in_beats_remaining,
        }),
        RealtimeEvent::RecordingInputApplied {
            recording_id,
            input_id,
            active,
            pitch,
            velocity,
            sample_position,
            source_tick,
        } => Some(EngineEvent::RecordingInputApplied {
            recording_id: recording_id.as_str().to_owned(),
            audition_id: input_id.as_str().to_owned(),
            phase: if *active { "note-on" } else { "note-off" }.to_owned(),
            pitch: *pitch,
            velocity: *velocity,
            sample_position: *sample_position,
            source_tick: *source_tick,
        }),
        RealtimeEvent::RecordingStopped {
            recording_id,
            reason,
            sample_position,
            stop_tick,
        } => Some(EngineEvent::RecordingStopped {
            recording_id: recording_id.as_str().to_owned(),
            reason: reason.as_str().to_owned(),
            sample_position: *sample_position,
            stop_tick: *stop_tick,
        }),
        _ => None,
    }
}

fn map_brick_preview_event(event: &RealtimeEvent) -> Option<EngineEvent> {
    match event {
        RealtimeEvent::BrickPreviewStarted {
            generation,
            render_plan_revision,
            engine_frame,
        } => Some(EngineEvent::BrickPreviewStarted {
            preview_generation: *generation,
            render_plan_revision: *render_plan_revision,
            engine_frame: *engine_frame,
        }),
        RealtimeEvent::BrickPreviewCursor {
            source_layer_id,
            generation,
            running,
            local_tick,
            cycle_iteration,
            engine_frame,
            render_plan_revision,
        } => Some(EngineEvent::BrickPreviewCursor {
            source_layer_id: source_layer_id.as_str().to_owned(),
            preview_generation: *generation,
            running: *running,
            local_tick: *local_tick,
            cycle_iteration: *cycle_iteration,
            engine_frame: *engine_frame,
            render_plan_revision: *render_plan_revision,
        }),
        RealtimeEvent::BrickPreviewEnded {
            generation,
            reason,
            engine_frame,
        } => Some(EngineEvent::BrickPreviewEnded {
            preview_generation: *generation,
            reason: reason.as_str().to_owned(),
            engine_frame: *engine_frame,
        }),
        _ => None,
    }
}

#[must_use]
pub fn map_realtime_event(event: RealtimeEvent) -> EngineEvent {
    if let Some(recording_event) = map_recording_event(&event) {
        return recording_event;
    }
    if let Some(brick_preview_event) = map_brick_preview_event(&event) {
        return brick_preview_event;
    }
    match event {
        RealtimeEvent::PlanAcknowledged {
            project_revision,
            plan_generation,
        } => EngineEvent::RenderPlanAcknowledged {
            project_revision,
            plan_generation,
        },
        RealtimeEvent::Transport {
            playing,
            project_revision,
            sample_position,
            tick,
        } => EngineEvent::TransportSnapshot {
            playing,
            project_revision,
            sample_position,
            tick,
        },
        RealtimeEvent::Meter {
            left_peak,
            right_peak,
        } => EngineEvent::MeterSnapshot {
            left_peak,
            right_peak,
        },
        RealtimeEvent::PreviewStarted {
            preview_id,
            duration_frames,
        } => EngineEvent::PreviewStarted {
            preview_id: preview_id.as_str().to_owned(),
            duration_frames,
        },
        RealtimeEvent::PreviewState {
            preview_id,
            pitches,
            pitch_count,
            active,
            sample_position,
        } => EngineEvent::PreviewState {
            preview_id: preview_id.as_str().to_owned(),
            pitches: pitches[..usize::from(pitch_count)].to_vec(),
            active,
            sample_position,
        },
        RealtimeEvent::PreviewEnded { preview_id, reason } => EngineEvent::PreviewEnded {
            preview_id: preview_id.as_str().to_owned(),
            reason: reason.as_str().to_owned(),
        },
        RealtimeEvent::RecordingState { .. }
        | RealtimeEvent::RecordingInputApplied { .. }
        | RealtimeEvent::RecordingStopped { .. }
        | RealtimeEvent::BrickPreviewStarted { .. }
        | RealtimeEvent::BrickPreviewCursor { .. }
        | RealtimeEvent::BrickPreviewEnded { .. } => {
            unreachable!("recording and brick preview events map first")
        }
        RealtimeEvent::RealtimeDiagnostic(diagnostic) => match diagnostic {
            RealtimeDiagnostic::ControlFailure => EngineEvent::Diagnostic {
                code: "engine.invalid-plan".to_owned(),
                message: "A real-time engine control could not be applied.".to_owned(),
                project_revision: None,
            },
            RealtimeDiagnostic::NonFiniteOutput => EngineEvent::Diagnostic {
                code: "audio.non-finite-output".to_owned(),
                message: "Non-finite output was replaced with silence.".to_owned(),
                project_revision: None,
            },
            RealtimeDiagnostic::RenderOverload => EngineEvent::Diagnostic {
                code: "audio.render-overload".to_owned(),
                message: "The audio callback exceeded its bounded render budget.".to_owned(),
                project_revision: None,
            },
        },
    }
}

#[derive(Debug, Default)]
pub struct StreamSignals {
    pub callback_count: AtomicU64,
    pub active_voices: AtomicU64,
    pub project_revision: AtomicU64,
    pub output_signal_observed: AtomicBool,
    pub render_overloads: AtomicU64,
    pub stream_error: AtomicBool,
    pub shutdown: AtomicBool,
    pub last_block_frames: AtomicU32,
}

impl StreamSignals {
    pub fn reset(&self) {
        self.callback_count.store(0, Ordering::Release);
        self.active_voices.store(0, Ordering::Release);
        self.project_revision.store(0, Ordering::Release);
        self.output_signal_observed.store(false, Ordering::Release);
        self.render_overloads.store(0, Ordering::Release);
        self.stream_error.store(false, Ordering::Release);
        self.shutdown.store(false, Ordering::Release);
        self.last_block_frames.store(0, Ordering::Release);
    }
}

pub struct RealtimeEngine {
    engine: EngineKernel<RealtimeVoiceBank>,
    sample_rate: u32,
    command_rx: Consumer<RealtimeCommand>,
    retired_tx: Producer<RetiredRealtimeAllocation>,
    event_tx: Producer<RealtimeEvent>,
    signals: Arc<StreamSignals>,
    scratch: Box<[StereoFrame]>,
    pending_reclaims: [Option<RetiredRealtimeAllocation>; 2],
    pending_critical_events: Box<[Option<RealtimeEvent>]>,
    active_preview: Option<ActivePreview>,
    active_brick_preview: Option<PreparedBrickPreview>,
    active_recording: Option<ActiveRecording>,
    frames_since_snapshot: u64,
    last_non_finite_replacements: u64,
}

impl RealtimeEngine {
    #[must_use]
    pub fn new(
        engine: EngineKernel<RealtimeVoiceBank>,
        sample_rate: u32,
        command_rx: Consumer<RealtimeCommand>,
        retired_tx: Producer<RetiredRealtimeAllocation>,
        event_tx: Producer<RealtimeEvent>,
        signals: Arc<StreamSignals>,
    ) -> Self {
        Self {
            engine,
            sample_rate,
            command_rx,
            retired_tx,
            event_tx,
            signals,
            scratch: vec![StereoFrame::default(); ENGINE_PROTOCOL_MAX_BLOCK_FRAMES]
                .into_boxed_slice(),
            pending_reclaims: [None, None],
            pending_critical_events: vec![None; PENDING_CRITICAL_EVENT_CAPACITY].into_boxed_slice(),
            active_preview: None,
            active_brick_preview: None,
            active_recording: None,
            frames_since_snapshot: 0,
            last_non_finite_replacements: 0,
        }
    }

    pub fn render_f32_channels(&mut self, output: &mut [f32], channels: u16) {
        let channels = usize::from(channels);
        if channels == 0 {
            output.fill(0.0);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(0.0);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_f32_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(0.0);
        }
    }

    pub fn render_i16_channels(&mut self, output: &mut [i16], channels: u16) {
        let channels = usize::from(channels);
        if channels == 0 {
            output.fill(0);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(0);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_i16_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(0);
        }
    }

    pub fn render_u16_channels(&mut self, output: &mut [u16], channels: u16) {
        let channels = usize::from(channels);
        let silence = u16::MAX / 2 + 1;
        if channels == 0 {
            output.fill(silence);
            return;
        }
        let frame_count = output.len() / channels;
        if !self.render_frames(frame_count) {
            output.fill(silence);
            return;
        }
        for (samples, frame) in output
            .chunks_exact_mut(channels)
            .zip(self.scratch[..frame_count].iter())
        {
            write_u16_frame(samples, frame.left, frame.right);
        }
        let rendered = frame_count.saturating_mul(channels);
        if rendered < output.len() {
            output[rendered..].fill(silence);
        }
    }

    fn render_frames(&mut self, frame_count: usize) -> bool {
        #[cfg(not(target_family = "wasm"))]
        let started = Instant::now();
        self.flush_pending();
        self.apply_commands();
        if frame_count == 0 || frame_count > ENGINE_PROTOCOL_MAX_BLOCK_FRAMES {
            self.record_overload();
            return false;
        }
        self.render_with_preview(frame_count);
        self.publish_acknowledgement();
        self.publish_observations(frame_count);
        #[cfg(not(target_family = "wasm"))]
        {
            let deadline = f64::from(u32::try_from(frame_count).unwrap_or(u32::MAX))
                / f64::from(self.sample_rate);
            if started.elapsed().as_secs_f64() > deadline {
                self.record_overload();
            }
        }
        true
    }

    fn flush_pending(&mut self) {
        for slot in &mut self.pending_reclaims {
            let Some(allocation) = slot.take() else {
                continue;
            };
            if let Err(PushError::Full(allocation)) = self.retired_tx.push(allocation) {
                *slot = Some(allocation);
                break;
            }
        }
        for slot in &mut self.pending_critical_events {
            let Some(event) = slot.take() else {
                continue;
            };
            if let Err(PushError::Full(event)) = self.event_tx.push(event) {
                *slot = Some(event);
                break;
            }
        }
    }

    fn apply_commands(&mut self) {
        if self.has_pending_delivery() {
            return;
        }
        for _ in 0..MAX_COMMANDS_PER_BLOCK {
            let command = match self.command_rx.pop() {
                Ok(command) => command,
                Err(PopError::Empty) => break,
            };
            let result = match command {
                RealtimeCommand::PublishPlan(plan) => {
                    if self.active_recording.is_some() {
                        self.retire(RetiredRealtimeAllocation::Plan(plan));
                        self.record_control_failure();
                        continue;
                    }
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                    match self.engine.publish_plan_reclaiming(plan) {
                        Ok(retired) => {
                            if let Some(retired) = retired {
                                self.retire(RetiredRealtimeAllocation::Plan(retired));
                            }
                            Ok(())
                        }
                        Err(error) => Err(error),
                    }
                }
                RealtimeCommand::Play(tick) => {
                    self.stop_active_recording(RecordingStopReason::Interrupted);
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                    self.engine.play(tick)
                }
                RealtimeCommand::Stop => {
                    self.stop_active_recording(RecordingStopReason::Interrupted);
                    self.engine.stop();
                    Ok(())
                }
                RealtimeCommand::Seek(tick) => {
                    self.stop_active_recording(RecordingStopReason::Interrupted);
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                    self.engine.seek(tick)
                }
                RealtimeCommand::SetLoop {
                    enabled,
                    start_tick,
                    end_tick,
                } => self.engine.set_loop(enabled, start_tick, end_tick),
                RealtimeCommand::SetMetronomeEnabled(enabled) => {
                    self.engine.set_metronome_enabled(enabled);
                    Ok(())
                }
                RealtimeCommand::SetMetronomeVolume(volume) => {
                    self.engine.set_metronome_volume(volume);
                    Ok(())
                }
                performance_command @ (RealtimeCommand::NoteOn { .. }
                | RealtimeCommand::DrumHit { .. }
                | RealtimeCommand::NoteOff(_)
                | RealtimeCommand::StartPreview(_)
                | RealtimeCommand::CancelPreview { .. }
                | RealtimeCommand::StartBrickPreview(_)
                | RealtimeCommand::SetBrickPreviewSourceEnabled { .. }
                | RealtimeCommand::SeekBrickPreviewSource { .. }
                | RealtimeCommand::StopBrickPreview { .. }) => {
                    self.apply_performance_command(performance_command);
                    Ok(())
                }
                recording_command @ (RealtimeCommand::StartRecording(_)
                | RealtimeCommand::RecordingNoteOn { .. }
                | RealtimeCommand::RecordingNoteOff { .. }
                | RealtimeCommand::StopRecording { .. }) => {
                    self.apply_recording_command(recording_command)
                }
                RealtimeCommand::Shutdown => {
                    self.stop_active_recording(RecordingStopReason::Interrupted);
                    self.end_preview(PreviewEndReason::Interrupted);
                    self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                    self.engine.shutdown();
                    self.signals.shutdown.store(true, Ordering::Release);
                    Ok(())
                }
            };
            if result.is_err() {
                let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
                    RealtimeDiagnostic::ControlFailure,
                ));
            }
            if self.has_pending_delivery() {
                break;
            }
        }
    }

    fn apply_performance_command(&mut self, command: RealtimeCommand) {
        match command {
            RealtimeCommand::NoteOn {
                identifier,
                pitch,
                velocity,
                patch,
            } => {
                self.end_preview(PreviewEndReason::Interrupted);
                self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                self.engine
                    .note_on_audition(identifier, pitch, velocity, &patch);
            }
            RealtimeCommand::DrumHit {
                identifier,
                instrument,
                velocity,
                patch,
            } => self.start_drum_audition(identifier, instrument, velocity, &patch),
            RealtimeCommand::NoteOff(identifier) => self.engine.note_off_audition(identifier),
            RealtimeCommand::StartPreview(prepared) => {
                self.stop_active_recording(RecordingStopReason::Interrupted);
                self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                self.start_preview(prepared);
            }
            RealtimeCommand::CancelPreview { preview_id, reason } => {
                if self
                    .active_preview
                    .as_ref()
                    .is_some_and(|active| active.prepared.id == preview_id)
                {
                    self.end_preview(reason);
                }
            }
            RealtimeCommand::StartBrickPreview(prepared) => {
                self.stop_active_recording(RecordingStopReason::Interrupted);
                self.start_brick_preview(prepared);
            }
            RealtimeCommand::SetBrickPreviewSourceEnabled {
                generation,
                source_layer_id,
                enabled,
            } => self.set_brick_preview_source_enabled(generation, source_layer_id, enabled),
            RealtimeCommand::SeekBrickPreviewSource {
                generation,
                source_layer_id,
                local_tick,
                cycle_iteration,
                running,
            } => self.seek_brick_preview_source(
                generation,
                source_layer_id,
                local_tick,
                cycle_iteration,
                running,
            ),
            RealtimeCommand::StopBrickPreview { generation, reason } => {
                if self
                    .active_brick_preview
                    .as_ref()
                    .is_some_and(|active| active.generation == generation)
                {
                    self.end_brick_preview(reason);
                }
            }
            _ => unreachable!("performance dispatcher received another command"),
        }
    }

    fn apply_recording_command(
        &mut self,
        command: RealtimeCommand,
    ) -> Result<(), EngineControlError> {
        match command {
            RealtimeCommand::StartRecording(prepared) => {
                if self.active_recording.is_some() {
                    self.retire(RetiredRealtimeAllocation::Recording(prepared));
                    return Err(EngineControlError::RecordingConflict);
                }
                self.start_recording(prepared);
            }
            RealtimeCommand::RecordingNoteOn {
                recording_id,
                input_id,
                voice_identifier,
                pitch,
                velocity,
                patch,
            } => self.recording_note_on(
                recording_id,
                input_id,
                voice_identifier,
                pitch,
                velocity,
                &patch,
            ),
            RealtimeCommand::RecordingNoteOff {
                recording_id,
                input_id,
            } => self.recording_note_off(recording_id, input_id),
            RealtimeCommand::StopRecording {
                recording_id,
                reason,
            } => {
                if self
                    .active_recording
                    .as_ref()
                    .is_some_and(|active| active.prepared.id == recording_id)
                {
                    self.stop_active_recording(reason);
                }
            }
            _ => unreachable!("recording dispatcher received another command"),
        }
        Ok(())
    }

    fn start_drum_audition(
        &mut self,
        identifier: u64,
        instrument: DrumInstrument,
        velocity: u8,
        patch: &DrumVoicePatch,
    ) {
        self.end_preview(PreviewEndReason::Interrupted);
        self.end_brick_preview(BrickPreviewEndReason::Interrupted);
        self.engine
            .drum_hit_audition(identifier, instrument, velocity, patch);
    }

    fn start_recording(&mut self, prepared: PreparedRecording) {
        self.end_preview(PreviewEndReason::Interrupted);
        self.end_brick_preview(BrickPreviewEndReason::Interrupted);
        self.engine.stop();
        let previous_metronome_enabled = self.engine.metronome_enabled();
        self.active_recording = Some(ActiveRecording {
            prepared,
            phase: RecordingPhase::CountIn,
            count_in_position: 0,
            count_in_beat_cursor: 0,
            recording_anchor_clock: 0,
            previous_metronome_enabled,
            pre_roll_started: false,
            held: [None; ENGINE_PROTOCOL_MAX_RECORDING_HELD_INPUTS],
        });
        self.apply_recording_boundaries();
    }

    fn recording_note_on(
        &mut self,
        recording_id: RecordingIdentifier,
        input_id: RecordingIdentifier,
        voice_identifier: u64,
        pitch: u8,
        velocity: u8,
        synth_patch: &SynthPatch,
    ) {
        let Some(active) = self
            .active_recording
            .as_mut()
            .filter(|active| active.prepared.id == recording_id)
        else {
            return;
        };
        if active.held.iter().flatten().any(|held| held.id == input_id) {
            return;
        }
        let Some(slot) = active.held.iter_mut().find(|slot| slot.is_none()) else {
            self.record_control_failure();
            return;
        };
        let acknowledged = active.phase == RecordingPhase::Recording;
        *slot = Some(HeldRecordingInput {
            id: input_id,
            voice_identifier,
            pitch,
            velocity,
            acknowledged,
        });
        let anchor_timeline_sample = active.prepared.anchor_timeline_sample;
        let anchor_render_clock = active.recording_anchor_clock;
        self.engine
            .note_on_audition(voice_identifier, pitch, velocity, synth_patch);
        if acknowledged {
            let sample_position = self.engine.render_clock();
            let source_tick = self
                .engine
                .recording_tick(anchor_timeline_sample, anchor_render_clock)
                .unwrap_or(active.prepared.start_tick);
            self.emit_critical(&RealtimeEvent::RecordingInputApplied {
                recording_id,
                input_id,
                active: true,
                pitch,
                velocity,
                sample_position,
                source_tick,
            });
        }
    }

    fn recording_note_off(
        &mut self,
        recording_id: RecordingIdentifier,
        input_id: RecordingIdentifier,
    ) {
        let Some(active) = self
            .active_recording
            .as_mut()
            .filter(|active| active.prepared.id == recording_id)
        else {
            return;
        };
        let Some(slot) = active
            .held
            .iter_mut()
            .find(|slot| slot.as_ref().is_some_and(|held| held.id == input_id))
        else {
            return;
        };
        let held = slot.take().expect("matched held recording input");
        let anchor_timeline_sample = active.prepared.anchor_timeline_sample;
        let anchor_render_clock = active.recording_anchor_clock;
        let fallback_tick = active.prepared.start_tick;
        self.engine.note_off_audition(held.voice_identifier);
        if held.acknowledged {
            let sample_position = self.engine.render_clock();
            let source_tick = self
                .engine
                .recording_tick(anchor_timeline_sample, anchor_render_clock)
                .unwrap_or(fallback_tick)
                .max(fallback_tick);
            self.emit_critical(&RealtimeEvent::RecordingInputApplied {
                recording_id,
                input_id,
                active: false,
                pitch: held.pitch,
                velocity: held.velocity,
                sample_position,
                source_tick,
            });
        }
    }

    fn stop_active_recording(&mut self, requested_reason: RecordingStopReason) {
        let Some(active) = self.active_recording.take() else {
            return;
        };
        let reason = if active.phase == RecordingPhase::CountIn
            && requested_reason == RecordingStopReason::Stopped
        {
            RecordingStopReason::CountInCanceled
        } else {
            requested_reason
        };
        let sample_position = self.engine.render_clock();
        let stop_tick = if active.phase == RecordingPhase::Recording {
            self.engine
                .recording_tick(
                    active.prepared.anchor_timeline_sample,
                    active.recording_anchor_clock,
                )
                .unwrap_or(active.prepared.start_tick)
                .max(active.prepared.start_tick)
        } else {
            active.prepared.start_tick
        };
        for held in active.held.into_iter().flatten() {
            self.engine.note_off_audition(held.voice_identifier);
            if held.acknowledged {
                self.emit_critical(&RealtimeEvent::RecordingInputApplied {
                    recording_id: active.prepared.id,
                    input_id: held.id,
                    active: false,
                    pitch: held.pitch,
                    velocity: held.velocity,
                    sample_position,
                    source_tick: stop_tick,
                });
            }
        }
        self.engine.stop();
        self.engine
            .set_metronome_enabled(active.previous_metronome_enabled);
        self.emit_critical(&RealtimeEvent::RecordingStopped {
            recording_id: active.prepared.id,
            reason,
            sample_position,
            stop_tick,
        });
        self.retire(RetiredRealtimeAllocation::Recording(active.prepared));
    }

    fn has_pending_delivery(&self) -> bool {
        self.pending_reclaims.iter().any(Option::is_some)
            || self.pending_critical_events.iter().any(Option::is_some)
    }

    fn render_with_preview(&mut self, frame_count: usize) {
        let mut rendered = 0_usize;
        while rendered < frame_count {
            self.apply_recording_boundaries();
            self.apply_preview_actions();
            self.complete_preview_if_due();
            self.apply_brick_preview_boundaries();
            let remaining = frame_count - rendered;
            let preview_chunk = self.active_preview.as_ref().map_or(remaining, |active| {
                let next_action = active
                    .prepared
                    .actions
                    .get(active.cursor)
                    .map_or(active.prepared.duration_frames, |action| {
                        action.sample_offset
                    });
                let boundary = next_action.min(active.prepared.duration_frames);
                usize::try_from(boundary.saturating_sub(active.position))
                    .unwrap_or(remaining)
                    .min(remaining)
            });
            let brick_preview_chunk = self.brick_preview_boundary_distance(remaining);
            let recording_chunk = self.recording_boundary_distance(remaining);
            let chunk = preview_chunk.min(brick_preview_chunk).min(recording_chunk);
            if chunk == 0 {
                self.apply_recording_boundaries();
                self.complete_preview_if_due();
                self.apply_brick_preview_boundaries();
                if self.active_preview.is_none()
                    && self.active_brick_preview.is_none()
                    && self.active_recording.is_none()
                {
                    continue;
                }
                // Validated preview and recording schedules always advance at a boundary.
                self.record_control_failure();
                self.end_preview(PreviewEndReason::Interrupted);
                self.end_brick_preview(BrickPreviewEndReason::Interrupted);
                self.stop_active_recording(RecordingStopReason::Interrupted);
                continue;
            }
            self.engine
                .render_block(&mut self.scratch[rendered..rendered + chunk]);
            if let Some(active) = self.active_preview.as_mut() {
                active.position = active
                    .position
                    .saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
            }
            if let Some(active) = self.active_brick_preview.as_mut() {
                for source in active.sources.iter_mut().filter(|source| source.running) {
                    source.position = source
                        .position
                        .saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
                }
            }
            if let Some(active) = self
                .active_recording
                .as_mut()
                .filter(|active| active.phase == RecordingPhase::CountIn)
            {
                active.count_in_position = active
                    .count_in_position
                    .saturating_add(u64::try_from(chunk).unwrap_or(u64::MAX));
            }
            rendered += chunk;
        }
        self.apply_recording_boundaries();
        self.apply_preview_actions();
        self.complete_preview_if_due();
        self.apply_brick_preview_boundaries();
    }

    fn recording_boundary_distance(&self, remaining: usize) -> usize {
        let Some(active) = self
            .active_recording
            .as_ref()
            .filter(|active| active.phase == RecordingPhase::CountIn)
        else {
            return remaining;
        };
        let position = active.count_in_position;
        let mut next = active.prepared.count_in_frames;
        if !active.pre_roll_started {
            next = next.min(active.prepared.pre_roll_delay_frames);
        }
        if let Some(beat) = active.prepared.beats.get(active.count_in_beat_cursor) {
            next = next.min(beat.frame_offset);
        }
        usize::try_from(next.saturating_sub(position))
            .unwrap_or(remaining)
            .min(remaining)
    }

    fn brick_preview_boundary_distance(&self, remaining: usize) -> usize {
        let Some(active) = self.active_brick_preview.as_ref() else {
            return remaining;
        };
        active
            .sources
            .iter()
            .filter(|source| source.running)
            .fold(remaining, |distance, source| {
                let boundary = source
                    .actions
                    .get(source.cursor)
                    .map_or(source.cycle_frames, |action| action.sample_offset)
                    .min(source.cycle_frames);
                distance.min(
                    usize::try_from(boundary.saturating_sub(source.position))
                        .unwrap_or(remaining)
                        .min(remaining),
                )
            })
    }

    fn apply_brick_preview_boundaries(&mut self) {
        let source_count = self
            .active_brick_preview
            .as_ref()
            .map_or(0, |active| active.sources.len());
        for source_index in 0..source_count {
            loop {
                let action = self.active_brick_preview.as_ref().and_then(|active| {
                    let source = &active.sources[source_index];
                    if !source.running {
                        return None;
                    }
                    source
                        .actions
                        .get(source.cursor)
                        .copied()
                        .filter(|action| action.sample_offset <= source.position)
                });
                if let Some(action) = action {
                    let (identity, patch) = {
                        let active = self
                            .active_brick_preview
                            .as_mut()
                            .expect("brick preview action requires an active session");
                        let source = &mut active.sources[source_index];
                        source.cursor += 1;
                        (
                            brick_preview_voice_identifier(source.source_index, action.event_index),
                            source.patch.clone(),
                        )
                    };
                    match (action.kind, patch) {
                        (BrickPreviewActionKind::NoteOn, AuditionPatch::Synth(patch)) => {
                            self.engine.note_on_audition(
                                identity,
                                action.pitch,
                                action.velocity,
                                &patch,
                            );
                        }
                        (BrickPreviewActionKind::NoteOff, AuditionPatch::Synth(_)) => {
                            self.engine.note_off_audition(identity);
                        }
                        (
                            BrickPreviewActionKind::DrumHit(instrument),
                            AuditionPatch::Drums(patch),
                        ) => self.engine.drum_hit_audition(
                            identity,
                            instrument,
                            action.velocity,
                            patch.voice(instrument),
                        ),
                        _ => self.record_control_failure(),
                    }
                    continue;
                }
                let wrapped = {
                    let Some(active) = self.active_brick_preview.as_mut() else {
                        return;
                    };
                    let source = &mut active.sources[source_index];
                    if !source.running || source.position < source.cycle_frames {
                        false
                    } else {
                        source.position = source.position.saturating_sub(source.cycle_frames);
                        source.cycle_iteration = source.cycle_iteration.saturating_add(1);
                        source.cursor = 0;
                        true
                    }
                };
                if !wrapped {
                    break;
                }
            }
        }
    }

    fn start_brick_preview(&mut self, prepared: PreparedBrickPreview) {
        self.end_preview(PreviewEndReason::Interrupted);
        self.end_brick_preview(BrickPreviewEndReason::Interrupted);
        self.engine.stop();
        let event = RealtimeEvent::BrickPreviewStarted {
            generation: prepared.generation,
            render_plan_revision: prepared.render_plan_revision,
            engine_frame: self.engine.render_clock(),
        };
        self.active_brick_preview = Some(prepared);
        self.emit_critical(&event);
        self.apply_brick_preview_boundaries();
    }

    fn set_brick_preview_source_enabled(
        &mut self,
        generation: u64,
        source_layer_id: PreviewId,
        enabled: bool,
    ) {
        let source_index = self.active_brick_preview.as_ref().and_then(|active| {
            (active.generation == generation)
                .then(|| {
                    active
                        .sources
                        .iter()
                        .position(|source| source.id == source_layer_id)
                })
                .flatten()
        });
        let Some(source_index) = source_index else {
            return;
        };
        {
            let (engine, active) = (&mut self.engine, &mut self.active_brick_preview);
            let source = &mut active
                .as_mut()
                .expect("source lookup requires an active brick preview")
                .sources[source_index];
            if source.enabled == enabled {
                return;
            }
            Self::release_brick_preview_source_voices(engine, source);
            source.enabled = enabled;
            source.running = enabled;
            source.cursor = 0;
            source.position = 0;
            source.cycle_iteration = 0;
        }
        if enabled {
            self.apply_brick_preview_boundaries();
        }
        self.emit_brick_preview_cursor(source_index);
    }

    fn seek_brick_preview_source(
        &mut self,
        generation: u64,
        source_layer_id: PreviewId,
        local_tick: u64,
        cycle_iteration: u64,
        running: bool,
    ) {
        let prepared_seek = self.active_brick_preview.as_ref().and_then(|active| {
            if active.generation != generation {
                return None;
            }
            let source_index = active
                .sources
                .iter()
                .position(|source| source.id == source_layer_id && source.enabled)?;
            let source = &active.sources[source_index];
            let normalized_tick = local_tick % source.cycle_ticks;
            let position = active.timeline.tick_to_sample(normalized_tick).ok()?;
            Some((source_index, position.min(source.cycle_frames)))
        });
        let Some((source_index, position)) = prepared_seek else {
            return;
        };
        {
            let (engine, active) = (&mut self.engine, &mut self.active_brick_preview);
            let source = &mut active
                .as_mut()
                .expect("source lookup requires an active brick preview")
                .sources[source_index];
            Self::release_brick_preview_source_voices(engine, source);
            source.position = position;
            source.cycle_iteration = cycle_iteration;
            source.cursor = source
                .actions
                .partition_point(|action| action.sample_offset < position);
            source.running = running;
            if running {
                for voice in source
                    .voices
                    .iter()
                    .filter(|voice| voice.start_frame < position && position < voice.end_frame)
                {
                    if let AuditionPatch::Synth(patch) = &source.patch {
                        engine.note_on_audition(
                            brick_preview_voice_identifier(source.source_index, voice.event_index),
                            voice.pitch,
                            voice.velocity,
                            patch,
                        );
                    }
                }
            }
        }
        if running {
            self.apply_brick_preview_boundaries();
        }
        self.emit_brick_preview_cursor(source_index);
    }

    fn emit_brick_preview_cursor(&mut self, source_index: usize) {
        let event = self.active_brick_preview.as_ref().and_then(|active| {
            let source = active.sources.get(source_index)?;
            let local_tick = active
                .timeline
                .sample_to_tick_nearest(source.position)
                .ok()?
                .min(source.cycle_ticks.saturating_sub(1));
            Some(RealtimeEvent::BrickPreviewCursor {
                source_layer_id: source.id,
                generation: active.generation,
                running: source.running,
                local_tick,
                cycle_iteration: source.cycle_iteration,
                engine_frame: self.engine.render_clock(),
                render_plan_revision: active.render_plan_revision,
            })
        });
        if let Some(event) = event {
            self.emit_critical(&event);
        }
    }

    fn release_brick_preview_source_voices(
        engine: &mut EngineKernel<RealtimeVoiceBank>,
        source: &PreparedBrickPreviewSource,
    ) {
        for voice in &source.voices {
            engine.note_off_audition(brick_preview_voice_identifier(
                source.source_index,
                voice.event_index,
            ));
        }
    }

    fn end_brick_preview(&mut self, reason: BrickPreviewEndReason) {
        let Some(active) = self.active_brick_preview.take() else {
            return;
        };
        for source in &active.sources {
            Self::release_brick_preview_source_voices(&mut self.engine, source);
        }
        self.emit_critical(&RealtimeEvent::BrickPreviewEnded {
            generation: active.generation,
            reason,
            engine_frame: self.engine.render_clock(),
        });
        self.retire(RetiredRealtimeAllocation::BrickPreview(active));
    }

    fn apply_recording_boundaries(&mut self) {
        loop {
            let Some(active) = self
                .active_recording
                .as_ref()
                .filter(|active| active.phase == RecordingPhase::CountIn)
            else {
                return;
            };
            let position = active.count_in_position;
            let beat = active
                .prepared
                .beats
                .get(active.count_in_beat_cursor)
                .copied()
                .filter(|beat| beat.frame_offset <= position);
            if let Some(beat) = beat {
                let (recording_id, remaining) = {
                    let active = self
                        .active_recording
                        .as_mut()
                        .expect("count-in beat requires active recording");
                    let remaining = active
                        .prepared
                        .beats
                        .len()
                        .saturating_sub(active.count_in_beat_cursor);
                    active.count_in_beat_cursor += 1;
                    (
                        active.prepared.id,
                        u8::try_from(remaining).unwrap_or(u8::MAX),
                    )
                };
                self.engine.trigger_recording_metronome(beat.downbeat);
                let source_tick = self.engine.transport_tick().unwrap_or(0);
                self.emit_critical(&RealtimeEvent::RecordingState {
                    recording_id,
                    state: RecordingPhase::CountIn,
                    sample_position: self.engine.render_clock(),
                    source_tick,
                    count_in_beats_remaining: remaining,
                });
                continue;
            }
            let should_start_pre_roll = !active.pre_roll_started
                && active.count_in_position >= active.prepared.pre_roll_delay_frames;
            if should_start_pre_roll {
                let start_tick = active.prepared.pre_roll_start_tick;
                if self.engine.play(start_tick).is_err() {
                    self.record_control_failure();
                    self.stop_active_recording(RecordingStopReason::Interrupted);
                    return;
                }
                if let Some(active) = self.active_recording.as_mut() {
                    active.pre_roll_started = true;
                }
                continue;
            }
            if active.count_in_position >= active.prepared.count_in_frames {
                self.begin_recording_at_boundary();
                continue;
            }
            return;
        }
    }

    fn begin_recording_at_boundary(&mut self) {
        let Some(active) = self.active_recording.as_ref() else {
            return;
        };
        let start_tick = active.prepared.start_tick;
        if self.engine.play(start_tick).is_err() {
            self.record_control_failure();
            self.stop_active_recording(RecordingStopReason::Interrupted);
            return;
        }
        let recording_anchor_clock = self.engine.render_clock();
        let (recording_id, anchor_timeline_sample, previous_metronome_enabled, held_events) = {
            let active = self
                .active_recording
                .as_mut()
                .expect("recording boundary requires active recording");
            active.phase = RecordingPhase::Recording;
            active.recording_anchor_clock = recording_anchor_clock;
            let mut held_events = [None; ENGINE_PROTOCOL_MAX_RECORDING_HELD_INPUTS];
            for (slot, held) in active.held.iter_mut().enumerate() {
                if let Some(held) = held.as_mut() {
                    held.acknowledged = true;
                    held_events[slot] = Some(*held);
                }
            }
            (
                active.prepared.id,
                active.prepared.anchor_timeline_sample,
                active.previous_metronome_enabled,
                held_events,
            )
        };
        self.engine
            .set_metronome_enabled(previous_metronome_enabled);
        for held in held_events.into_iter().flatten() {
            self.emit_critical(&RealtimeEvent::RecordingInputApplied {
                recording_id,
                input_id: held.id,
                active: true,
                pitch: held.pitch,
                velocity: held.velocity,
                sample_position: recording_anchor_clock,
                source_tick: start_tick,
            });
        }
        let source_tick = self
            .engine
            .recording_tick(anchor_timeline_sample, recording_anchor_clock)
            .unwrap_or(start_tick);
        self.emit_critical(&RealtimeEvent::RecordingState {
            recording_id,
            state: RecordingPhase::Recording,
            sample_position: recording_anchor_clock,
            source_tick,
            count_in_beats_remaining: 0,
        });
    }

    fn apply_preview_actions(&mut self) {
        loop {
            let action = self.active_preview.as_ref().and_then(|active| {
                active
                    .prepared
                    .actions
                    .get(active.cursor)
                    .copied()
                    .filter(|action| action.sample_offset <= active.position)
            });
            let Some(action) = action else {
                break;
            };
            let (preview_id, base_identifier, patch, sample_position) = {
                let active = self
                    .active_preview
                    .as_mut()
                    .expect("preview action requires an active preview");
                active.cursor += 1;
                (
                    active.prepared.id,
                    active.prepared.base_identifier,
                    active.prepared.patch.clone(),
                    active.position,
                )
            };
            for (pitch_index, pitch) in action.pitches[..usize::from(action.pitch_count)]
                .iter()
                .copied()
                .enumerate()
            {
                let identifier =
                    preview_voice_identifier(base_identifier, action.event_index, pitch_index);
                if action.active {
                    self.engine
                        .note_on_audition(identifier, pitch, action.velocity, &patch);
                } else {
                    self.engine.note_off_audition(identifier);
                }
            }
            let _ = self.event_tx.push(RealtimeEvent::PreviewState {
                preview_id,
                pitches: action.pitches,
                pitch_count: action.pitch_count,
                active: action.active,
                sample_position,
            });
        }
    }

    fn complete_preview_if_due(&mut self) {
        let complete = self.active_preview.as_ref().is_some_and(|active| {
            active.cursor == active.prepared.actions.len()
                && active.position >= active.prepared.duration_frames
        });
        if complete {
            self.end_preview(PreviewEndReason::Completed);
        }
    }

    fn start_preview(&mut self, prepared: PreparedPreview) {
        self.end_preview(PreviewEndReason::Interrupted);
        let preview_id = prepared.id;
        let duration_frames = prepared.duration_frames;
        self.active_preview = Some(ActivePreview {
            prepared,
            cursor: 0,
            position: 0,
        });
        self.emit_critical(&RealtimeEvent::PreviewStarted {
            preview_id,
            duration_frames,
        });
    }

    fn end_preview(&mut self, reason: PreviewEndReason) {
        let Some(active) = self.active_preview.take() else {
            return;
        };
        for action in active
            .prepared
            .actions
            .iter()
            .filter(|action| action.active)
        {
            for pitch_index in 0..usize::from(action.pitch_count) {
                self.engine.note_off_audition(preview_voice_identifier(
                    active.prepared.base_identifier,
                    action.event_index,
                    pitch_index,
                ));
            }
        }
        let preview_id = active.prepared.id;
        self.emit_critical(&RealtimeEvent::PreviewEnded { preview_id, reason });
        self.retire(RetiredRealtimeAllocation::Preview(active.prepared));
    }

    fn retire(&mut self, allocation: RetiredRealtimeAllocation) {
        let allocation = match self.retired_tx.push(allocation) {
            Ok(()) => return,
            Err(PushError::Full(allocation)) => allocation,
        };
        if let Some(slot) = self.pending_reclaims.iter_mut().find(|slot| slot.is_none()) {
            *slot = Some(allocation);
            return;
        }
        // The bounded command/application schedule permits at most two deferred allocations.
        std::mem::forget(allocation);
        self.record_control_failure();
    }

    fn emit_critical(&mut self, event: &RealtimeEvent) {
        let event = match self.event_tx.push(*event) {
            Ok(()) => return,
            Err(PushError::Full(event)) => event,
        };
        if let Some(slot) = self
            .pending_critical_events
            .iter_mut()
            .find(|slot| slot.is_none())
        {
            *slot = Some(event);
            return;
        }
        self.record_control_failure();
    }

    fn record_control_failure(&mut self) {
        let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
            RealtimeDiagnostic::ControlFailure,
        ));
    }

    fn publish_acknowledgement(&mut self) {
        let Some(acknowledgement) = self.engine.take_plan_acknowledgement() else {
            return;
        };
        self.signals
            .project_revision
            .store(acknowledgement.project_revision, Ordering::Release);
        let event = RealtimeEvent::PlanAcknowledged {
            project_revision: acknowledgement.project_revision,
            plan_generation: acknowledgement.plan_generation,
        };
        self.emit_critical(&event);
    }

    fn publish_observations(&mut self, frame_count: usize) {
        self.signals.callback_count.fetch_add(1, Ordering::AcqRel);
        self.signals.last_block_frames.store(
            u32::try_from(frame_count).unwrap_or(u32::MAX),
            Ordering::Release,
        );
        let health = self.engine.health_snapshot();
        self.signals.active_voices.store(
            u64::try_from(health.active_voices).unwrap_or(u64::MAX),
            Ordering::Release,
        );
        let mut left_peak = 0.0_f64;
        let mut right_peak = 0.0_f64;
        for frame in &self.scratch[..frame_count] {
            left_peak = left_peak.max(frame.left.abs());
            right_peak = right_peak.max(frame.right.abs());
        }
        if left_peak > f64::EPSILON || right_peak > f64::EPSILON {
            self.signals
                .output_signal_observed
                .store(true, Ordering::Release);
        }
        if health.non_finite_replacements > self.last_non_finite_replacements {
            self.last_non_finite_replacements = health.non_finite_replacements;
            let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
                RealtimeDiagnostic::NonFiniteOutput,
            ));
        }
        self.frames_since_snapshot = self
            .frames_since_snapshot
            .saturating_add(u64::try_from(frame_count).unwrap_or(u64::MAX));
        let snapshot_interval = u64::from(self.sample_rate) / SNAPSHOTS_PER_SECOND;
        if self.frames_since_snapshot < snapshot_interval.max(1) {
            return;
        }
        self.frames_since_snapshot = 0;
        let _ = self.event_tx.push(RealtimeEvent::Meter {
            left_peak: left_peak.clamp(0.0, 1.0),
            right_peak: right_peak.clamp(0.0, 1.0),
        });
        let recording_snapshot = self.active_recording.as_ref().map(|active| {
            let source_tick = if active.phase == RecordingPhase::Recording {
                self.engine
                    .recording_tick(
                        active.prepared.anchor_timeline_sample,
                        active.recording_anchor_clock,
                    )
                    .unwrap_or(active.prepared.start_tick)
            } else {
                self.engine.transport_tick().unwrap_or(0)
            };
            RealtimeEvent::RecordingState {
                recording_id: active.prepared.id,
                state: active.phase,
                sample_position: self.engine.render_clock(),
                source_tick,
                count_in_beats_remaining: if active.phase == RecordingPhase::CountIn {
                    u8::try_from(
                        active
                            .prepared
                            .beats
                            .len()
                            .saturating_sub(active.count_in_beat_cursor),
                    )
                    .unwrap_or(u8::MAX)
                } else {
                    0
                },
            }
        });
        if let Some(event) = recording_snapshot {
            let _ = self.event_tx.push(event);
        }
        if let Some(active) = self.active_brick_preview.as_ref() {
            let engine_frame = self.engine.render_clock();
            for source in active.sources.iter().filter(|source| source.running) {
                let Ok(local_tick) = active.timeline.sample_to_tick_nearest(source.position) else {
                    continue;
                };
                let _ = self.event_tx.push(RealtimeEvent::BrickPreviewCursor {
                    source_layer_id: source.id,
                    generation: active.generation,
                    running: true,
                    local_tick: local_tick.min(source.cycle_ticks.saturating_sub(1)),
                    cycle_iteration: source.cycle_iteration,
                    engine_frame,
                    render_plan_revision: active.render_plan_revision,
                });
            }
        }
        let revision = self.signals.project_revision.load(Ordering::Acquire);
        if revision > 0 {
            let _ = self.event_tx.push(RealtimeEvent::Transport {
                playing: self.engine.transport_state() == TransportState::Playing,
                project_revision: revision,
                sample_position: self.engine.transport_sample_position(),
                tick: wire_tick(self.engine.transport_tick().unwrap_or(0)),
            });
        }
    }

    fn record_overload(&mut self) {
        self.signals.render_overloads.fetch_add(1, Ordering::AcqRel);
        let _ = self.event_tx.push(RealtimeEvent::RealtimeDiagnostic(
            RealtimeDiagnostic::RenderOverload,
        ));
    }
}

fn write_f32_frame(samples: &mut [f32], left: f64, right: f64) {
    if samples.len() == 1 {
        samples[0] = float_f32((left + right) * 0.5);
        return;
    }
    samples.fill(0.0);
    samples[0] = float_f32(left);
    samples[1] = float_f32(right);
}

fn write_i16_frame(samples: &mut [i16], left: f64, right: f64) {
    if samples.len() == 1 {
        samples[0] = signed_i16((left + right) * 0.5);
        return;
    }
    samples.fill(0);
    samples[0] = signed_i16(left);
    samples[1] = signed_i16(right);
}

fn write_u16_frame(samples: &mut [u16], left: f64, right: f64) {
    let silence = u16::MAX / 2 + 1;
    if samples.len() == 1 {
        samples[0] = unsigned_u16((left + right) * 0.5);
        return;
    }
    samples.fill(silence);
    samples[0] = unsigned_u16(left);
    samples[1] = unsigned_u16(right);
}

#[allow(clippy::cast_possible_truncation)]
fn signed_i16(sample: f64) -> i16 {
    let bounded = sample.clamp(-1.0, 1.0);
    if bounded <= -1.0 {
        i16::MIN
    } else {
        (bounded * f64::from(i16::MAX)).round() as i16
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn unsigned_u16(sample: f64) -> u16 {
    let normalized = sample.clamp(-1.0, 1.0).mul_add(0.5, 0.5);
    (normalized * f64::from(u16::MAX)).round() as u16
}

#[allow(clippy::cast_possible_truncation)]
fn float_f32(sample: f64) -> f32 {
    sample.clamp(-1.0, 1.0) as f32
}

#[allow(clippy::cast_precision_loss)]
fn wire_tick(tick: u64) -> f64 {
    tick as f64
}

/// Creates the shared realtime kernel for a protocol-approved sample rate.
///
/// # Panics
///
/// Panics when `sample_rate` is outside the protocol DSP limits. Callers validate
/// the rate while accepting their platform audio configuration.
#[must_use]
pub fn create_engine(sample_rate: u32) -> EngineKernel<RealtimeVoiceBank> {
    let configuration = DspConfiguration::new(sample_rate, ENGINE_PROTOCOL_MAX_BLOCK_FRAMES)
        .expect("protocol sample rate and maximum block size are valid");
    EngineKernel::new(
        configuration,
        CompositeVoiceBank::new(
            SynthVoicePool::new(configuration),
            DrumVoicePool::new(configuration),
        ),
    )
}

#[cfg(test)]
mod tests {
    use rtrb::RingBuffer;
    use tiempio_engine_core::{
        InstrumentLayerPlan, LayerSource, LoopRegion, MeterPoint, MidiNoteEvent,
        PATCH_MODEL_VERSION, RENDER_PLAN_VERSION, RenderPlanRevision, SynthAmplifierPatch,
        SynthExpressionPatch, SynthFilterPatch, SynthMovementPatch, SynthOscillatorPatch,
        SynthSecondaryOscillatorPatch, SynthWaveform, TICKS_PER_QUARTER, TempoPoint,
    };
    use tiempio_engine_protocol::{PreviewEventPayload, StartBrickPreviewPayload};

    use super::*;

    fn preview_patch() -> SynthPatch {
        SynthPatch {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: SynthOscillatorPatch {
                waveform: SynthWaveform::Saw,
                detune_cents: 0.0,
                sub_level: 0.5,
                noise_level: 0.0,
                pulse_width: 0.5,
                secondary: SynthSecondaryOscillatorPatch {
                    waveform: SynthWaveform::Sine,
                    semitone_offset: 12,
                    detune_cents: 3.0,
                    level: 0.12,
                },
            },
            filter: SynthFilterPatch {
                cutoff_hz: 500.0,
                envelope_amount: 0.4,
                key_tracking: 0.45,
                resonance: 0.2,
            },
            amplifier: SynthAmplifierPatch {
                attack_ms: 0.0,
                decay_ms: 0.0,
                release_ms: 1.0,
                sustain: 1.0,
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
            drive: 0.0,
            stereo_width: 0.0,
            output_gain: 1.0,
        }
    }

    fn preview_program(preview_id: &str) -> PreviewProgramPayload {
        PreviewProgramPayload {
            preview_id: preview_id.to_owned(),
            layer_id: "layer.bass".to_owned(),
            program_version: 1,
            events: vec![PreviewEventPayload {
                offset_ms: 1,
                duration_ms: 2,
                pitches: vec![45, 52],
                velocity: 100,
            }],
        }
    }

    fn brick_preview_plan() -> RenderPlan {
        let layer = |id: &str, cycle_ticks: u64, duration_ticks: u64| InstrumentLayerPlan {
            id: id.to_owned(),
            gain: 1.0,
            pan: 0.0,
            song_enabled: true,
            cycle_ticks,
            source: LayerSource::Synth {
                patch: preview_patch(),
                events: vec![MidiNoteEvent {
                    id: format!("note.{id}"),
                    start_tick: 0,
                    duration_ticks,
                    pitch: 45,
                    velocity: 100,
                }],
            },
        };
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.brick-preview".to_owned(),
            project_revision: RenderPlanRevision::new(7),
            ticks_per_quarter: TICKS_PER_QUARTER,
            end_tick: 3_840,
            tempo_map: vec![TempoPoint {
                tick: 0,
                micro_bpm: 120_000_000,
            }],
            meter_map: vec![MeterPoint {
                tick: 0,
                numerator: 4,
                denominator: 4,
            }],
            loop_region: LoopRegion {
                enabled: false,
                start_tick: 0,
                end_tick: 3_840,
            },
            layers: vec![
                layer("layer.bass", 960, 480),
                layer("layer.lead", 1_920, 960),
            ],
            instances: vec![],
        }
    }

    #[test]
    fn converts_supported_sample_formats_with_defined_silence_and_extrema() {
        assert_eq!(signed_i16(-1.0), i16::MIN);
        assert_eq!(signed_i16(0.0), 0);
        assert_eq!(signed_i16(1.0), i16::MAX);
        assert_eq!(unsigned_u16(-1.0), u16::MIN);
        assert_eq!(unsigned_u16(0.0), 32_768);
        assert_eq!(unsigned_u16(1.0), u16::MAX);
    }

    #[test]
    fn maps_logical_stereo_to_mono_stereo_and_multichannel_frames() {
        let mut mono = [0.0_f32; 1];
        write_f32_frame(&mut mono, 0.75, 0.25);
        assert!((mono[0] - 0.5).abs() < f32::EPSILON);

        let mut stereo = [0_i16; 2];
        write_i16_frame(&mut stereo, -1.0, 1.0);
        assert_eq!(stereo, [i16::MIN, i16::MAX]);

        let mut surround = [u16::MAX; 6];
        write_u16_frame(&mut surround, -1.0, 1.0);
        assert_eq!(surround[0], u16::MIN);
        assert_eq!(surround[1], u16::MAX);
        assert!(surround[2..].iter().all(|sample| *sample == 32_768));
    }

    #[test]
    fn schedules_preview_actions_on_the_render_clock_without_starting_transport() {
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, mut retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, mut event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let mut realtime = RealtimeEngine::new(
            create_engine(48_000),
            48_000,
            command_rx,
            retired_tx,
            event_tx,
            signals,
        );
        let preview =
            PreparedPreview::prepare(preview_program("preview.clock.1"), 48_000, preview_patch())
                .expect("valid preview");
        command_tx
            .push(RealtimeCommand::StartPreview(preview))
            .expect("bounded command queue");

        assert!(realtime.render_frames(48));
        assert_eq!(realtime.engine.transport_state(), TransportState::Stopped);
        assert_eq!(
            realtime
                .active_preview
                .as_ref()
                .map(|preview| preview.position),
            Some(48)
        );
        let first_events: Vec<_> = std::iter::from_fn(|| event_rx.pop().ok()).collect();
        assert!(first_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewStarted {
                duration_frames: 144,
                ..
            }
        )));
        assert!(first_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewState {
                active: true,
                sample_position: 48,
                ..
            }
        )));

        assert!(realtime.render_frames(96));
        assert!(realtime.active_preview.is_none());
        let final_events: Vec<_> = std::iter::from_fn(|| event_rx.pop().ok()).collect();
        assert!(final_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewState {
                active: false,
                sample_position: 144,
                ..
            }
        )));
        assert!(final_events.iter().any(|event| matches!(
            event,
            RealtimeEvent::PreviewEnded {
                reason: PreviewEndReason::Completed,
                ..
            }
        )));
        assert!(matches!(
            retired_rx.pop(),
            Ok(RetiredRealtimeAllocation::Preview(_))
        ));
    }

    #[test]
    fn ignores_stale_preview_cancel_and_accepts_the_matching_identifier() {
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, _retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, mut event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let mut realtime = RealtimeEngine::new(
            create_engine(48_000),
            48_000,
            command_rx,
            retired_tx,
            event_tx,
            signals,
        );
        let preview_id = PreviewId::new("preview.cancel.1").expect("valid ID");
        let preview = PreparedPreview::prepare(
            preview_program(preview_id.as_str()),
            48_000,
            preview_patch(),
        )
        .expect("valid preview");
        command_tx
            .push(RealtimeCommand::StartPreview(preview))
            .expect("bounded command queue");
        assert!(realtime.render_frames(48));
        command_tx
            .push(RealtimeCommand::CancelPreview {
                preview_id: PreviewId::new("preview.stale.1").expect("valid ID"),
                reason: PreviewEndReason::Canceled,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert!(realtime.active_preview.is_some());
        command_tx
            .push(RealtimeCommand::CancelPreview {
                preview_id,
                reason: PreviewEndReason::Canceled,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert!(realtime.active_preview.is_none());
        assert!(
            std::iter::from_fn(|| event_rx.pop().ok()).any(|event| matches!(
                event,
                RealtimeEvent::PreviewEnded {
                    reason: PreviewEndReason::Canceled,
                    ..
                }
            ))
        );
    }

    #[test]
    fn runs_independent_brick_cursors_and_restarts_a_late_enabled_source_at_zero() {
        let (mut command_tx, command_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (retired_tx, mut retired_rx) = RingBuffer::new(CONTROL_QUEUE_CAPACITY);
        let (event_tx, mut event_rx) = RingBuffer::new(EVENT_QUEUE_CAPACITY);
        let signals = Arc::new(StreamSignals::default());
        let mut realtime = RealtimeEngine::new(
            create_engine(48_000),
            48_000,
            command_rx,
            retired_tx,
            event_tx,
            signals,
        );
        let prepared = PreparedBrickPreview::prepare(
            &StartBrickPreviewPayload {
                preview_generation: 3,
                render_plan_revision: 7,
                source_layer_ids: vec!["layer.bass".to_owned()],
            },
            &brick_preview_plan(),
            48_000,
        )
        .expect("valid linked-source preview");
        command_tx
            .push(RealtimeCommand::StartBrickPreview(prepared))
            .expect("bounded command queue");
        assert!(realtime.render_frames(128));
        let active = realtime
            .active_brick_preview
            .as_ref()
            .expect("active brick preview");
        assert_eq!(active.sources[0].position, 128);
        assert_eq!(active.sources[1].position, 0);

        command_tx
            .push(RealtimeCommand::SetBrickPreviewSourceEnabled {
                generation: 3,
                source_layer_id: PreviewId::new("layer.lead").expect("source ID"),
                enabled: true,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(128));
        let active = realtime
            .active_brick_preview
            .as_ref()
            .expect("active brick preview");
        assert_eq!(active.sources[0].position, 256);
        assert_eq!(active.sources[1].position, 128);

        command_tx
            .push(RealtimeCommand::SetBrickPreviewSourceEnabled {
                generation: 3,
                source_layer_id: PreviewId::new("layer.lead").expect("source ID"),
                enabled: false,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        command_tx
            .push(RealtimeCommand::SetBrickPreviewSourceEnabled {
                generation: 3,
                source_layer_id: PreviewId::new("layer.lead").expect("source ID"),
                enabled: true,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert_eq!(
            realtime
                .active_brick_preview
                .as_ref()
                .expect("active brick preview")
                .sources[1]
                .position,
            1
        );

        command_tx
            .push(RealtimeCommand::StopBrickPreview {
                generation: 3,
                reason: BrickPreviewEndReason::Stopped,
            })
            .expect("bounded command queue");
        assert!(realtime.render_frames(1));
        assert!(realtime.active_brick_preview.is_none());
        assert!(
            std::iter::from_fn(|| event_rx.pop().ok()).any(|event| matches!(
                event,
                RealtimeEvent::BrickPreviewEnded {
                    generation: 3,
                    reason: BrickPreviewEndReason::Stopped,
                    ..
                }
            ))
        );
        assert!(matches!(
            retired_rx.pop(),
            Ok(RetiredRealtimeAllocation::BrickPreview(_))
        ));
    }
}
