mod command;
mod event;
mod frame;
mod generated;
mod render_plan;
mod session;
mod validation;
mod wire;

use std::fmt::{Display, Formatter};

pub use command::{EngineCommand, EngineCommandEnvelope, decode_command_body};
pub use event::{AudioDeviceDescriptor, EngineEvent, ProtocolLimits, encode_event_body};
pub use frame::{IncrementalFrameDecoder, decode_frame, encode_frame};
pub use generated::*;
pub use session::{ProtocolSession, ProtocolSessionState};
pub use wire::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolDiagnostic {
    FrameTooLarge,
    InvalidEnvelope,
    InvalidPlan,
    InvalidSequence,
    LimitExceeded,
    StaleRevision,
    UnsupportedCommand,
    UnsupportedSource,
    VersionMismatch,
}

impl ProtocolDiagnostic {
    #[must_use]
    pub const fn stable_code(self) -> &'static str {
        match self {
            Self::FrameTooLarge => "protocol.frame-too-large",
            Self::InvalidEnvelope => "protocol.invalid-envelope",
            Self::InvalidPlan => "engine.invalid-plan",
            Self::InvalidSequence => "protocol.invalid-sequence",
            Self::LimitExceeded => "engine.limit-exceeded",
            Self::StaleRevision => "engine.stale-revision",
            Self::UnsupportedCommand => "protocol.unsupported-command",
            Self::UnsupportedSource => "engine.unsupported-source",
            Self::VersionMismatch => "protocol.version-mismatch",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolError {
    pub diagnostic: ProtocolDiagnostic,
    pub message: String,
}

impl ProtocolError {
    pub(crate) fn new(diagnostic: ProtocolDiagnostic, message: impl Into<String>) -> Self {
        Self {
            diagnostic,
            message: message.into(),
        }
    }
}

impl Display for ProtocolError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{}: {}",
            self.diagnostic.stable_code(),
            self.message
        )
    }
}

impl std::error::Error for ProtocolError {}
