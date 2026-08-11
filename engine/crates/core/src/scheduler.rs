use std::cmp::Ordering;

use crate::{
    LayerSource, PlanValidationCode, RenderPlan, TempoError, TempoTimeline, validate_render_plan,
};

pub const MAX_PREPARED_ACTIONS: usize = 8_192;
pub const MAX_PREPARED_BEATS: usize = 8_192;
pub const MAX_ACTIONS_PER_BLOCK: usize = 512;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PreparedActionKind {
    NoteOff,
    DrumHit,
    NoteOn,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreparedAction {
    pub sample_position: u64,
    pub layer_index: usize,
    pub event_index: usize,
    pub kind: PreparedActionKind,
    plan_order: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreparedBeat {
    pub sample_position: u64,
    pub tick: u64,
    pub downbeat: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparedPlanError {
    InvalidPlan(String),
    LimitExceeded,
    Tempo(TempoError),
}

#[derive(Clone, Debug, PartialEq)]
pub struct PreparedPlan {
    plan: RenderPlan,
    timeline: TempoTimeline,
    actions: Vec<PreparedAction>,
    beats: Vec<PreparedBeat>,
    generation: u64,
    loop_start_sample: u64,
    loop_end_sample: u64,
}

impl PreparedPlan {
    /// Validates and precompiles one immutable plan outside the render callback.
    ///
    /// # Errors
    ///
    /// Returns a stable error for invalid input, exceeded action ceilings or tempo overflow.
    pub fn prepare(
        plan: RenderPlan,
        sample_rate: u32,
        generation: u64,
    ) -> Result<Self, PreparedPlanError> {
        validate_render_plan(&plan).map_err(|failure| {
            if failure.code == PlanValidationCode::LimitExceeded {
                PreparedPlanError::LimitExceeded
            } else {
                PreparedPlanError::InvalidPlan(format!("{}: {}", failure.path, failure.message))
            }
        })?;
        let action_count = plan.layers.iter().try_fold(0_usize, |count, layer| {
            let layer_actions = match &layer.source {
                LayerSource::Synth { events, .. } => events.len().checked_mul(2),
                LayerSource::Drums { events, .. } => Some(events.len()),
            }
            .ok_or(PreparedPlanError::LimitExceeded)?;
            count
                .checked_add(layer_actions)
                .ok_or(PreparedPlanError::LimitExceeded)
        })?;
        if action_count > MAX_PREPARED_ACTIONS {
            return Err(PreparedPlanError::LimitExceeded);
        }
        let timeline = TempoTimeline::new(&plan, sample_rate).map_err(PreparedPlanError::Tempo)?;
        let mut actions = Vec::with_capacity(action_count);
        let mut plan_order = 0_usize;
        for (layer_index, layer) in plan.layers.iter().enumerate() {
            match &layer.source {
                LayerSource::Synth { events, .. } => {
                    for (event_index, event) in events.iter().enumerate() {
                        let end_tick = event
                            .start_tick
                            .checked_add(event.duration_ticks)
                            .ok_or(PreparedPlanError::LimitExceeded)?;
                        actions.push(PreparedAction {
                            sample_position: timeline
                                .tick_to_sample(event.start_tick)
                                .map_err(PreparedPlanError::Tempo)?,
                            layer_index,
                            event_index,
                            kind: PreparedActionKind::NoteOn,
                            plan_order,
                        });
                        plan_order += 1;
                        actions.push(PreparedAction {
                            sample_position: timeline
                                .tick_to_sample(end_tick)
                                .map_err(PreparedPlanError::Tempo)?,
                            layer_index,
                            event_index,
                            kind: PreparedActionKind::NoteOff,
                            plan_order,
                        });
                        plan_order += 1;
                    }
                }
                LayerSource::Drums { events, .. } => {
                    for (event_index, event) in events.iter().enumerate() {
                        let swung_tick = event
                            .start_tick
                            .checked_add(event.swing_ticks)
                            .ok_or(PreparedPlanError::LimitExceeded)?;
                        actions.push(PreparedAction {
                            sample_position: timeline
                                .tick_to_sample(swung_tick)
                                .map_err(PreparedPlanError::Tempo)?,
                            layer_index,
                            event_index,
                            kind: PreparedActionKind::DrumHit,
                            plan_order,
                        });
                        plan_order += 1;
                    }
                }
            }
        }
        actions.sort_by(|left, right| action_order(&plan, left, right));
        validate_action_density(&actions)?;
        let beats = prepare_beats(&plan, &timeline)?;
        let loop_start_sample = timeline
            .tick_to_sample(plan.loop_region.start_tick)
            .map_err(PreparedPlanError::Tempo)?;
        let loop_end_sample = timeline
            .tick_to_sample(plan.loop_region.end_tick)
            .map_err(PreparedPlanError::Tempo)?;
        Ok(Self {
            plan,
            timeline,
            actions,
            beats,
            generation,
            loop_start_sample,
            loop_end_sample,
        })
    }

    #[must_use]
    pub const fn plan(&self) -> &RenderPlan {
        &self.plan
    }

    #[must_use]
    pub const fn timeline(&self) -> &TempoTimeline {
        &self.timeline
    }

    #[must_use]
    pub fn actions(&self) -> &[PreparedAction] {
        &self.actions
    }

    #[must_use]
    pub fn beats(&self) -> &[PreparedBeat] {
        &self.beats
    }

    #[must_use]
    pub const fn generation(&self) -> u64 {
        self.generation
    }

    #[must_use]
    pub const fn loop_start_sample(&self) -> u64 {
        self.loop_start_sample
    }

    #[must_use]
    pub const fn loop_end_sample(&self) -> u64 {
        self.loop_end_sample
    }

    #[must_use]
    pub fn action_cursor_at(&self, sample_position: u64) -> usize {
        self.actions
            .partition_point(|action| action.sample_position < sample_position)
    }

    #[must_use]
    pub fn beat_cursor_at(&self, sample_position: u64) -> usize {
        self.beats
            .partition_point(|beat| beat.sample_position < sample_position)
    }
}

fn prepare_beats(
    plan: &RenderPlan,
    timeline: &TempoTimeline,
) -> Result<Vec<PreparedBeat>, PreparedPlanError> {
    let mut beats = Vec::new();
    for (meter_index, meter) in plan.meter_map.iter().enumerate() {
        let segment_end = plan
            .meter_map
            .get(meter_index + 1)
            .map_or(plan.end_tick, |next| next.tick);
        let ticks_per_beat = u64::from(plan.ticks_per_quarter)
            .checked_mul(4)
            .and_then(|ticks| ticks.checked_div(u64::from(meter.denominator)))
            .filter(|ticks| *ticks > 0)
            .ok_or(PreparedPlanError::LimitExceeded)?;
        let mut beat_tick = meter.tick;
        let mut beat_index = 0_u64;
        while beat_tick < segment_end {
            if beats.len() >= MAX_PREPARED_BEATS {
                return Err(PreparedPlanError::LimitExceeded);
            }
            beats.push(PreparedBeat {
                sample_position: timeline
                    .tick_to_sample(beat_tick)
                    .map_err(PreparedPlanError::Tempo)?,
                tick: beat_tick,
                downbeat: beat_index % u64::from(meter.numerator) == 0,
            });
            beat_index = beat_index.saturating_add(1);
            beat_tick = beat_tick
                .checked_add(ticks_per_beat)
                .ok_or(PreparedPlanError::LimitExceeded)?;
        }
    }
    Ok(beats)
}

fn action_order(plan: &RenderPlan, left: &PreparedAction, right: &PreparedAction) -> Ordering {
    let left_layer = &plan.layers[left.layer_index];
    let right_layer = &plan.layers[right.layer_index];
    let left_event = event_id(&left_layer.source, left.event_index);
    let right_event = event_id(&right_layer.source, right.event_index);
    (
        left.sample_position,
        left.kind,
        left_layer.id.as_str(),
        left_event,
        left.plan_order,
    )
        .cmp(&(
            right.sample_position,
            right.kind,
            right_layer.id.as_str(),
            right_event,
            right.plan_order,
        ))
}

fn event_id(source: &LayerSource, event_index: usize) -> &str {
    match source {
        LayerSource::Synth { events, .. } => events[event_index].id.as_str(),
        LayerSource::Drums { events, .. } => events[event_index].id.as_str(),
    }
}

fn validate_action_density(actions: &[PreparedAction]) -> Result<(), PreparedPlanError> {
    let mut start = 0_usize;
    while start < actions.len() {
        let sample = actions[start].sample_position;
        let end =
            actions[start..].partition_point(|action| action.sample_position == sample) + start;
        if end - start > MAX_ACTIONS_PER_BLOCK {
            return Err(PreparedPlanError::LimitExceeded);
        }
        start = end;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        InstrumentLayerPlan, LayerSource, LoopRegion, MeterPoint, MidiNoteEvent,
        RENDER_PLAN_VERSION, RenderPlanRevision, TICKS_PER_QUARTER, TempoPoint,
    };

    use super::*;

    fn test_plan() -> RenderPlan {
        let patch = crate::tests::valid_synth_patch();
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.scheduler".to_owned(),
            project_revision: RenderPlanRevision::new(1),
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
            layers: vec![InstrumentLayerPlan {
                id: "layer.bass".to_owned(),
                gain: 1.0,
                pan: 0.0,
                source: LayerSource::Synth {
                    patch,
                    events: vec![
                        MidiNoteEvent {
                            id: "note.one".to_owned(),
                            start_tick: 0,
                            duration_ticks: 960,
                            pitch: 36,
                            velocity: 100,
                        },
                        MidiNoteEvent {
                            id: "note.two".to_owned(),
                            start_tick: 960,
                            duration_ticks: 960,
                            pitch: 40,
                            velocity: 96,
                        },
                    ],
                },
            }],
        }
    }

    #[test]
    fn orders_note_off_before_note_on_at_the_same_sample() {
        let prepared = PreparedPlan::prepare(test_plan(), 48_000, 3).expect("valid plan");
        let boundary = prepared
            .actions()
            .iter()
            .filter(|action| action.sample_position == 24_000)
            .collect::<Vec<_>>();
        assert_eq!(boundary.len(), 2);
        assert_eq!(boundary[0].kind, PreparedActionKind::NoteOff);
        assert_eq!(boundary[1].kind, PreparedActionKind::NoteOn);
    }

    #[test]
    fn schedules_procedural_drum_hits_with_bounded_swing_offsets() {
        let mut plan = test_plan();
        plan.layers.push(InstrumentLayerPlan {
            id: "layer.drums".to_owned(),
            gain: 1.0,
            pan: 0.0,
            source: LayerSource::Drums {
                patch: crate::tests::valid_drum_patch(),
                events: vec![crate::DrumHitEvent {
                    id: "hit.hat".to_owned(),
                    start_tick: 960,
                    swing_ticks: 120,
                    instrument: crate::DrumInstrument::ClosedHat,
                    velocity: 96,
                }],
            },
        });
        let prepared = PreparedPlan::prepare(plan, 48_000, 3).expect("valid mixed plan");
        let action = prepared
            .actions()
            .iter()
            .find(|action| action.kind == PreparedActionKind::DrumHit)
            .expect("prepared drum hit");
        assert_eq!(action.sample_position, 27_000);
    }

    #[test]
    fn rejects_more_than_the_bounded_actions_at_one_sample() {
        let mut plan = test_plan();
        if let LayerSource::Synth { events, .. } = &mut plan.layers[0].source {
            *events = (0..=MAX_ACTIONS_PER_BLOCK)
                .map(|index| MidiNoteEvent {
                    id: format!("note.{index:04}"),
                    start_tick: 0,
                    duration_ticks: 960,
                    pitch: 36,
                    velocity: 100,
                })
                .collect();
        }
        assert_eq!(
            PreparedPlan::prepare(plan, 48_000, 3),
            Err(PreparedPlanError::LimitExceeded)
        );
    }

    #[test]
    fn precomputes_tempo_and_meter_aware_beat_boundaries() {
        let mut plan = test_plan();
        plan.end_tick = 6_720;
        plan.tempo_map = vec![
            TempoPoint {
                tick: 0,
                micro_bpm: 120_000_000,
            },
            TempoPoint {
                tick: 1_920,
                micro_bpm: 60_000_000,
            },
        ];
        plan.meter_map = vec![
            MeterPoint {
                tick: 0,
                numerator: 4,
                denominator: 4,
            },
            MeterPoint {
                tick: 3_840,
                numerator: 3,
                denominator: 4,
            },
        ];
        let prepared = PreparedPlan::prepare(plan, 48_000, 3).expect("valid plan");
        assert_eq!(
            prepared
                .beats()
                .iter()
                .map(|beat| (beat.tick, beat.sample_position, beat.downbeat))
                .collect::<Vec<_>>(),
            vec![
                (0, 0, true),
                (960, 24_000, false),
                (1_920, 48_000, false),
                (2_880, 96_000, false),
                (3_840, 144_000, true),
                (4_800, 192_000, false),
                (5_760, 240_000, false),
            ]
        );
        assert_eq!(prepared.beat_cursor_at(12_000), 1);
    }

    #[test]
    fn rejects_a_project_above_the_prepared_beat_ceiling() {
        let mut plan = test_plan();
        plan.end_tick = (u64::try_from(MAX_PREPARED_BEATS).unwrap() + 1) * 960;
        assert_eq!(
            PreparedPlan::prepare(plan, 48_000, 3),
            Err(PreparedPlanError::LimitExceeded)
        );
    }
}
