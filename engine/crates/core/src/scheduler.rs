use std::cmp::Ordering;

use crate::{RenderPlan, TempoError, TempoTimeline, validate_render_plan};

pub const MAX_PREPARED_ACTIONS: usize = 8_192;
pub const MAX_ACTIONS_PER_BLOCK: usize = 512;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PreparedActionKind {
    NoteOff,
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
            PreparedPlanError::InvalidPlan(format!("{}: {}", failure.path, failure.message))
        })?;
        let action_count = plan
            .layers
            .iter()
            .try_fold(0_usize, |count, layer| {
                count.checked_add(layer.events.len())
            })
            .and_then(|count| count.checked_mul(2))
            .ok_or(PreparedPlanError::LimitExceeded)?;
        if action_count > MAX_PREPARED_ACTIONS {
            return Err(PreparedPlanError::LimitExceeded);
        }
        let timeline = TempoTimeline::new(&plan, sample_rate).map_err(PreparedPlanError::Tempo)?;
        let mut actions = Vec::with_capacity(action_count);
        let mut plan_order = 0_usize;
        for (layer_index, layer) in plan.layers.iter().enumerate() {
            for (event_index, event) in layer.events.iter().enumerate() {
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
        actions.sort_by(|left, right| action_order(&plan, left, right));
        validate_action_density(&actions)?;
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
}

fn action_order(plan: &RenderPlan, left: &PreparedAction, right: &PreparedAction) -> Ordering {
    let left_layer = &plan.layers[left.layer_index];
    let right_layer = &plan.layers[right.layer_index];
    let left_event = &left_layer.events[left.event_index];
    let right_event = &right_layer.events[right.event_index];
    (
        left.sample_position,
        left.kind,
        left_layer.id.as_str(),
        left_event.id.as_str(),
        left.plan_order,
    )
        .cmp(&(
            right.sample_position,
            right.kind,
            right_layer.id.as_str(),
            right_event.id.as_str(),
            right.plan_order,
        ))
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
        BassAmplifierPatchV1, BassFilterPatchV1, BassLayerPlan, BassOscillatorPatchV1, BassPatchV1,
        LoopRegion, MidiNoteEvent, PATCH_MODEL_VERSION, RENDER_PLAN_VERSION, RenderPlanRevision,
        TICKS_PER_QUARTER, TempoPoint,
    };

    use super::*;

    fn test_plan() -> RenderPlan {
        let patch = BassPatchV1 {
            patch_model_version: PATCH_MODEL_VERSION,
            oscillator: BassOscillatorPatchV1 {
                detune_cents: 0.0,
                sub_level: 0.5,
            },
            filter: BassFilterPatchV1 {
                cutoff_hz: 500.0,
                envelope_amount: 0.4,
                resonance: 0.2,
            },
            amplifier: BassAmplifierPatchV1 {
                attack_ms: 5.0,
                decay_ms: 100.0,
                release_ms: 200.0,
                sustain: 0.7,
            },
            drive: 0.1,
            stereo_width: 0.2,
            output_gain: 0.8,
        };
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.scheduler".to_owned(),
            project_revision: RenderPlanRevision::new(1),
            ticks_per_quarter: TICKS_PER_QUARTER,
            tempo_map: vec![TempoPoint {
                tick: 0,
                micro_bpm: 120_000_000,
            }],
            loop_region: LoopRegion {
                enabled: false,
                start_tick: 0,
                end_tick: 3_840,
            },
            layers: vec![BassLayerPlan {
                id: "layer.bass".to_owned(),
                gain: 1.0,
                pan: 0.0,
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
    fn rejects_more_than_the_bounded_actions_at_one_sample() {
        let mut plan = test_plan();
        plan.layers[0].events = (0..=MAX_ACTIONS_PER_BLOCK)
            .map(|index| MidiNoteEvent {
                id: format!("note.{index:04}"),
                start_tick: 0,
                duration_ticks: 960,
                pitch: 36,
                velocity: 100,
            })
            .collect();
        assert_eq!(
            PreparedPlan::prepare(plan, 48_000, 3),
            Err(PreparedPlanError::LimitExceeded)
        );
    }
}
