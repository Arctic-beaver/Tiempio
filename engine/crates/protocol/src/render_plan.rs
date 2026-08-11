use serde_json::Value;
use tiempio_engine_core::{
    DrumAlgorithm, DrumHitEvent, DrumInstrument, DrumKitPatchV2, DrumVoicePatchV2,
    InstrumentLayerPlan, LayerSource, LoopRegion, MeterPoint, MidiNoteEvent, RenderPlan,
    RenderPlanRevision, SynthAmplifierPatchV2, SynthFilterPatchV2, SynthMovementPatchV2,
    SynthOscillatorPatchV2, SynthPatchV2, SynthWaveform, TempoPoint, validate_render_plan,
};

use crate::validation::parse_payload;
use crate::{
    ProtocolDiagnostic, ProtocolError, WireDrumHit, WireDrumSource, WireDrumVoicePatchV2,
    WireMidiNote, WireRenderPlan, WireSynthSource,
};

fn unsupported(message: &str) -> ProtocolError {
    ProtocolError::new(ProtocolDiagnostic::UnsupportedSource, message)
}

fn synth_waveform(value: &str) -> Result<SynthWaveform, ProtocolError> {
    match value {
        "saw" => Ok(SynthWaveform::Saw),
        "square" => Ok(SynthWaveform::Square),
        "triangle" => Ok(SynthWaveform::Triangle),
        "sine" => Ok(SynthWaveform::Sine),
        _ => Err(unsupported("Synth waveform is unsupported.")),
    }
}

fn drum_instrument(value: &str) -> Result<DrumInstrument, ProtocolError> {
    match value {
        "kick" => Ok(DrumInstrument::Kick),
        "clap" => Ok(DrumInstrument::Clap),
        "closedHat" => Ok(DrumInstrument::ClosedHat),
        "openHat" => Ok(DrumInstrument::OpenHat),
        "perc" => Ok(DrumInstrument::Perc),
        _ => Err(unsupported("Drum instrument is unsupported.")),
    }
}

fn drum_algorithm(value: &str) -> Result<DrumAlgorithm, ProtocolError> {
    match value {
        "kick" => Ok(DrumAlgorithm::Kick),
        "clap" => Ok(DrumAlgorithm::Clap),
        "closed-hat" => Ok(DrumAlgorithm::ClosedHat),
        "open-hat" => Ok(DrumAlgorithm::OpenHat),
        "perc" => Ok(DrumAlgorithm::Perc),
        _ => Err(unsupported("Drum algorithm is unsupported.")),
    }
}

fn drum_voice(wire: &WireDrumVoicePatchV2) -> Result<DrumVoicePatchV2, ProtocolError> {
    Ok(DrumVoicePatchV2 {
        algorithm: drum_algorithm(&wire.algorithm)?,
        pitch_hz: wire.pitch_hz,
        tone: wire.tone,
        decay_ms: wire.decay_ms,
        noise: wire.noise,
        drive: wire.drive,
        gain: wire.gain,
    })
}

fn convert_synth_layer(
    layer_id: String,
    gain: f64,
    pan: f64,
    source_value: &Value,
    event_values: Vec<Value>,
) -> Result<InstrumentLayerPlan, ProtocolError> {
    let source: WireSynthSource = parse_payload(source_value, "Synth source")?;
    let patch = source.patch;
    let mut events = Vec::with_capacity(event_values.len());
    for value in event_values {
        let event: WireMidiNote = parse_payload(&value, "MIDI note")?;
        events.push(MidiNoteEvent {
            id: event.id,
            start_tick: event.start_tick,
            duration_ticks: event.duration_ticks,
            pitch: event.pitch,
            velocity: event.velocity,
        });
    }
    Ok(InstrumentLayerPlan {
        id: layer_id,
        gain,
        pan,
        source: LayerSource::Synth {
            patch: SynthPatchV2 {
                patch_model_version: patch.patch_model_version,
                oscillator: SynthOscillatorPatchV2 {
                    waveform: synth_waveform(&patch.oscillator.waveform)?,
                    detune_cents: patch.oscillator.detune_cents,
                    sub_level: patch.oscillator.sub_level,
                    noise_level: patch.oscillator.noise_level,
                    pulse_width: patch.oscillator.pulse_width,
                },
                filter: SynthFilterPatchV2 {
                    cutoff_hz: patch.filter.cutoff_hz,
                    envelope_amount: patch.filter.envelope_amount,
                    resonance: patch.filter.resonance,
                },
                amplifier: SynthAmplifierPatchV2 {
                    attack_ms: patch.amplifier.attack_ms,
                    decay_ms: patch.amplifier.decay_ms,
                    release_ms: patch.amplifier.release_ms,
                    sustain: patch.amplifier.sustain,
                },
                movement: SynthMovementPatchV2 {
                    rate_hz: patch.movement.rate_hz,
                    depth: patch.movement.depth,
                },
                drive: patch.drive,
                stereo_width: patch.stereo_width,
                output_gain: patch.output_gain,
            },
            events,
        },
    })
}

