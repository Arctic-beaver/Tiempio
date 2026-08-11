use tiempio_engine_core::RenderPlanRevision;

use crate::{
    EngineCommand, EngineCommandEnvelope, ProtocolDiagnostic, ProtocolError, decode_command_body,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolSessionState {
    AwaitingHandshake,
    Ready,
    Terminated,
}

#[derive(Debug, Default)]
struct NegotiatedCapabilities {
    native_audio: bool,
    native_features: NativeFeatureCapabilities,
}

#[derive(Debug, Default)]
struct NativeFeatureCapabilities {
    audio_devices: bool,
    preview_programs: bool,
    metronome: bool,
}

#[derive(Debug)]
pub struct ProtocolSession {
    state: ProtocolSessionState,
    last_sequence: Option<u64>,
    highest_plan_revision: Option<RenderPlanRevision>,
    native_audio_available: bool,
    capabilities: NegotiatedCapabilities,
}

impl Default for ProtocolSession {
    fn default() -> Self {
        Self::new()
    }
}

impl ProtocolSession {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            state: ProtocolSessionState::AwaitingHandshake,
            last_sequence: None,
            highest_plan_revision: None,
            native_audio_available: false,
            capabilities: NegotiatedCapabilities {
                native_audio: false,
                native_features: NativeFeatureCapabilities {
                    audio_devices: false,
                    preview_programs: false,
                    metronome: false,
                },
            },
        }
    }

    /// Creates a session that can negotiate the Stage 5 native shared-audio commands.
    #[must_use]
    pub const fn native_host() -> Self {
        Self {
            state: ProtocolSessionState::AwaitingHandshake,
            last_sequence: None,
            highest_plan_revision: None,
            native_audio_available: true,
            capabilities: NegotiatedCapabilities {
                native_audio: false,
                native_features: NativeFeatureCapabilities {
                    audio_devices: false,
                    preview_programs: false,
                    metronome: false,
                },
            },
        }
    }

    #[must_use]
    pub const fn state(&self) -> ProtocolSessionState {
        self.state
    }

    /// Decodes and accepts one command body under the session state machine.
    ///
    /// # Errors
    ///
    /// Returns a stable protocol error when decoding or session validation fails.
    pub fn accept_body(&mut self, body: &[u8]) -> Result<EngineCommandEnvelope, ProtocolError> {
        if self.state == ProtocolSessionState::Terminated {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidEnvelope,
                "Protocol session is terminated.",
            ));
        }
        let envelope = match decode_command_body(body) {
            Ok(envelope) => envelope,
            Err(error) => {
                if self.state == ProtocolSessionState::AwaitingHandshake
                    || error.diagnostic == ProtocolDiagnostic::VersionMismatch
                {
                    self.state = ProtocolSessionState::Terminated;
                }
                return Err(error);
            }
        };
        self.accept(envelope)
    }

    /// Accepts an already-decoded command under handshake, sequence and revision rules.
    ///
    /// # Errors
    ///
    /// Returns a stable protocol error for invalid state, replay, stale revision or a
    /// command that is reserved but unavailable in the Stage 4 engine.
    pub fn accept(
        &mut self,
        envelope: EngineCommandEnvelope,
    ) -> Result<EngineCommandEnvelope, ProtocolError> {
        if self.state == ProtocolSessionState::Terminated {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidEnvelope,
                "Protocol session is terminated.",
            ));
        }
        if self
            .last_sequence
            .is_some_and(|sequence| envelope.sequence <= sequence)
        {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidSequence,
                "Protocol sequence is replayed or out of order.",
            ));
        }
        if self.state == ProtocolSessionState::AwaitingHandshake
            && !matches!(envelope.command, EngineCommand::Handshake(_))
        {
            self.state = ProtocolSessionState::Terminated;
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidEnvelope,
                "Handshake must be the first protocol command.",
            ));
        }
        if self.state == ProtocolSessionState::Ready
            && matches!(envelope.command, EngineCommand::Handshake(_))
        {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidEnvelope,
                "Protocol handshake is already complete.",
            ));
        }
        self.last_sequence = Some(envelope.sequence);
        match &envelope.command {
            EngineCommand::Handshake(handshake) => {
                self.negotiate_capabilities(&handshake.capabilities);
                self.state = ProtocolSessionState::Ready;
            }
            EngineCommand::LoadRenderPlan(plan) => {
                if self
                    .highest_plan_revision
                    .is_some_and(|revision| plan.project_revision.value() <= revision.value())
                {
                    return Err(ProtocolError::new(
                        ProtocolDiagnostic::StaleRevision,
                        "Render plan does not advance the accepted project revision.",
                    ));
                }
                self.highest_plan_revision = Some(plan.project_revision);
            }
            EngineCommand::ConfigureAudio(_)
            | EngineCommand::StartAudio
            | EngineCommand::StopAudio
                if self.capabilities.native_audio => {}
            EngineCommand::RefreshDevices if self.capabilities.native_features.audio_devices => {}
            EngineCommand::StartPreview(_) | EngineCommand::CancelPreview(_)
                if self.capabilities.native_features.preview_programs => {}
            EngineCommand::SetMetronomeEnabled(_) | EngineCommand::SetMetronomeVolume(_)
                if self.capabilities.native_features.metronome => {}
            EngineCommand::ApplyRenderPlanDelta(_)
            | EngineCommand::PreviewMacro(_)
            | EngineCommand::CommitMacro(_)
            | EngineCommand::ConfigureAudio(_)
            | EngineCommand::StartAudio
            | EngineCommand::StopAudio
            | EngineCommand::RefreshDevices
            | EngineCommand::StartPreview(_)
            | EngineCommand::CancelPreview(_)
            | EngineCommand::SetMetronomeEnabled(_)
            | EngineCommand::SetMetronomeVolume(_) => {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::UnsupportedCommand,
                    "Command is reserved but not negotiated by the Stage 4 engine.",
                ));
            }
            EngineCommand::Play(_)
            | EngineCommand::Stop
            | EngineCommand::Seek(_)
            | EngineCommand::SetLoop(_)
            | EngineCommand::NoteOn(_)
            | EngineCommand::NoteOff(_)
            | EngineCommand::RequestDiagnostics
            | EngineCommand::StartOfflineRender { .. }
            | EngineCommand::CancelOfflineRender(_)
            | EngineCommand::Ping(_)
            | EngineCommand::Shutdown => {}
        }
        Ok(envelope)
    }

    fn negotiate_capabilities(&mut self, requested: &[String]) {
        let negotiated = |capability: &str| {
            self.native_audio_available && requested.iter().any(|value| value == capability)
        };
        self.capabilities.native_audio = negotiated("audio.native.shared");
        self.capabilities.native_features.audio_devices = negotiated("audio.devices");
        self.capabilities.native_features.preview_programs = negotiated("preview.programs");
        self.capabilities.native_features.metronome = negotiated("metronome.native");
    }

    pub fn terminate(&mut self) {
        self.state = ProtocolSessionState::Terminated;
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::ENGINE_PROTOCOL_VERSION;

    fn command(sequence: u64, command_type: &str, payload: &Value) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "protocolVersion": ENGINE_PROTOCOL_VERSION,
            "requestId": format!("request.{sequence}"),
            "sequence": sequence,
            "type": command_type,
            "payload": payload
        }))
        .unwrap()
    }

    fn handshake(sequence: u64) -> Vec<u8> {
        command(
            sequence,
            "handshake",
            &json!({
                "protocolVersion": ENGINE_PROTOCOL_VERSION,
                "peer": "application",
                "renderPlanVersion": 3,
                "patchModelVersion": 2,
                "capabilities": ["protocol.typed-json"]
            }),
        )
    }

    #[test]
    fn requires_one_compatible_handshake() {
        let mut session = ProtocolSession::new();
        session.accept_body(&handshake(0)).unwrap();
        assert_eq!(session.state(), ProtocolSessionState::Ready);
        assert_eq!(
            session.accept_body(&handshake(1)).unwrap_err().diagnostic,
            ProtocolDiagnostic::InvalidEnvelope
        );
    }

    #[test]
    fn terminates_when_the_first_command_is_not_a_handshake() {
        let mut session = ProtocolSession::new();
        assert_eq!(
            session
                .accept_body(&command(0, "stop", &json!({})))
                .unwrap_err()
                .diagnostic,
            ProtocolDiagnostic::InvalidEnvelope
        );
        assert_eq!(session.state(), ProtocolSessionState::Terminated);
    }

    #[test]
    fn rejects_replayed_sequences_without_terminating_the_ready_session() {
        let mut session = ProtocolSession::new();
        session.accept_body(&handshake(4)).unwrap();
        assert_eq!(
            session
                .accept_body(&command(4, "stop", &json!({})))
                .unwrap_err()
                .diagnostic,
            ProtocolDiagnostic::InvalidSequence
        );
        assert_eq!(session.state(), ProtocolSessionState::Ready);
    }

    #[test]
    fn rejects_a_stale_full_plan_without_replacing_the_accepted_revision() {
        let plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        let mut session = ProtocolSession::new();
        session.accept_body(&handshake(0)).unwrap();
        session
            .accept_body(&command(1, "load-render-plan", &json!({ "plan": plan })))
            .unwrap();
        let stale_plan: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/engine-protocol/valid-bass-plan.json"
        ))
        .unwrap();
        assert_eq!(
            session
                .accept_body(&command(
                    2,
                    "load-render-plan",
                    &json!({ "plan": stale_plan })
                ))
                .unwrap_err()
                .diagnostic,
            ProtocolDiagnostic::StaleRevision
        );
        assert_eq!(session.state(), ProtocolSessionState::Ready);
    }

    #[test]
    fn native_host_profile_accepts_only_the_negotiated_audio_surface() {
        let mut session = ProtocolSession::native_host();
        session
            .accept_body(&command(
                0,
                "handshake",
                &json!({
                    "protocolVersion": ENGINE_PROTOCOL_VERSION,
                    "peer": "application",
                    "renderPlanVersion": 3,
                    "patchModelVersion": 2,
                    "capabilities": [
                        "protocol.typed-json",
                        "audio.native.shared",
                        "audio.devices",
                        "preview.programs",
                        "metronome.native"
                    ]
                }),
            ))
            .unwrap();
        session
            .accept_body(&command(
                1,
                "configure-audio",
                &json!({ "sampleRate": 48_000, "blockFrames": 128, "channels": 2 }),
            ))
            .unwrap();
        session
            .accept_body(&command(2, "refresh-devices", &json!({})))
            .unwrap();
        session
            .accept_body(&command(
                3,
                "start-preview",
                &json!({
                    "previewId": "preview.sound.1",
                    "layerId": "layer.bass",
                    "programVersion": 1,
                    "events": [
                        {"offsetMs": 0, "durationMs": 120, "pitches": [45], "velocity": 100}
                    ]
                }),
            ))
            .unwrap();
        session
            .accept_body(&command(
                4,
                "set-metronome-enabled",
                &json!({ "enabled": true }),
            ))
            .unwrap();
        session
            .accept_body(&command(
                5,
                "set-metronome-volume",
                &json!({ "volume": 0.4 }),
            ))
            .unwrap();
        assert_eq!(session.state(), ProtocolSessionState::Ready);

        let mut unnegotiated = ProtocolSession::native_host();
        unnegotiated.accept_body(&handshake(0)).unwrap();
        assert_eq!(
            unnegotiated
                .accept_body(&command(1, "start-audio", &json!({})))
                .unwrap_err()
                .diagnostic,
            ProtocolDiagnostic::UnsupportedCommand
        );
    }
}
