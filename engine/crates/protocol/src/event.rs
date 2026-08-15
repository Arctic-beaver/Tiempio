use std::collections::BTreeSet;

use serde::Serialize;
use serde_json::Value;

use crate::validation::{valid_identifier, wire_safe};
use crate::{
    ENGINE_CAPABILITY_CODES, ENGINE_DIAGNOSTIC_CODES, ENGINE_PROTOCOL_MAX_BATCH_ITEMS,
    ENGINE_PROTOCOL_MAX_BLOCK_FRAMES, ENGINE_PROTOCOL_MAX_FRAME_BYTES,
    ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES, ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE,
    ENGINE_PROTOCOL_MAX_RECORDING_COUNT_IN_BEATS, ENGINE_PROTOCOL_MAX_SAMPLE_RATE,
    ENGINE_PROTOCOL_MIN_SAMPLE_RATE, ENGINE_PROTOCOL_VERSION, ProtocolDiagnostic, ProtocolError,
    ProtocolLimits,
};

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
    PreviewStarted {
        #[serde(rename = "previewId")]
        preview_id: String,
        #[serde(rename = "durationFrames")]
        duration_frames: u64,
    },
    PreviewState {
        #[serde(rename = "previewId")]
        preview_id: String,
        pitches: Vec<u8>,
        active: bool,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
    },
    PreviewEnded {
        #[serde(rename = "previewId")]
        preview_id: String,
        reason: String,
    },
    BrickPreviewStarted {
        #[serde(rename = "previewGeneration")]
        preview_generation: u64,
        #[serde(rename = "renderPlanRevision")]
        render_plan_revision: u64,
        #[serde(rename = "engineFrame")]
        engine_frame: u64,
    },
    BrickPreviewCursor {
        #[serde(rename = "sourceLayerId")]
        source_layer_id: String,
        #[serde(rename = "previewGeneration")]
        preview_generation: u64,
        running: bool,
        #[serde(rename = "localTick")]
        local_tick: u64,
        #[serde(rename = "cycleIteration")]
        cycle_iteration: u64,
        #[serde(rename = "engineFrame")]
        engine_frame: u64,
        #[serde(rename = "renderPlanRevision")]
        render_plan_revision: u64,
    },
    BrickPreviewEnded {
        #[serde(rename = "previewGeneration")]
        preview_generation: u64,
        reason: String,
        #[serde(rename = "engineFrame")]
        engine_frame: u64,
    },
    RecordingState {
        #[serde(rename = "recordingId")]
        recording_id: String,
        state: String,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
        #[serde(rename = "sourceTick")]
        source_tick: u64,
        #[serde(rename = "countInBeatsRemaining")]
        count_in_beats_remaining: u8,
    },
    RecordingInputApplied {
        #[serde(rename = "recordingId")]
        recording_id: String,
        #[serde(rename = "auditionId")]
        audition_id: String,
        phase: String,
        pitch: u8,
        velocity: u8,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
        #[serde(rename = "sourceTick")]
        source_tick: u64,
    },
    RecordingStopped {
        #[serde(rename = "recordingId")]
        recording_id: String,
        reason: String,
        #[serde(rename = "samplePosition")]
        sample_position: u64,
        #[serde(rename = "stopTick")]
        stop_tick: u64,
    },
    AudioDevicesChanged {
        devices: Vec<AudioDeviceDescriptor>,
    },
    ActiveDeviceChanged {
        #[serde(rename = "deviceId")]
        device_id: Option<String>,
    },
    Pong {
        #[serde(rename = "heartbeatId")]
        heartbeat_id: String,
    },
    AudioHealth {
        #[serde(rename = "activeDeviceId")]
        active_device_id: Option<String>,
        #[serde(rename = "activeVoices")]
        active_voices: u64,
        #[serde(rename = "backendState")]
        backend_state: String,
        #[serde(rename = "blockFrames")]
        block_frames: Option<u32>,
        #[serde(rename = "deviceState")]
        device_state: String,
        mode: Option<String>,
        #[serde(rename = "outputMuted")]
        output_muted: bool,
        #[serde(rename = "outputSignalObserved")]
        output_signal_observed: bool,
        #[serde(rename = "projectRevision")]
        project_revision: Option<u64>,
        #[serde(rename = "sampleRate")]
        sample_rate: Option<u32>,
        underruns: u64,
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

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceDescriptor {
    pub id: String,
    pub label: String,
    pub default: bool,
}

fn valid_audio_health(event: &EngineEvent) -> bool {
    let EngineEvent::AudioHealth {
        active_device_id,
        active_voices,
        backend_state,
        block_frames,
        device_state,
        mode,
        project_revision,
        sample_rate,
        underruns,
        ..
    } = event
    else {
        return false;
    };
    active_device_id.as_deref().is_none_or(valid_identifier)
        && wire_safe(*active_voices)
        && matches!(
            backend_state.as_str(),
            "starting" | "ready" | "stopped" | "failed"
        )
        && block_frames
            .is_none_or(|frames| frames > 0 && frames as usize <= ENGINE_PROTOCOL_MAX_BLOCK_FRAMES)
        && matches!(device_state.as_str(), "available" | "unavailable" | "lost")
        && mode
            .as_deref()
            .is_none_or(|value| matches!(value, "shared" | "browser"))
        && project_revision.is_none_or(wire_safe)
        && sample_rate.is_none_or(|rate| {
            rate as usize >= ENGINE_PROTOCOL_MIN_SAMPLE_RATE
                && rate as usize <= ENGINE_PROTOCOL_MAX_SAMPLE_RATE
        })
        && wire_safe(*underruns)
}

fn valid_preview_event(event: &EngineEvent) -> Option<bool> {
    match event {
        EngineEvent::PreviewStarted {
            preview_id,
            duration_frames,
        } => Some(
            valid_identifier(preview_id) && wire_safe(*duration_frames) && *duration_frames > 0,
        ),
        EngineEvent::PreviewState {
            preview_id,
            pitches,
            sample_position,
            ..
        } => {
            let mut unique = BTreeSet::new();
            Some(
                valid_identifier(preview_id)
                    && !pitches.is_empty()
                    && pitches.len() <= ENGINE_PROTOCOL_MAX_PREVIEW_CHORD_SIZE
                    && pitches
                        .iter()
                        .all(|pitch| *pitch <= 127 && unique.insert(*pitch))
                    && wire_safe(*sample_position),
            )
        }
        EngineEvent::PreviewEnded { preview_id, reason } => Some(
            valid_identifier(preview_id)
                && matches!(reason.as_str(), "completed" | "canceled" | "interrupted"),
        ),
        _ => None,
    }
}

fn valid_brick_preview_event(event: &EngineEvent) -> Option<bool> {
    match event {
        EngineEvent::BrickPreviewStarted {
            preview_generation,
            render_plan_revision,
            engine_frame,
        } => Some(
            *preview_generation > 0
                && wire_safe(*preview_generation)
                && wire_safe(*render_plan_revision)
                && wire_safe(*engine_frame),
        ),
        EngineEvent::BrickPreviewCursor {
            source_layer_id,
            preview_generation,
            local_tick,
            cycle_iteration,
            engine_frame,
            render_plan_revision,
            ..
        } => Some(
            valid_identifier(source_layer_id)
                && *preview_generation > 0
                && wire_safe(*preview_generation)
                && wire_safe(*local_tick)
                && wire_safe(*cycle_iteration)
                && wire_safe(*engine_frame)
                && wire_safe(*render_plan_revision),
        ),
        EngineEvent::BrickPreviewEnded {
            preview_generation,
            reason,
            engine_frame,
        } => Some(
            *preview_generation > 0
                && wire_safe(*preview_generation)
                && matches!(reason.as_str(), "stopped" | "interrupted")
                && wire_safe(*engine_frame),
        ),
        _ => None,
    }
}

fn valid_audio_devices(event: &EngineEvent) -> Option<bool> {
    let EngineEvent::AudioDevicesChanged { devices } = event else {
        return None;
    };
    let mut unique = BTreeSet::new();
    let mut default_count = 0_usize;
    Some(
        devices.len() <= ENGINE_PROTOCOL_MAX_BATCH_ITEMS
            && devices.iter().all(|device| {
                default_count += usize::from(device.default);
                valid_identifier(&device.id)
                    && !device.label.is_empty()
                    && device.label.len() <= ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES
                    && unique.insert(device.id.as_str())
                    && default_count <= 1
            }),
    )
}

fn valid_recording_event(event: &EngineEvent) -> Option<bool> {
    match event {
        EngineEvent::RecordingState {
            recording_id,
            state,
            sample_position,
            source_tick,
            count_in_beats_remaining,
        } => Some(
            valid_identifier(recording_id)
                && matches!(state.as_str(), "count-in" | "recording")
                && wire_safe(*sample_position)
                && wire_safe(*source_tick)
                && usize::from(*count_in_beats_remaining)
                    <= ENGINE_PROTOCOL_MAX_RECORDING_COUNT_IN_BEATS
                && (state == "count-in" || *count_in_beats_remaining == 0),
        ),
        EngineEvent::RecordingInputApplied {
            recording_id,
            audition_id,
            phase,
            pitch,
            velocity,
            sample_position,
            source_tick,
        } => Some(
            valid_identifier(recording_id)
                && valid_identifier(audition_id)
                && matches!(phase.as_str(), "note-on" | "note-off")
                && *pitch <= 127
                && (1..=127).contains(velocity)
                && wire_safe(*sample_position)
                && wire_safe(*source_tick),
        ),
        EngineEvent::RecordingStopped {
            recording_id,
            reason,
            sample_position,
            stop_tick,
        } => Some(
            valid_identifier(recording_id)
                && matches!(
                    reason.as_str(),
                    "stopped" | "count-in-canceled" | "interrupted"
                )
                && wire_safe(*sample_position)
                && wire_safe(*stop_tick),
        ),
        _ => None,
    }
}

fn valid_other_event(event: &EngineEvent) -> bool {
    match event {
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
        EngineEvent::PreviewStarted { .. }
        | EngineEvent::PreviewState { .. }
        | EngineEvent::PreviewEnded { .. }
        | EngineEvent::BrickPreviewStarted { .. }
        | EngineEvent::BrickPreviewCursor { .. }
        | EngineEvent::BrickPreviewEnded { .. }
        | EngineEvent::AudioDevicesChanged { .. }
        | EngineEvent::RecordingState { .. }
        | EngineEvent::RecordingInputApplied { .. }
        | EngineEvent::RecordingStopped { .. } => unreachable!("validated above"),
        EngineEvent::ActiveDeviceChanged { device_id } => {
            device_id.as_deref().is_none_or(valid_identifier)
        }
        EngineEvent::Pong { heartbeat_id } => valid_identifier(heartbeat_id),
        audio_health @ EngineEvent::AudioHealth { .. } => valid_audio_health(audio_health),
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
    }
}

fn validate_event(event: &EngineEvent) -> Result<(), ProtocolError> {
    let valid = valid_preview_event(event)
        .or_else(|| valid_brick_preview_event(event))
        .or_else(|| valid_audio_devices(event))
        .or_else(|| valid_recording_event(event))
        .unwrap_or_else(|| valid_other_event(event));
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
            format!(
                r#"{{"payload":{{"planGeneration":2,"projectRevision":7}},"protocolVersion":{ENGINE_PROTOCOL_VERSION},"sequence":3,"type":"render-plan-acknowledged"}}"#
            )
            .into_bytes()
        );
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["protocolVersion"], ENGINE_PROTOCOL_VERSION);
        assert_eq!(value["sequence"], 3);
        assert_eq!(value["type"], "render-plan-acknowledged");
        assert_eq!(value["payload"]["projectRevision"], 7);
    }

    #[test]
    fn validates_unique_bounded_audio_device_descriptors() {
        let device = AudioDeviceDescriptor {
            id: "device.default".to_owned(),
            label: "Primary output".to_owned(),
            default: true,
        };
        assert!(
            encode_event_body(
                1,
                &EngineEvent::AudioDevicesChanged {
                    devices: vec![device.clone()],
                },
            )
            .is_ok()
        );
        assert!(
            encode_event_body(
                2,
                &EngineEvent::AudioDevicesChanged {
                    devices: vec![device.clone(), device],
                },
            )
            .is_err()
        );
        assert!(
            encode_event_body(
                3,
                &EngineEvent::AudioDevicesChanged {
                    devices: vec![
                        AudioDeviceDescriptor {
                            id: "device.one".to_owned(),
                            label: "First".to_owned(),
                            default: true,
                        },
                        AudioDeviceDescriptor {
                            id: "device.two".to_owned(),
                            label: "Second".to_owned(),
                            default: true,
                        },
                    ],
                },
            )
            .is_err()
        );
    }

    #[test]
    fn validates_preview_lifecycle_events() {
        assert!(
            encode_event_body(
                4,
                &EngineEvent::PreviewState {
                    preview_id: "preview.palette.1".to_owned(),
                    pitches: vec![57, 60, 64],
                    active: true,
                    sample_position: 512,
                },
            )
            .is_ok()
        );
        assert!(
            encode_event_body(
                5,
                &EngineEvent::PreviewState {
                    preview_id: "preview.palette.1".to_owned(),
                    pitches: vec![57, 57],
                    active: true,
                    sample_position: 512,
                },
            )
            .is_err()
        );
    }
}
