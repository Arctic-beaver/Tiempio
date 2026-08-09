use std::collections::BTreeSet;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tiempio_engine_core::{
    BassAmplifierPatchV1, BassFilterPatchV1, BassLayerPlan, BassOscillatorPatchV1, BassPatchV1,
    LoopRegion, MidiNoteEvent, RenderPlan, RenderPlanRevision, TempoPoint, validate_render_plan,
};

use crate::frame::validate_json_depth;
use crate::{
    ENGINE_CAPABILITY_CODES, ENGINE_DIAGNOSTIC_CODES, ENGINE_PROTOCOL_MAX_ACTIONS_PER_BLOCK,
    ENGINE_PROTOCOL_MAX_BATCH_ITEMS, ENGINE_PROTOCOL_MAX_BLOCK_FRAMES,
    ENGINE_PROTOCOL_MAX_ENGINE_LAYERS, ENGINE_PROTOCOL_MAX_FRAME_BYTES,
    ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES, ENGINE_PROTOCOL_MAX_JSON_DEPTH,
    ENGINE_PROTOCOL_MAX_MUSICAL_EVENTS, ENGINE_PROTOCOL_MAX_OFFLINE_SECONDS,
    ENGINE_PROTOCOL_MAX_PAYLOAD_BYTES, ENGINE_PROTOCOL_MAX_PREPARED_ACTIONS,
    ENGINE_PROTOCOL_MAX_SAMPLE_RATE, ENGINE_PROTOCOL_MAX_TEMPO_POINTS, ENGINE_PROTOCOL_MAX_VOICES,
    ENGINE_PROTOCOL_MIN_SAMPLE_RATE, ENGINE_PROTOCOL_VERSION, ProtocolDiagnostic, ProtocolError,
};

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineHandshake {
    pub protocol_version: u32,
    pub peer: HandshakePeer,
    pub render_plan_version: u32,
    pub patch_model_version: u32,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum HandshakePeer {
    Application,
    NativeHost,
    WebWorklet,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioConfiguration {
    pub sample_rate: u32,
    pub block_frames: u32,
    pub channels: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TickPayload {
    pub tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayPayload {
    pub start_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoopPayload {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteOnPayload {
    pub audition_id: String,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentifierPayload {
    pub audition_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroPayload {
    pub base_revision: u64,
    pub layer_id: String,
    pub r#macro: String,
    pub value: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderPlanDeltaPayload {
    pub base_revision: u64,
    pub target_revision: u64,
    pub changes: Vec<RenderPlanDeltaChange>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RenderPlanDeltaChange {
    LayerGain { layer_id: String, gain: f64 },
    LayerPan { layer_id: String, pan: f64 },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderIdentifierPayload {
    pub render_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfflineRenderPayload {
    pub render_id: String,
    pub plan: WireRenderPlan,
    pub sample_rate: u32,
    pub block_frames: u32,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EmptyPayload {}

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
    Shutdown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EngineCommandEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub sequence: u64,
    pub command: EngineCommand,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawCommandEnvelope {
    protocol_version: u32,
    request_id: String,
    sequence: u64,
    #[serde(rename = "type")]
    command_type: String,
    payload: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireTempoPoint {
    pub tick: u64,
    pub micro_bpm: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireLoop {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassOscillatorPatchV1 {
    pub detune_cents: f64,
    pub sub_level: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassFilterPatchV1 {
    pub cutoff_hz: f64,
    pub envelope_amount: f64,
    pub resonance: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassAmplifierPatchV1 {
    pub attack_ms: f64,
    pub decay_ms: f64,
    pub release_ms: f64,
    pub sustain: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassPatchV1 {
    pub patch_model_version: u32,
    pub oscillator: WireBassOscillatorPatchV1,
    pub filter: WireBassFilterPatchV1,
    pub amplifier: WireBassAmplifierPatchV1,
    pub drive: f64,
    pub stereo_width: f64,
    pub output_gain: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireMidiNote {
    pub id: String,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub patch: WireBassPatchV1,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireBassLayer {
    pub id: String,
    pub gain: f64,
    pub pan: f64,
    pub source: Value,
    pub events: Vec<WireMidiNote>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireRenderPlan {
    pub plan_version: u32,
    pub project_id: String,
    pub project_revision: u64,
    pub ticks_per_quarter: u32,
    pub tempo_map: Vec<WireTempoPoint>,
    #[serde(rename = "loop")]
    pub loop_region: WireLoop,
    pub layers: Vec<WireBassLayer>,
}

fn parse_payload<T: DeserializeOwned>(value: &Value, label: &str) -> Result<T, ProtocolError> {
    T::deserialize(value).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("{label} payload is invalid: {error}"),
        )
    })
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'.' | b'_' | b':' | b'-'))
        })
}

const fn wire_safe(value: u64) -> bool {
    value <= tiempio_engine_core::MAX_SAFE_INTEGER
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

fn convert_render_plan(wire: WireRenderPlan) -> Result<RenderPlan, ProtocolError> {
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

fn validate_configuration(configuration: &AudioConfiguration) -> Result<(), ProtocolError> {
    let sample_rate = usize::try_from(configuration.sample_rate).unwrap_or(usize::MAX);
    let block_frames = usize::try_from(configuration.block_frames).unwrap_or(usize::MAX);
    if !(ENGINE_PROTOCOL_MIN_SAMPLE_RATE..=ENGINE_PROTOCOL_MAX_SAMPLE_RATE).contains(&sample_rate)
        || configuration.block_frames == 0
        || block_frames > ENGINE_PROTOCOL_MAX_BLOCK_FRAMES
        || configuration.channels != 2
    {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Audio configuration is out of range.",
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

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolLimits {
    pub max_frame_bytes: usize,
    pub max_payload_bytes: usize,
    pub max_identifier_bytes: usize,
    pub max_batch_items: usize,
    pub max_json_depth: usize,
    pub max_engine_layers: usize,
    pub max_tempo_points: usize,
    pub max_musical_events: usize,
    pub max_prepared_actions: usize,
    pub max_actions_per_block: usize,
    pub max_voices: usize,
    pub max_block_frames: usize,
    pub min_sample_rate: usize,
    pub max_sample_rate: usize,
    pub max_offline_seconds: usize,
}

impl ProtocolLimits {
    #[must_use]
    pub const fn current() -> Self {
        Self {
            max_frame_bytes: ENGINE_PROTOCOL_MAX_FRAME_BYTES,
            max_payload_bytes: ENGINE_PROTOCOL_MAX_PAYLOAD_BYTES,
            max_identifier_bytes: ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES,
            max_batch_items: ENGINE_PROTOCOL_MAX_BATCH_ITEMS,
            max_json_depth: ENGINE_PROTOCOL_MAX_JSON_DEPTH,
            max_engine_layers: ENGINE_PROTOCOL_MAX_ENGINE_LAYERS,
            max_tempo_points: ENGINE_PROTOCOL_MAX_TEMPO_POINTS,
            max_musical_events: ENGINE_PROTOCOL_MAX_MUSICAL_EVENTS,
            max_prepared_actions: ENGINE_PROTOCOL_MAX_PREPARED_ACTIONS,
            max_actions_per_block: ENGINE_PROTOCOL_MAX_ACTIONS_PER_BLOCK,
            max_voices: ENGINE_PROTOCOL_MAX_VOICES,
            max_block_frames: ENGINE_PROTOCOL_MAX_BLOCK_FRAMES,
            min_sample_rate: ENGINE_PROTOCOL_MIN_SAMPLE_RATE,
            max_sample_rate: ENGINE_PROTOCOL_MAX_SAMPLE_RATE,
            max_offline_seconds: ENGINE_PROTOCOL_MAX_OFFLINE_SECONDS,
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "type", content = "payload", rename_all = "kebab-case")]
pub enum EngineEvent {
    Ready {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
    },
    Capabilities {
        capabilities: Vec<String>,
        limits: ProtocolLimits,
    },
    RenderPlanAcknowledged {
        #[serde(rename = "projectRevision")]
        project_revision: u64,
        #[serde(rename = "planGeneration")]
        plan_generation: u64,
    },
    TransportSnapshot {
        playing: bool,
        #[serde(rename = "projectRevision")]
        project_revision: u64,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
        tick: f64,
    },
    MeterSnapshot {
        #[serde(rename = "leftPeak")]
        left_peak: f64,
        #[serde(rename = "rightPeak")]
        right_peak: f64,
    },
    ActiveDeviceChanged {
        #[serde(rename = "deviceId")]
        device_id: Option<String>,
    },
    MidiCaptured {
        pitch: u8,
        velocity: u8,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
    },
    Diagnostic {
        code: String,
        message: String,
        #[serde(rename = "projectRevision")]
        project_revision: Option<u64>,
    },
    OfflineRenderProgress {
        #[serde(rename = "renderId")]
        render_id: String,
        #[serde(rename = "completedFrames")]
        completed_frames: u64,
        #[serde(rename = "totalFrames")]
        total_frames: u64,
    },
    OfflineRenderCompleted {
        #[serde(rename = "renderId")]
        render_id: String,
        #[serde(rename = "projectRevision")]
        project_revision: u64,
        #[serde(rename = "frameCount")]
        frame_count: u64,
    },
    FatalError {
        code: String,
        message: String,
    },
}

fn validate_event(event: &EngineEvent) -> Result<(), ProtocolError> {
    let valid = match event {
        EngineEvent::Ready { protocol_version } => *protocol_version == ENGINE_PROTOCOL_VERSION,
        EngineEvent::Capabilities {
            capabilities,
            limits,
        } => {
            let mut unique = BTreeSet::new();
            capabilities.len() <= ENGINE_PROTOCOL_MAX_BATCH_ITEMS
                && capabilities.iter().all(|capability| {
                    ENGINE_CAPABILITY_CODES.contains(&capability.as_str())
                        && unique.insert(capability.as_str())
                })
                && *limits == ProtocolLimits::current()
        }
        EngineEvent::RenderPlanAcknowledged {
            project_revision,
            plan_generation,
        } => wire_safe(*project_revision) && wire_safe(*plan_generation),
        EngineEvent::TransportSnapshot {
            project_revision,
            sample_position,
            tick,
            ..
        } => {
            wire_safe(*project_revision)
                && wire_safe(*sample_position)
                && tick.is_finite()
                && (0.0..=9_007_199_254_740_991.0).contains(tick)
        }
        EngineEvent::MeterSnapshot {
            left_peak,
            right_peak,
        } => {
            left_peak.is_finite()
                && right_peak.is_finite()
                && (0.0..=1.0).contains(left_peak)
                && (0.0..=1.0).contains(right_peak)
        }
        EngineEvent::ActiveDeviceChanged { device_id } => {
            device_id.as_deref().is_none_or(valid_identifier)
        }
        EngineEvent::MidiCaptured {
            pitch,
            velocity,
            sample_position,
        } => *pitch <= 127 && (1..=127).contains(velocity) && wire_safe(*sample_position),
        EngineEvent::Diagnostic {
            code,
            project_revision,
            ..
        } => {
            ENGINE_DIAGNOSTIC_CODES.contains(&code.as_str())
                && project_revision.is_none_or(wire_safe)
        }
        EngineEvent::OfflineRenderProgress {
            render_id,
            completed_frames,
            total_frames,
        } => {
            valid_identifier(render_id)
                && wire_safe(*completed_frames)
                && wire_safe(*total_frames)
                && completed_frames <= total_frames
        }
        EngineEvent::OfflineRenderCompleted {
            render_id,
            project_revision,
            frame_count,
        } => valid_identifier(render_id) && wire_safe(*project_revision) && wire_safe(*frame_count),
        EngineEvent::FatalError { code, .. } => ENGINE_DIAGNOSTIC_CODES.contains(&code.as_str()),
    };
    if valid {
        Ok(())
    } else {
        Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol event payload is invalid.",
        ))
    }
}

/// Encodes a validated typed event as one bounded JSON body.
///
/// # Errors
///
/// Returns a stable protocol error for an unsafe sequence, invalid event payload,
/// serialization failure or oversized encoded body.
pub fn encode_event_body(sequence: u64, event: &EngineEvent) -> Result<Vec<u8>, ProtocolError> {
    if sequence > tiempio_engine_core::MAX_SAFE_INTEGER {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidSequence,
            "Protocol event sequence exceeds the cross-language ceiling.",
        ));
    }
    validate_event(event)?;
    let event_value = serde_json::to_value(event).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("Protocol event cannot be serialized: {error}"),
        )
    })?;
    let mut event_object = event_value.as_object().cloned().ok_or_else(|| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol event did not serialize to an object.",
        )
    })?;
    event_object.insert(
        "protocolVersion".to_owned(),
        Value::from(ENGINE_PROTOCOL_VERSION),
    );
    event_object.insert("sequence".to_owned(), Value::from(sequence));
    let body = serde_json::to_vec(&event_object).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("Protocol event cannot be encoded: {error}"),
        )
    })?;
    if body.len() > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol event exceeds the configured ceiling.",
        ));
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    const UNSUPPORTED_DRUM_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/unsupported-drum-plan.json");
    const VALID_BASS_PLAN: &str =
        include_str!("../../../../fixtures/engine-protocol/valid-bass-plan.json");

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

    #[test]
    fn encodes_revision_bound_events() {
        let body = encode_event_body(
            3,
            &EngineEvent::RenderPlanAcknowledged {
                project_revision: 7,
                plan_generation: 2,
            },
        )
        .unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["protocolVersion"], ENGINE_PROTOCOL_VERSION);
        assert_eq!(value["sequence"], 3);
        assert_eq!(value["type"], "render-plan-acknowledged");
        assert_eq!(value["payload"]["projectRevision"], 7);
    }

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
            ENGINE_PROTOCOL_MAX_ENGINE_LAYERS,
            tiempio_engine_core::MAX_ENGINE_LAYERS
        );
        assert_eq!(
            ENGINE_PROTOCOL_MAX_TEMPO_POINTS,
            tiempio_engine_core::MAX_TEMPO_POINTS
        );
        assert_eq!(
            ENGINE_PROTOCOL_MAX_MUSICAL_EVENTS,
            tiempio_engine_core::MAX_MUSICAL_EVENTS
        );
    }
}
