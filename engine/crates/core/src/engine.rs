use tiempio_engine_dsp::{DspConfiguration, LinearSmoother, OutputGuard, StereoFrame, clear_block};

use crate::{BassPatchV1, PreparedActionKind, PreparedPlan, TempoError};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum VoiceIdentity {
    Scheduled {
        generation: u64,
        layer_index: usize,
        event_index: usize,
    },
    Audition(u64),
}

#[derive(Clone, Copy, Debug)]
pub struct VoiceStart<'a> {
    pub identity: VoiceIdentity,
    pub pitch: u8,
    pub velocity: u8,
    pub patch: &'a BassPatchV1,
    pub layer_gain: f64,
    pub layer_pan: f64,
    pub started_at: u64,
}

pub trait VoiceBank {
    fn note_on(&mut self, start: VoiceStart<'_>);
    fn note_off(&mut self, identity: VoiceIdentity, released_at: u64);
    fn reset_scheduled(&mut self);
    fn reset_all(&mut self);
    fn render_frame(&mut self) -> StereoFrame;
    fn active_voice_count(&self) -> usize;
    fn voice_steal_count(&self) -> u64;
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum TransportState {
    #[default]
    Stopped,
    Playing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EngineControlError {
    ConfigurationMismatch,
    InvalidLoop,
    NoActivePlan,
    StalePlan,
    Tempo(TempoError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PlanAcknowledgement {
    pub project_revision: u64,
    pub plan_generation: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct EngineHealthSnapshot {
    pub rendered_blocks: u64,
    pub rendered_frames: u64,
    pub plan_swaps: u64,
    pub invalid_blocks: u64,
    pub active_voices: usize,
    pub voice_steals: u64,
    pub non_finite_replacements: u64,
    pub ceiling_clamps: u64,
}

#[derive(Clone, Copy, Debug, Default)]
struct LoopPlayback {
    enabled: bool,
    start_sample: u64,
    end_sample: u64,
}

#[derive(Clone, Copy, Debug, Default)]
struct Transport {
    state: TransportState,
    sample_position: u64,
    action_cursor: usize,
    beat_cursor: usize,
    loop_playback: LoopPlayback,
}

impl Transport {
    fn activate(&mut self, plan: &PreparedPlan) {
        self.state = TransportState::Stopped;
        self.sample_position = 0;
        self.action_cursor = 0;
        self.beat_cursor = 0;
        self.loop_playback = LoopPlayback {
            enabled: plan.plan().loop_region.enabled,
            start_sample: plan.loop_start_sample(),
            end_sample: plan.loop_end_sample(),
        };
    }

    fn set_position(&mut self, plan: &PreparedPlan, sample_position: u64) {
        self.sample_position = sample_position;
        self.action_cursor = plan.action_cursor_at(sample_position);
        self.beat_cursor = plan.beat_cursor_at(sample_position);
    }
}

#[derive(Clone, Copy, Debug)]
struct MetronomeClick {
    enabled: bool,
    volume: f64,
    phase: f64,
    phase_increment: f64,
    remaining_frames: u32,
    total_frames: u32,
    amplitude: f64,
}

impl MetronomeClick {
    fn new(sample_rate: u32) -> Self {
        Self {
            enabled: false,
            volume: 0.65,
            phase: 0.0,
            phase_increment: std::f64::consts::TAU * 1_320.0 / f64::from(sample_rate),
            remaining_frames: 0,
            total_frames: (sample_rate / 55).max(1),
            amplitude: 0.0,
        }
    }

    fn trigger(&mut self, downbeat: bool, sample_rate: u32) {
        if !self.enabled {
            return;
        }
        let frequency = if downbeat { 1_760.0 } else { 1_320.0 };
        self.phase = std::f64::consts::FRAC_PI_2;
        self.phase_increment = std::f64::consts::TAU * frequency / f64::from(sample_rate);
        self.remaining_frames = self.total_frames;
        self.amplitude = if downbeat { 0.22 } else { 0.14 };
    }

    fn next_sample(&mut self) -> f64 {
        if self.remaining_frames == 0 {
            return 0.0;
        }
        let envelope = f64::from(self.remaining_frames) / f64::from(self.total_frames);
        let sample = self.phase.sin() * self.amplitude * self.volume * envelope * envelope;
        self.phase += self.phase_increment;
        self.remaining_frames -= 1;
        sample
    }

    fn reset(&mut self) {
        self.remaining_frames = 0;
        self.amplitude = 0.0;
    }
}

pub struct EngineKernel<Bank: VoiceBank> {
    configuration: DspConfiguration,
    plans: [Option<PreparedPlan>; 2],
    active_slot: Option<usize>,
    pending_slot: Option<usize>,
    highest_generation: Option<u64>,
    highest_revision: Option<u64>,
    transport: Transport,
    voice_bank: Bank,
    metronome: MetronomeClick,
    master_gain: LinearSmoother,
    output_guard: OutputGuard,
    render_clock: u64,
    health: EngineHealthSnapshot,
    pending_acknowledgement: Option<PlanAcknowledgement>,
}

impl<Bank: VoiceBank> EngineKernel<Bank> {
    #[must_use]
    pub fn new(configuration: DspConfiguration, voice_bank: Bank) -> Self {
        let sample_rate = configuration.sample_rate();
        Self {
            configuration,
            plans: [None, None],
            active_slot: None,
            pending_slot: None,
            highest_generation: None,
            highest_revision: None,
            transport: Transport::default(),
            voice_bank,
            metronome: MetronomeClick::new(sample_rate),
            master_gain: LinearSmoother::new(1.0),
            output_guard: OutputGuard::new(),
            render_clock: 0,
            health: EngineHealthSnapshot::default(),
            pending_acknowledgement: None,
        }
    }

    /// Publishes a prepared plan into the inactive slot for the next block boundary.
    ///
    /// # Errors
    ///
    /// Returns a stable error for sample-rate mismatch or a stale generation/revision.
    pub fn publish_plan(&mut self, plan: PreparedPlan) -> Result<(), EngineControlError> {
        self.publish_plan_reclaiming(plan).map(|_| ())
    }

    /// Publishes a prepared plan and returns storage retired from the inactive slot.
    ///
    /// This is the native-host boundary for real-time-safe plan exchange: the audio callback can
    /// move the retired allocation into a bounded reclamation queue so it is dropped later on the
    /// control thread.
    ///
    /// # Errors
    ///
    /// Returns a stable error for sample-rate mismatch or a stale generation/revision.
    pub fn publish_plan_reclaiming(
        &mut self,
        plan: PreparedPlan,
    ) -> Result<Option<PreparedPlan>, EngineControlError> {
        let revision = plan.plan().project_revision.value();
        if plan.timeline().sample_rate() != self.configuration.sample_rate() {
            return Err(EngineControlError::ConfigurationMismatch);
        }
        if self
            .highest_generation
            .is_some_and(|generation| plan.generation() <= generation)
            || self
                .highest_revision
                .is_some_and(|accepted| revision <= accepted)
        {
            return Err(EngineControlError::StalePlan);
        }
        let slot = match self.active_slot {
            Some(0) => 1,
            Some(_) => 0,
            None => self.pending_slot.unwrap_or(0),
        };
        let retired = self.plans[slot].take();
        self.plans[slot] = Some(plan);
        self.pending_slot = Some(slot);
        self.highest_generation = self.plans[slot].as_ref().map(PreparedPlan::generation);
        self.highest_revision = Some(revision);
        Ok(retired)
    }

    /// Starts scheduled playback at an absolute musical tick.
    ///
    /// # Errors
    ///
    /// Returns a stable error when no plan is active or tick conversion fails.
    pub fn play(&mut self, start_tick: u64) -> Result<(), EngineControlError> {
        let slot = self.active_slot.ok_or(EngineControlError::NoActivePlan)?;
        let plan = self.plans[slot]
            .as_ref()
            .ok_or(EngineControlError::NoActivePlan)?;
        let sample = plan
            .timeline()
            .tick_to_sample(start_tick)
            .map_err(EngineControlError::Tempo)?;
        self.transport.set_position(plan, sample);
        self.metronome.reset();
        self.transport.state = TransportState::Playing;
        Ok(())
    }

    pub fn stop(&mut self) {
        self.transport.state = TransportState::Stopped;
        self.voice_bank.reset_scheduled();
        self.metronome.reset();
    }

    /// Seeks scheduled playback without changing stopped/playing state.
    ///
    /// # Errors
    ///
    /// Returns a stable error when no plan is active or tick conversion fails.
    pub fn seek(&mut self, tick: u64) -> Result<(), EngineControlError> {
        let slot = self.active_slot.ok_or(EngineControlError::NoActivePlan)?;
        let plan = self.plans[slot]
            .as_ref()
            .ok_or(EngineControlError::NoActivePlan)?;
        let sample = plan
            .timeline()
            .tick_to_sample(tick)
            .map_err(EngineControlError::Tempo)?;
        self.voice_bank.reset_scheduled();
        self.metronome.reset();
        self.transport.set_position(plan, sample);
        Ok(())
    }

    /// Overrides loop playback bounds for the active plan.
    ///
    /// # Errors
    ///
    /// Returns a stable error for missing plan, invalid bounds or tempo conversion failure.
    pub fn set_loop(
        &mut self,
        enabled: bool,
        start_tick: u64,
        end_tick: u64,
    ) -> Result<(), EngineControlError> {
        if start_tick >= end_tick {
            return Err(EngineControlError::InvalidLoop);
        }
        let plan = self.active_plan().ok_or(EngineControlError::NoActivePlan)?;
        let start_sample = plan
            .timeline()
            .tick_to_sample(start_tick)
            .map_err(EngineControlError::Tempo)?;
        let end_sample = plan
            .timeline()
            .tick_to_sample(end_tick)
            .map_err(EngineControlError::Tempo)?;
        self.transport.loop_playback = LoopPlayback {
            enabled,
            start_sample,
            end_sample,
        };
        Ok(())
    }

    pub fn note_on_audition(
        &mut self,
        identifier: u64,
        pitch: u8,
        velocity: u8,
        voice_patch: &BassPatchV1,
    ) {
        self.voice_bank.note_on(VoiceStart {
            identity: VoiceIdentity::Audition(identifier),
            pitch,
            velocity,
            patch: voice_patch,
            layer_gain: 1.0,
            layer_pan: 0.0,
            started_at: self.render_clock,
        });
    }

    pub fn note_off_audition(&mut self, identifier: u64) {
        self.voice_bank
            .note_off(VoiceIdentity::Audition(identifier), self.render_clock);
    }

    pub fn set_master_gain(&mut self, gain: f64) {
        self.master_gain.set_target(
            gain.clamp(0.0, 2.0),
            10.0,
            self.configuration.sample_rate_hz(),
        );
    }

    pub fn set_metronome_enabled(&mut self, enabled: bool) {
        self.metronome.enabled = enabled;
        if !enabled {
            self.metronome.reset();
        }
    }

    pub fn set_metronome_volume(&mut self, volume: f64) {
        self.metronome.volume = volume.clamp(0.0, 1.0);
    }

    /// Renders one visible stereo block.
    ///
    /// Real-time invariant: after construction and plan preparation, this method performs
    /// no allocation, deallocation, locking, I/O, sorting or unbounded traversal. Plan
    /// publication swaps preallocated slots only at this block boundary; retired plan
    /// storage is replaced later by `publish_plan` outside the callback.
    pub fn render_block(&mut self, output: &mut [StereoFrame]) {
        clear_block(output);
        let rendered_frames = output.len();
        if rendered_frames > self.configuration.block_frames() {
            self.health.invalid_blocks = self.health.invalid_blocks.saturating_add(1);
            return;
        }
        self.activate_pending();
        for frame in &mut *output {
            self.prepare_transport_sample();
            let gain = self.master_gain.advance();
            let mixed = self.voice_bank.render_frame();
            let click = self.metronome.next_sample();
            *frame = self.output_guard.process(StereoFrame::new(
                (mixed.left + click) * gain,
                (mixed.right + click) * gain,
            ));
            if self.transport.state == TransportState::Playing {
                self.transport.sample_position = self.transport.sample_position.saturating_add(1);
            }
            self.render_clock = self.render_clock.saturating_add(1);
        }
        self.health.rendered_blocks = self.health.rendered_blocks.saturating_add(1);
        self.health.rendered_frames = self
            .health
            .rendered_frames
            .saturating_add(u64::try_from(rendered_frames).unwrap_or(u64::MAX));
    }

    #[must_use]
    pub const fn transport_state(&self) -> TransportState {
        self.transport.state
    }

    #[must_use]
    pub const fn transport_sample_position(&self) -> u64 {
        self.transport.sample_position
    }

    #[must_use]
    pub fn transport_tick(&self) -> Option<u64> {
        self.active_plan().and_then(|plan| {
            plan.timeline()
                .sample_to_tick_floor(self.transport.sample_position)
                .ok()
        })
    }

    #[must_use]
    pub fn take_plan_acknowledgement(&mut self) -> Option<PlanAcknowledgement> {
        self.pending_acknowledgement.take()
    }

    #[must_use]
    pub fn health_snapshot(&self) -> EngineHealthSnapshot {
        EngineHealthSnapshot {
            active_voices: self.voice_bank.active_voice_count(),
            voice_steals: self.voice_bank.voice_steal_count(),
            non_finite_replacements: self.output_guard.non_finite_replacements(),
            ceiling_clamps: self.output_guard.ceiling_clamps(),
            ..self.health
        }
    }

    pub fn shutdown(&mut self) {
        self.transport.state = TransportState::Stopped;
        self.voice_bank.reset_all();
    }

    fn active_plan(&self) -> Option<&PreparedPlan> {
        self.active_slot
            .and_then(|slot| self.plans.get(slot))
            .and_then(Option::as_ref)
    }

    fn activate_pending(&mut self) {
        let Some(slot) = self.pending_slot.take() else {
            return;
        };
        let Some(plan) = self.plans[slot].as_ref() else {
            self.health.invalid_blocks = self.health.invalid_blocks.saturating_add(1);
            return;
        };
        self.active_slot = Some(slot);
        self.transport.activate(plan);
        self.voice_bank.reset_scheduled();
        self.metronome.reset();
        self.pending_acknowledgement = Some(PlanAcknowledgement {
            project_revision: plan.plan().project_revision.value(),
            plan_generation: plan.generation(),
        });
        self.health.plan_swaps = self.health.plan_swaps.saturating_add(1);
    }

    fn prepare_transport_sample(&mut self) {
        if self.transport.state != TransportState::Playing {
            return;
        }
        let Some(slot) = self.active_slot else {
            return;
        };
        let Some(plan) = self.plans[slot].as_ref() else {
            self.transport.state = TransportState::Stopped;
            self.health.invalid_blocks = self.health.invalid_blocks.saturating_add(1);
            return;
        };
        if self.transport.loop_playback.enabled
            && self.transport.sample_position >= self.transport.loop_playback.end_sample
        {
            let loop_start = self.transport.loop_playback.start_sample;
            self.voice_bank.reset_scheduled();
            self.metronome.reset();
            self.transport.set_position(plan, loop_start);
        }
        while let Some(action) = plan.actions().get(self.transport.action_cursor) {
            if action.sample_position != self.transport.sample_position {
                break;
            }
            let layer = &plan.plan().layers[action.layer_index];
            let event = &layer.events[action.event_index];
            let identity = VoiceIdentity::Scheduled {
                generation: plan.generation(),
                layer_index: action.layer_index,
                event_index: action.event_index,
            };
            match action.kind {
                PreparedActionKind::NoteOff => {
                    self.voice_bank.note_off(identity, self.render_clock);
                }
                PreparedActionKind::NoteOn => self.voice_bank.note_on(VoiceStart {
                    identity,
                    pitch: event.pitch,
                    velocity: event.velocity,
                    patch: &layer.patch,
                    layer_gain: layer.gain,
                    layer_pan: layer.pan,
                    started_at: self.render_clock,
                }),
            }
            self.transport.action_cursor += 1;
        }
        while let Some(beat) = plan.beats().get(self.transport.beat_cursor) {
            if beat.sample_position != self.transport.sample_position {
                break;
            }
            self.metronome
                .trigger(beat.downbeat, self.configuration.sample_rate());
            self.transport.beat_cursor += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BassAmplifierPatchV1, BassFilterPatchV1, BassLayerPlan, BassOscillatorPatchV1, BassPatchV1,
        LoopRegion, MeterPoint, MidiNoteEvent, PATCH_MODEL_VERSION, RENDER_PLAN_VERSION,
        RenderPlan, RenderPlanRevision, TICKS_PER_QUARTER, TempoPoint,
    };

    #[derive(Default)]
    struct TestVoiceBank {
        scheduled: usize,
        audition: usize,
        resets: u64,
    }

    impl VoiceBank for TestVoiceBank {
        fn note_on(&mut self, start: VoiceStart<'_>) {
            match start.identity {
                VoiceIdentity::Scheduled { .. } => self.scheduled += 1,
                VoiceIdentity::Audition(_) => self.audition += 1,
            }
        }

        fn note_off(&mut self, identity: VoiceIdentity, _released_at: u64) {
            match identity {
                VoiceIdentity::Scheduled { .. } => {
                    self.scheduled = self.scheduled.saturating_sub(1);
                }
                VoiceIdentity::Audition(_) => {
                    self.audition = self.audition.saturating_sub(1);
                }
            }
        }

        fn reset_scheduled(&mut self) {
            self.scheduled = 0;
            self.resets += 1;
        }

        fn reset_all(&mut self) {
            self.scheduled = 0;
            self.audition = 0;
        }

        fn render_frame(&mut self) -> StereoFrame {
            if self.active_voice_count() > 0 {
                StereoFrame::mono(0.25)
            } else {
                StereoFrame::default()
            }
        }

        fn active_voice_count(&self) -> usize {
            self.scheduled + self.audition
        }

        fn voice_steal_count(&self) -> u64 {
            0
        }
    }

    fn test_patch() -> BassPatchV1 {
        BassPatchV1 {
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
                attack_ms: 0.0,
                decay_ms: 0.0,
                release_ms: 1.0,
                sustain: 1.0,
            },
            drive: 0.0,
            stereo_width: 0.0,
            output_gain: 1.0,
        }
    }

    fn test_plan() -> RenderPlan {
        test_plan_with_revision(1)
    }

    fn test_plan_with_revision(revision: u64) -> RenderPlan {
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.kernel".to_owned(),
            project_revision: RenderPlanRevision::new(revision),
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
            layers: vec![BassLayerPlan {
                id: "layer.bass".to_owned(),
                gain: 1.0,
                pan: 0.0,
                patch: test_patch(),
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
    fn swaps_at_a_block_boundary_and_renders_without_resizing_output() {
        let configuration = DspConfiguration::new(48_000, 128).expect("valid config");
        let prepared = PreparedPlan::prepare(test_plan(), 48_000, 1).expect("valid plan");
        let mut engine = EngineKernel::new(configuration, TestVoiceBank::default());
        engine.publish_plan(prepared).expect("new plan");
        assert_eq!(engine.take_plan_acknowledgement(), None);
        let mut output = [StereoFrame::default(); 128];
        let pointer = output.as_ptr();
        engine.render_block(&mut output);
        assert_eq!(pointer, output.as_ptr());
        assert_eq!(
            engine.take_plan_acknowledgement(),
            Some(PlanAcknowledgement {
                project_revision: 1,
                plan_generation: 1,
            })
        );
        engine.play(0).expect("active plan");
        engine.render_block(&mut output);
        assert!(output.iter().all(|frame| frame.is_finite()));
        assert!(output.iter().any(|frame| frame.left > 0.0));
        assert_eq!(engine.health_snapshot().rendered_blocks, 2);
    }

    #[test]
    fn stop_seek_and_loop_are_bounded_and_do_not_leave_scheduled_voices() {
        let configuration = DspConfiguration::new(48_000, 64).expect("valid config");
        let prepared = PreparedPlan::prepare(test_plan(), 48_000, 1).expect("valid plan");
        let mut engine = EngineKernel::new(configuration, TestVoiceBank::default());
        engine.publish_plan(prepared).expect("new plan");
        engine.render_block(&mut [StereoFrame::default(); 1]);
        engine.note_on_audition(9, 40, 100, &test_patch());
        engine.play(0).expect("active plan");
        engine.render_block(&mut [StereoFrame::default(); 1]);
        assert_eq!(engine.health_snapshot().active_voices, 2);
        engine.stop();
        assert_eq!(engine.health_snapshot().active_voices, 1);
        engine.seek(0).expect("valid seek");
        engine.set_loop(true, 0, 1).expect("valid loop");
        engine.play(0).expect("active plan");
        engine.render_block(&mut [StereoFrame::default(); 32]);
        assert_eq!(engine.transport_sample_position(), 7);
        assert_eq!(engine.health_snapshot().active_voices, 2);
        engine.stop();
        assert_eq!(engine.health_snapshot().active_voices, 1);
        engine.note_off_audition(9);
        assert_eq!(engine.health_snapshot().active_voices, 0);
    }

    #[test]
    fn newest_pending_plan_wins_and_stale_publications_preserve_the_active_plan() {
        let configuration = DspConfiguration::new(48_000, 64).expect("valid config");
        let first =
            PreparedPlan::prepare(test_plan_with_revision(1), 48_000, 1).expect("valid first plan");
        let second = PreparedPlan::prepare(test_plan_with_revision(2), 48_000, 2)
            .expect("valid second plan");
        let mut engine = EngineKernel::new(configuration, TestVoiceBank::default());
        engine.publish_plan(first).expect("first pending plan");
        engine.publish_plan(second).expect("newest pending plan");
        engine.render_block(&mut [StereoFrame::default(); 1]);
        assert_eq!(
            engine.take_plan_acknowledgement(),
            Some(PlanAcknowledgement {
                project_revision: 2,
                plan_generation: 2,
            })
        );

        let stale_revision = PreparedPlan::prepare(test_plan_with_revision(1), 48_000, 3)
            .expect("structurally valid stale revision");
        assert_eq!(
            engine.publish_plan(stale_revision),
            Err(EngineControlError::StalePlan)
        );
        let stale_generation = PreparedPlan::prepare(test_plan_with_revision(3), 48_000, 2)
            .expect("structurally valid stale generation");
        assert_eq!(
            engine.publish_plan(stale_generation),
            Err(EngineControlError::StalePlan)
        );
        engine.render_block(&mut [StereoFrame::default(); 1]);
        assert_eq!(engine.take_plan_acknowledgement(), None);
        assert_eq!(engine.health_snapshot().plan_swaps, 1);
    }

    #[test]
    fn returns_inactive_plan_storage_for_control_thread_reclamation() {
        let configuration = DspConfiguration::new(48_000, 64).expect("valid config");
        let mut engine = EngineKernel::new(configuration, TestVoiceBank::default());
        engine
            .publish_plan(PreparedPlan::prepare(test_plan_with_revision(1), 48_000, 1).unwrap())
            .unwrap();
        engine.render_block(&mut [StereoFrame::default(); 1]);
        engine
            .publish_plan(PreparedPlan::prepare(test_plan_with_revision(2), 48_000, 2).unwrap())
            .unwrap();
        engine.render_block(&mut [StereoFrame::default(); 1]);
        let retired = engine
            .publish_plan_reclaiming(
                PreparedPlan::prepare(test_plan_with_revision(3), 48_000, 3).unwrap(),
            )
            .unwrap()
            .expect("inactive plan storage is returned");
        assert_eq!(retired.plan().project_revision.value(), 1);
    }

    #[test]
    fn metronome_clicks_are_bounded_and_reset_on_stop_seek_and_restart() {
        let configuration = DspConfiguration::new(48_000, 64).expect("valid config");
        let mut plan = test_plan();
        plan.layers.clear();
        let prepared = PreparedPlan::prepare(plan, 48_000, 1).expect("valid plan");
        let mut engine = EngineKernel::new(configuration, TestVoiceBank::default());
        engine.publish_plan(prepared).expect("new plan");
        engine.render_block(&mut [StereoFrame::default(); 1]);
        engine.set_metronome_enabled(true);
        engine.set_metronome_volume(1.0);

        engine.play(0).expect("active plan");
        let mut downbeat = [StereoFrame::default(); 1];
        engine.render_block(&mut downbeat);
        assert!(downbeat[0].left > 0.2 && downbeat[0].left <= 0.22);
        assert!((downbeat[0].left - downbeat[0].right).abs() < f64::EPSILON);

        engine.stop();
        let mut stopped = [StereoFrame::mono(1.0); 8];
        engine.render_block(&mut stopped);
        assert_eq!(stopped, [StereoFrame::default(); 8]);

        engine.seek(960).expect("valid seek");
        engine.play(960).expect("active plan");
        let mut ordinary = [StereoFrame::default(); 1];
        engine.render_block(&mut ordinary);
        assert!(ordinary[0].left > 0.1 && ordinary[0].left <= 0.14);

        engine.stop();
        engine.play(0).expect("active plan");
        let mut restarted = [StereoFrame::default(); 1];
        engine.render_block(&mut restarted);
        assert_eq!(restarted, downbeat);
        assert!(restarted.iter().all(|frame| frame.is_finite()));
    }
}
