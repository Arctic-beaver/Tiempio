use std::collections::BTreeSet;

use serde::Deserialize;
use serde_json::Value;
use tiempio_engine_core::RenderPlan;

use crate::frame::validate_json_depth;
use crate::render_plan::convert_render_plan;
use crate::validation::{parse_payload, valid_identifier, validate_configuration, wire_safe};
use crate::{
    AudioConfiguration, ENGINE_CAPABILITY_CODES, ENGINE_PROTOCOL_MAX_BATCH_ITEMS,
    ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_MAX_PAYLOAD_BYTES, ENGINE_PROTOCOL_VERSION,
    EmptyPayload, EngineHandshake, HeartbeatPayload, IdentifierPayload, LoopPayload, MacroPayload,
    NoteOnPayload, OfflineRenderPayload, PlayPayload, ProtocolDiagnostic, ProtocolError,
    RawCommandEnvelope, RenderIdentifierPayload, RenderPlanDeltaChange, RenderPlanDeltaPayload,
    TickPayload, WireRenderPlan,
};

#[derive(Clone, Debug, PartialEq)]
pub enum EngineCommand {
    Handshake(EngineHandshake),
    ConfigureAudio(AudioConfiguration),
    StartAudio,
    StopAudio,
    LoadRenderPlan(RenderPlan),
    ApplyRenderPlanDelta(RenderPlanDeltaPayload),
    Play(PlayPayload),
    Stop,
    Seek(TickPayload),
    SetLoop(LoopPayload),
    NoteOn(NoteOnPayload),
    NoteOff(IdentifierPayload),
    PreviewMacro(MacroPayload),
    CommitMacro(MacroPayload),
    RequestDiagnostics,
    RefreshDevices,
    StartOfflineRender {
        render_id: String,
        plan: RenderPlan,
        sample_rate: u32,
        block_frames: u32,
        end_tick: u64,
    },
    CancelOfflineRender(RenderIdentifierPayload),
    Ping(HeartbeatPayload),
    Shutdown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EngineCommandEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub sequence: u64,
    pub command: EngineCommand,
}

fn validate_delta(payload: &RenderPlanDeltaPayload) -> Result<(), ProtocolError> {
    if !wire_safe(payload.base_revision)
        || !wire_safe(payload.target_revision)
        || payload.target_revision <= payload.base_revision
        || payload.changes.len() > ENGINE_PROTOCOL_MAX_BATCH_ITEMS
        || payload.changes.iter().any(|change| match change {
            RenderPlanDeltaChange::LayerGain { layer_id, gain } => {
                !valid_identifier(layer_id) || !gain.is_finite() || !(0.0..=2.0).contains(gain)
            }
            RenderPlanDeltaChange::LayerPan { layer_id, pan } => {
                !valid_identifier(layer_id) || !pan.is_finite() || !(-1.0..=1.0).contains(pan)
            }
        })
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Render-plan delta is invalid.",
        ));
    }
    Ok(())
}

fn validate_loop(payload: &LoopPayload) -> Result<(), ProtocolError> {
    if !wire_safe(payload.start_tick)
        || !wire_safe(payload.end_tick)
        || payload.start_tick >= payload.end_tick
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Loop bounds are invalid.",
        ));
    }
    Ok(())
}

fn validate_note_on(payload: &NoteOnPayload) -> Result<(), ProtocolError> {
    if !valid_identifier(&payload.audition_id)
        || payload.pitch > 127
        || payload.velocity == 0
        || payload.velocity > 127
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Note-on payload is invalid.",
        ));
    }
    Ok(())
}

fn validate_macro(payload: &MacroPayload) -> Result<(), ProtocolError> {
    if !wire_safe(payload.base_revision)
        || !valid_identifier(&payload.layer_id)
        || !matches!(
            payload.r#macro.as_str(),
            "brightness" | "dirt" | "hardness" | "length" | "width"
        )
        || !payload.value.is_finite()
        || !(0.0..=1.0).contains(&payload.value)
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Macro payload is invalid.",
        ));
    }
    Ok(())
}

fn validate_handshake(handshake: &EngineHandshake) -> Result<(), ProtocolError> {
    if handshake.protocol_version != ENGINE_PROTOCOL_VERSION
        || handshake.render_plan_version != tiempio_engine_core::RENDER_PLAN_VERSION
        || handshake.patch_model_version != tiempio_engine_core::PATCH_MODEL_VERSION
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::VersionMismatch,
            "Handshake versions are incompatible.",
        ));
    }
    if handshake.capabilities.len() > ENGINE_PROTOCOL_MAX_BATCH_ITEMS {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Handshake capability list exceeds the configured ceiling.",
        ));
    }
    let mut unique = BTreeSet::new();
    if !handshake.capabilities.iter().all(|capability| {
        valid_identifier(capability)
            && ENGINE_CAPABILITY_CODES.contains(&capability.as_str())
            && unique.insert(capability.as_str())
    }) {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Handshake capability list is invalid or duplicated.",
        ));
    }
    Ok(())
}

