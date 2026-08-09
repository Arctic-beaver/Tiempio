mod generated;

pub use generated::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HandshakePeer {
    Application,
    NativeHost,
    WebWorklet,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Handshake {
    pub protocol_version: u32,
    pub peer: HandshakePeer,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VersionMismatch {
    pub expected: u32,
    pub actual: u32,
}

pub const fn validate_handshake(handshake: Handshake) -> Result<Handshake, VersionMismatch> {
    if handshake.protocol_version == ENGINE_PROTOCOL_VERSION {
        Ok(handshake)
    } else {
        Err(VersionMismatch {
            expected: ENGINE_PROTOCOL_VERSION,
            actual: handshake.protocol_version,
        })
    }
}

pub const fn frame_is_within_limit(frame_bytes: usize) -> bool {
    frame_bytes <= ENGINE_PROTOCOL_MAX_FRAME_BYTES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_version_mismatch() {
        let result = validate_handshake(Handshake {
            protocol_version: ENGINE_PROTOCOL_VERSION + 1,
            peer: HandshakePeer::NativeHost,
        });
        assert_eq!(
            result,
            Err(VersionMismatch {
                expected: ENGINE_PROTOCOL_VERSION,
                actual: ENGINE_PROTOCOL_VERSION + 1,
            })
        );
    }

    #[test]
    fn enforces_the_generated_frame_limit() {
        assert!(frame_is_within_limit(ENGINE_PROTOCOL_MAX_FRAME_BYTES));
        assert!(!frame_is_within_limit(ENGINE_PROTOCOL_MAX_FRAME_BYTES + 1));
    }
}