fn convert_drum_layer(
    layer_id: String,
    gain: f64,
    pan: f64,
    source_value: &Value,
    event_values: Vec<Value>,
) -> Result<InstrumentLayerPlan, ProtocolError> {
    let source: WireDrumSource = parse_payload(source_value, "Drum source")?;
    let voices = source.patch.voices;
    let mut events = Vec::with_capacity(event_values.len());
    for value in event_values {
        let event: WireDrumHit = parse_payload(&value, "Drum hit")?;
        events.push(DrumHitEvent {
            id: event.id,
            start_tick: event.start_tick,
            swing_ticks: event.swing_ticks,
            instrument: drum_instrument(&event.instrument)?,
            velocity: event.velocity,
        });
    }
    Ok(InstrumentLayerPlan {
        id: layer_id,
        gain,
        pan,
        source: LayerSource::Drums {
            patch: DrumKitPatchV2 {
                patch_model_version: source.patch.patch_model_version,
                kick: drum_voice(&voices.kick)?,
                clap: drum_voice(&voices.clap)?,
                closed_hat: drum_voice(&voices.closed_hat)?,
                open_hat: drum_voice(&voices.open_hat)?,
                perc: drum_voice(&voices.perc)?,
            },
            events,
        },
    })
}

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
        layers.push(match source_type {
            "subtractive-synth" => {
                convert_synth_layer(layer.id, layer.gain, layer.pan, &layer.source, layer.events)?
            }
            "procedural-drums" => {
                convert_drum_layer(layer.id, layer.gain, layer.pan, &layer.source, layer.events)?
            }
            _ => return Err(unsupported("Engine source type is unsupported.")),
        });
    }
    let plan = RenderPlan {
        plan_version: wire.plan_version,
        project_id: wire.project_id,
        project_revision: RenderPlanRevision::new(wire.project_revision),
        ticks_per_quarter: wire.ticks_per_quarter,
        end_tick: wire.end_tick,
        tempo_map: wire
            .tempo_map
            .into_iter()
            .map(|point| TempoPoint {
                tick: point.tick,
                micro_bpm: point.micro_bpm,
            })
            .collect(),
        meter_map: wire
            .meter_map
            .into_iter()
            .map(|point| MeterPoint {
                tick: point.tick,
                numerator: point.numerator,
                denominator: point.denominator,
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

    const VALID_DRUM_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/unsupported-drum-plan.json");
    const VALID_SYNTH_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/valid-bass-plan.json");

    #[test]
    fn consumes_the_shared_cross_language_render_plan_fixtures() {
        let synth_wire: WireRenderPlan = serde_json::from_str(VALID_SYNTH_PLAN).unwrap();
        let synth_plan = convert_render_plan(synth_wire).unwrap();
        assert_eq!(synth_plan.project_revision.value(), 7);
        assert!(matches!(
            synth_plan.layers[0].source,
            LayerSource::Synth { .. }
        ));

        let drum_wire: WireRenderPlan = serde_json::from_str(VALID_DRUM_PLAN).unwrap();
        let drum_plan = convert_render_plan(drum_wire).unwrap();
        assert!(matches!(
            drum_plan.layers[0].source,
            LayerSource::Drums { .. }
        ));
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
            crate::ENGINE_PROTOCOL_MAX_METER_POINTS,
            tiempio_engine_core::MAX_METER_POINTS
        );
        assert_eq!(
            crate::ENGINE_PROTOCOL_MAX_MUSICAL_EVENTS,
            tiempio_engine_core::MAX_MUSICAL_EVENTS
        );
        assert_eq!(
            crate::ENGINE_PROTOCOL_MAX_PREPARED_BEATS,
            tiempio_engine_core::MAX_PREPARED_BEATS
        );
    }
}