fn decode_raw_command(body: &[u8]) -> Result<RawCommandEnvelope, ProtocolError> {
    if body.len() > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol body exceeds the configured ceiling.",
        ));
    }
    std::str::from_utf8(body).map_err(|_| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol body is not valid UTF-8.",
        )
    })?;
    validate_json_depth(body)?;
    let raw: RawCommandEnvelope = serde_json::from_slice(body).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("Protocol command JSON is invalid: {error}"),
        )
    })?;
    if raw.protocol_version != ENGINE_PROTOCOL_VERSION {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::VersionMismatch,
            "Protocol command version is incompatible.",
        ));
    }
    if !valid_identifier(&raw.request_id) || raw.sequence > tiempio_engine_core::MAX_SAFE_INTEGER {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol request ID or sequence is invalid.",
        ));
    }
    let payload_bytes = serde_json::to_vec(&raw.payload).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("Protocol payload cannot be measured: {error}"),
        )
    })?;
    if payload_bytes.len() > ENGINE_PROTOCOL_MAX_PAYLOAD_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol payload exceeds the configured ceiling.",
        ));
    }
    Ok(raw)
}

fn decode_plan_command(
    command_type: &str,
    payload_value: &Value,
) -> Result<Option<EngineCommand>, ProtocolError> {
    let command = match command_type {
        "handshake" => {
            let payload: EngineHandshake = parse_payload(payload_value, "Handshake")?;
            validate_handshake(&payload)?;
            EngineCommand::Handshake(payload)
        }
        "configure-audio" => {
            let payload: AudioConfiguration = parse_payload(payload_value, "Configure audio")?;
            validate_configuration(&payload)?;
            EngineCommand::ConfigureAudio(payload)
        }
        "start-audio" => {
            let _: EmptyPayload = parse_payload(payload_value, "Start audio")?;
            EngineCommand::StartAudio
        }
        "stop-audio" => {
            let _: EmptyPayload = parse_payload(payload_value, "Stop audio")?;
            EngineCommand::StopAudio
        }
        "load-render-plan" => {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Payload {
                plan: WireRenderPlan,
            }
            let payload: Payload = parse_payload(payload_value, "Load render plan")?;
            EngineCommand::LoadRenderPlan(convert_render_plan(payload.plan)?)
        }
        "apply-render-plan-delta" => {
            let payload = parse_payload(payload_value, "Apply render-plan delta")?;
            validate_delta(&payload)?;
            EngineCommand::ApplyRenderPlanDelta(payload)
        }
        _ => return Ok(None),
    };
    Ok(Some(command))
}

fn decode_transport_command(
    command_type: &str,
    payload_value: &Value,
) -> Result<Option<EngineCommand>, ProtocolError> {
    let command = match command_type {
        "play" => {
            let payload: PlayPayload = parse_payload(payload_value, "Play")?;
            if !wire_safe(payload.start_tick) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Play tick is invalid.",
                ));
            }
            EngineCommand::Play(payload)
        }
        "stop" => {
            let _: EmptyPayload = parse_payload(payload_value, "Stop")?;
            EngineCommand::Stop
        }
        "seek" => {
            let payload: TickPayload = parse_payload(payload_value, "Seek")?;
            if !wire_safe(payload.tick) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Seek tick is invalid.",
                ));
            }
            EngineCommand::Seek(payload)
        }
        "set-loop" => {
            let payload = parse_payload(payload_value, "Set loop")?;
            validate_loop(&payload)?;
            EngineCommand::SetLoop(payload)
        }
        "note-on" => {
            let payload = parse_payload(payload_value, "Note on")?;
            validate_note_on(&payload)?;
            EngineCommand::NoteOn(payload)
        }
        "note-off" => {
            let payload: IdentifierPayload = parse_payload(payload_value, "Note off")?;
            if !valid_identifier(&payload.audition_id) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Note-off ID is invalid.",
                ));
            }
            EngineCommand::NoteOff(payload)
        }
        _ => return Ok(None),
    };
    Ok(Some(command))
}

