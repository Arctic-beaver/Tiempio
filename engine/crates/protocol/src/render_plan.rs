use serde_json::Value;
use tiempio_engine_core::{
    BassAmplifierPatchV1, BassFilterPatchV1, BassLayerPlan, BassOscillatorPatchV1, BassPatchV1,
    LoopRegion, MidiNoteEvent, RenderPlan, RenderPlanRevision, TempoPoint, validate_render_plan,
};

use crate::validation::parse_payload;
use crate::{ProtocolDiagnostic, ProtocolError, WireBassSource, WireRenderPlan};

pub(crate) fn convert_render_plan(wire: WireRenderPlan) -> Result<RenderPlan, ProtocolError> {
    let mut layers = Vec::with_capacity(wire.layers.len());
    for layer in wire.layers {
        let source_type = layer
            .source
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProtocolError::new(
                    ProtocolDiagnostic::InvalidPlan,
                    "Engine source type is missing.",
                )
            })?;
        if source_type != "subtractive-bass" {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::UnsupportedSource,
                "Engine source is not available in Stage 4.",
            ));
        }
        let source: WireBassSource = parse_payload(&layer.source, "Bass source")?;
        let patch = source.patch;
        layers.push(BassLayerPlan {
            id: layer.id,
            gain: layer.gain,
            pan: layer.pan,
            patch: BassPatchV1 {
                patch_model_version: patch.patch_model_version,
                oscillator: BassOscillatorPatchV1 {
                    detune_cents: patch.oscillator.detune_cents,
                    sub_level: patch.oscillator.sub_level,
                },
                filter: BassFilterPatchV1 {
                    cutoff_hz: patch.filter.cutoff_hz,
                    envelope_amount: patch.filter.envelope_amount,
                    resonance: patch.filter.resonance,
                },
                amplifier: BassAmplifierPatchV1 {
                    attack_ms: patch.amplifier.attack_ms,
                    decay_ms: patch.amplifier.decay_ms,
                    release_ms: patch.amplifier.release_ms,
                    sustain: patch.amplifier.sustain,
                },
                drive: patch.drive,
                stereo_width: patch.stereo_width,
                output_gain: patch.output_gain,
            },
            events: layer
                .events
                .into_iter()
                .map(|event| MidiNoteEvent {
                    id: event.id,
                    start_tick: event.start_tick,
                    duration_ticks: event.duration_ticks,
                    pitch: event.pitch,
                    velocity: event.velocity,
                })
                .collect(),
        });
    }
    let plan = RenderPlan {
        plan_version: wire.plan_version,
        project_id: wire.project_id,
        project_revision: RenderPlanRevision::new(wire.project_revision),
        ticks_per_quarter: wire.ticks_per_quarter,
        tempo_map: wire
            .tempo_map
            .into_iter()
            .map(|point| TempoPoint {
                tick: point.tick,
                micro_bpm: point.micro_bpm,
            })
            .collect(),
        loop_region: LoopRegion {
            enabled: wire.loop_region.enabled,
            start_tick: wire.loop_region.start_tick,
            end_tick: wire.loop_region.end_tick,
        },
        layers,
    };
    validate_render_plan(&plan).map_err(|failure| {
        let diagnostic = match failure.code {
            tiempio_engine_core::PlanValidationCode::LimitExceeded => {
                ProtocolDiagnostic::LimitExceeded
            }
            _ => ProtocolDiagnostic::InvalidPlan,
        };
        ProtocolError::new(diagnostic, format!("{}: {}", failure.path, failure.message))
    })?;
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;

    const UNSUPPORTED_DRUM_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/unsupported-drum-plan.json");
    const VALID_BASS_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/valid-bass-plan.json");

    #[test]
    fn consumes_the_shared_cross_language_render_plan_fixtures() {
        let wire: WireRenderPlan = serde_json::from_str(VALID_BASS_PLAN).unwrap();
        let plan = convert_render_plan(wire).unwrap();
        assert_eq!(plan.project_revision.value(), 7);
        assert_eq!(plan.layers.len(), 1);
        assert_eq!(plan.layers[0].events.len(), 2);

        let unsupported: WireRenderPlan = serde_json::from_str(UNSUPPORTED_DRUM_PLAN).unwrap();
        assert_eq!(
            convert_render_plan(unsupported).unwrap_err().diagnostic,
            ProtocolDiagnostic::UnsupportedSource
        );
    }

    #[test]
    fn keeps_generated_protocol_and_core_plan_ceilings_aligned() {
        assert_eq!(
            crate::ENGINE_PROTOCOL_MAX_ENGINE_LAYERS,
            tiempio_engine_core::MAX_ENGINE_LAYERS
        );
        assert_eq!(
            crate::ENGINE_PROTOCOL_MAX_TEMPO_POINTS,
            tiempio_engine_core::MAX_TEMPO_POINTS
        );
        assert_eq!(
            crate::ENGINE_PROTOCOL_MAX_MUSICAL_EVENTS,
            tiempio_engine_core::MAX_MUSICAL_EVENTS
        );
    }
}
