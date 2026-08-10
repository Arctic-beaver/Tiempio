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

#[derive(Debug)]
pub struct ProtocolSession {
    state: ProtocolSessionState,
    last_sequence: Option<u64>,
    highest_plan_revision: Option<RenderPlanRevision>,
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
            EngineCommand::Handshake(_) => self.state = ProtocolSessionState::Ready,
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
            EngineCommand::ApplyRenderPlanDelta(_)
            | EngineCommand::ConfigureAudio(_)
            | EngineCommand::StartAudio
            | EngineCommand::StopAudio
            | EngineCommand::PreviewMacro(_)
            | EngineCommand::CommitMacro(_)
            | EngineCommand::RefreshDevices => {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::UnsupportedCommand,
                    "Command is reserved but not negotiated by the Stage 4 engine.",
                ));
            }
            _ => {}
        }
        Ok(envelope)
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
                "renderPlanVersion": 1,
                "patchModelVersion": 1,
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
}