fn decode_service_command(
    command_type: &str,
    payload_value: &Value,
) -> Result<Option<EngineCommand>, ProtocolError> {
    let command = match command_type {
        "preview-macro" => {
            let payload = parse_payload(payload_value, "Preview macro")?;
            validate_macro(&payload)?;
            EngineCommand::PreviewMacro(payload)
        }
        "commit-macro" => {
            let payload = parse_payload(payload_value, "Commit macro")?;
            validate_macro(&payload)?;
            EngineCommand::CommitMacro(payload)
        }
        "request-diagnostics" => {
            let _: EmptyPayload = parse_payload(payload_value, "Request diagnostics")?;
            EngineCommand::RequestDiagnostics
        }
        "refresh-devices" => {
            let _: EmptyPayload = parse_payload(payload_value, "Refresh devices")?;
            EngineCommand::RefreshDevices
        }
        "start-offline-render" => {
            let payload: OfflineRenderPayload = parse_payload(payload_value, "Offline render")?;
            validate_configuration(&AudioConfiguration {
                sample_rate: payload.sample_rate,
                block_frames: payload.block_frames,
                channels: 2,
            })?;
            if !valid_identifier(&payload.render_id) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Offline render ID is invalid.",
                ));
            }
            if !wire_safe(payload.end_tick) || payload.end_tick == 0 {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Offline render end tick is invalid.",
                ));
            }
            EngineCommand::StartOfflineRender {
                render_id: payload.render_id,
                plan: convert_render_plan(payload.plan)?,
                sample_rate: payload.sample_rate,
                block_frames: payload.block_frames,
                end_tick: payload.end_tick,
            }
        }
        "cancel-offline-render" => {
            let payload: RenderIdentifierPayload =
                parse_payload(payload_value, "Cancel offline render")?;
            if !valid_identifier(&payload.render_id) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Offline render ID is invalid.",
                ));
            }
            EngineCommand::CancelOfflineRender(payload)
        }
        "ping" => {
            let payload: HeartbeatPayload = parse_payload(payload_value, "Ping")?;
            if !valid_identifier(&payload.heartbeat_id) {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Heartbeat ID is invalid.",
                ));
            }
            EngineCommand::Ping(payload)
        }
        "shutdown" => {
            let _: EmptyPayload = parse_payload(payload_value, "Shutdown")?;
            EngineCommand::Shutdown
        }
        _ => return Ok(None),
    };
    Ok(Some(command))
}

/// Decodes a strict UTF-8 JSON command body into a typed engine command.
///
/// # Errors
///
/// Returns a stable protocol error for malformed, oversized, incompatible or
/// unsupported command data.
pub fn decode_command_body(body: &[u8]) -> Result<EngineCommandEnvelope, ProtocolError> {
    let raw = decode_raw_command(body)?;
    let command = decode_plan_command(&raw.command_type, &raw.payload)?
        .or(decode_transport_command(&raw.command_type, &raw.payload)?)
        .or(decode_service_command(&raw.command_type, &raw.payload)?)
        .ok_or_else(|| {
            ProtocolError::new(
                ProtocolDiagnostic::UnsupportedCommand,
                "Protocol command type is unsupported.",
            )
        })?;
    Ok(EngineCommandEnvelope {
        protocol_version: raw.protocol_version,
        request_id: raw.request_id,
        sequence: raw.sequence,
        command,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command_body(sequence: u64, command_type: &str, payload: &Value) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "requestId": format!("request.{sequence}"),
            "sequence": sequence,
            "type": command_type,
            "payload": payload
        }))
        .unwrap()
    }

    #[test]
    fn decodes_a_strict_compatible_handshake() {
        let body = command_body(
            0,
            "handshake",
            &serde_json::json!({
                "protocolVersion": ENGINE_PROTOCOL_VERSION,
                "peer": "application",
                "renderPlanVersion": 1,
                "patchModelVersion": 1,
                "capabilities": ["protocol.typed-json", "render-plan.full"]
            }),
        );
        let decoded = decode_command_body(&body).unwrap();
        assert!(matches!(decoded.command, EngineCommand::Handshake(_)));
    }

    #[test]
    fn rejects_unknown_fields_and_unsupported_sources() {
        let unknown = command_body(0, "stop", &serde_json::json!({"extra": true}));
        assert_eq!(
            decode_command_body(&unknown).unwrap_err().diagnostic,
            ProtocolDiagnostic::InvalidEnvelope
        );

        let source = serde_json::json!({
            "planVersion": 1,
            "projectId": "project.fixture",
            "projectRevision": 1,
            "ticksPerQuarter": 960,
            "tempoMap": [{"tick": 0, "microBpm": 108_000_000}],
            "loop": {"enabled": false, "startTick": 0, "endTick": 3840},
            "layers": [{
                "id": "layer.drums",
                "gain": 1.0,
                "pan": 0.0,
                "source": {"type": "drum"},
                "events": []
            }]
        });
        let unsupported = command_body(1, "load-render-plan", &serde_json::json!({"plan": source}));
        assert_eq!(
            decode_command_body(&unsupported).unwrap_err().diagnostic,
            ProtocolDiagnostic::UnsupportedSource
        );
    }
}
