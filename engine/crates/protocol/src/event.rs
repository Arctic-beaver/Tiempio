use std::collections::BTreeSet;

use serde::Serialize;
use serde_json::Value;

use crate::validation::{valid_identifier, wire_safe};
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
        assert_eq!(
            body,
            br#"{"payload":{"planGeneration":2,"projectRevision":7},"protocolVersion":1,"sequence":3,"type":"render-plan-acknowledged"}"#
        );
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["protocolVersion"], ENGINE_PROTOCOL_VERSION);
        assert_eq!(value["sequence"], 3);
        assert_eq!(value["type"], "render-plan-acknowledged");
        assert_eq!(value["payload"]["projectRevision"], 7);
    }
}
