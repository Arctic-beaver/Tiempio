use allocation_counter::measure;
use tiempio_engine_core::{
    BassAmplifierPatchV1, BassFilterPatchV1, BassLayerPlan, BassOscillatorPatchV1, BassPatchV1,
    EngineKernel, LoopRegion, MidiNoteEvent, PATCH_MODEL_VERSION, PreparedPlan,
    RENDER_PLAN_VERSION, RenderPlan, RenderPlanRevision, TICKS_PER_QUARTER, TempoPoint,
};
use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_synth::BassVoicePool;

fn patch() -> BassPatchV1 {
    BassPatchV1 {
        patch_model_version: PATCH_MODEL_VERSION,
        oscillator: BassOscillatorPatchV1 {
            detune_cents: -3.0,
            sub_level: 0.75,
        },
        filter: BassFilterPatchV1 {
            cutoff_hz: 340.0,
            envelope_amount: 0.42,
            resonance: 0.34,
        },
        amplifier: BassAmplifierPatchV1 {
            attack_ms: 2.0,
            decay_ms: 30.0,
            release_ms: 40.0,
            sustain: 0.7,
        },
        drive: 0.08,
        stereo_width: 0.03,
        output_gain: 0.7,
    }
}

fn plan(revision: u64) -> RenderPlan {
    RenderPlan {
        plan_version: RENDER_PLAN_VERSION,
        project_id: "project.realtime-harness".to_owned(),
        project_revision: RenderPlanRevision::new(revision),
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
            patch: patch(),
            events: vec![MidiNoteEvent {
                id: "note.one".to_owned(),
                start_tick: 0,
                duration_ticks: 1_920,
                pitch: 36,
                velocity: 100,
            }],
        }],
    }
}

#[test]
fn warmed_render_callback_and_plan_swap_do_not_allocate_or_deallocate() {
    let configuration = DspConfiguration::new(48_000, 128).expect("valid configuration");
    let first = PreparedPlan::prepare(plan(1), 48_000, 1).expect("valid first plan");
    let second = PreparedPlan::prepare(plan(2), 48_000, 2).expect("valid second plan");
    let mut engine = EngineKernel::new(configuration, BassVoicePool::new(configuration));
    let mut output = [StereoFrame::default(); 128];

    engine.publish_plan(first).expect("first plan");
    engine.render_block(&mut output);
    engine.play(0).expect("active first plan");
    engine.render_block(&mut output);
    engine.note_on_audition(9, 43, 100, &patch());
    engine.publish_plan(second).expect("pending second plan");

    let output_pointer = output.as_ptr();
    let allocation = measure(|| {
        for _ in 0..64 {
            engine.render_block(&mut output);
            std::hint::black_box(output[0]);
        }
    });

    assert_eq!(output_pointer, output.as_ptr());
    assert_eq!(allocation.count_total, 0);
    assert_eq!(allocation.count_current, 0);
    assert_eq!(allocation.bytes_total, 0);
    assert_eq!(allocation.bytes_current, 0);
    assert_eq!(
        engine
            .take_plan_acknowledgement()
            .expect("plan activated at the measured block boundary")
            .project_revision,
        2
    );
}
