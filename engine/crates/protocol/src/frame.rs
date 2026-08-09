use crate::{ENGINE_PROTOCOL_MAX_FRAME_BYTES, ENGINE_PROTOCOL_MAX_JSON_DEPTH};
use crate::{ProtocolDiagnostic, ProtocolError};

const PREFIX_BYTES: usize = 4;

/// Encodes one bounded protocol body with a four-byte big-endian length prefix.
///
/// # Errors
///
/// Returns `FrameTooLarge` when the body exceeds the generated protocol ceiling
/// or its length cannot be represented by the frame prefix.
pub fn encode_frame(body: &[u8]) -> Result<Vec<u8>, ProtocolError> {
    if body.len() > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol frame body exceeds the configured ceiling.",
        ));
    }
    let length = u32::try_from(body.len()).map_err(|_| {
        ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol frame length cannot be represented.",
        )
    })?;
    let mut frame = Vec::with_capacity(PREFIX_BYTES + body.len());
    frame.extend_from_slice(&length.to_be_bytes());
    frame.extend_from_slice(body);
    Ok(frame)
}

/// Decodes exactly one complete bounded protocol frame.
///
/// # Errors
///
/// Returns a stable protocol error for truncated, trailing or oversized input.
pub fn decode_frame(frame: &[u8]) -> Result<&[u8], ProtocolError> {
    if frame.len() < PREFIX_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol frame prefix is truncated.",
        ));
    }
    let declared = u32::from_be_bytes([frame[0], frame[1], frame[2], frame[3]]) as usize;
    if declared > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Declared protocol frame length exceeds the configured ceiling.",
        ));
    }
    let expected = PREFIX_BYTES.checked_add(declared).ok_or_else(|| {
        ProtocolError::new(
            ProtocolDiagnostic::FrameTooLarge,
            "Protocol frame length overflowed.",
        )
    })?;
    if frame.len() != expected {
        return Err(ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            "Protocol frame is truncated or contains trailing bytes.",
        ));
    }
    Ok(&frame[PREFIX_BYTES..])
}

#[derive(Debug)]
pub struct IncrementalFrameDecoder {
    buffer: Vec<u8>,
}

impl Default for IncrementalFrameDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl IncrementalFrameDecoder {
    #[must_use]
    pub fn new() -> Self {
        Self {
            buffer: Vec::with_capacity(PREFIX_BYTES),
        }
    }

    /// Appends bytes for one frame without allowing the buffer to exceed its ceiling.
    ///
    /// # Errors
    ///
    /// Returns `FrameTooLarge` when buffered or declared length exceeds the ceiling.
    pub fn push(&mut self, chunk: &[u8]) -> Result<(), ProtocolError> {
        let next_length = self.buffer.len().checked_add(chunk.len()).ok_or_else(|| {
            ProtocolError::new(
                ProtocolDiagnostic::FrameTooLarge,
                "Incremental protocol buffer length overflowed.",
            )
        })?;
        if next_length > PREFIX_BYTES + ENGINE_PROTOCOL_MAX_FRAME_BYTES {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::FrameTooLarge,
                "Incremental protocol frame exceeds the configured ceiling.",
            ));
        }
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() >= PREFIX_BYTES {
            let declared = u32::from_be_bytes([
                self.buffer[0],
                self.buffer[1],
                self.buffer[2],
                self.buffer[3],
            ]) as usize;
            if declared > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::FrameTooLarge,
                    "Declared protocol frame length exceeds the configured ceiling.",
                ));
            }
        }
        Ok(())
    }

    /// Returns a complete body when available while retaining an incomplete prefix/body.
    ///
    /// # Errors
    ///
    /// Returns a stable error for oversized declarations or trailing frame bytes.
    pub fn try_take(&mut self) -> Result<Option<Vec<u8>>, ProtocolError> {
        if self.buffer.len() < PREFIX_BYTES {
            return Ok(None);
        }
        let declared = u32::from_be_bytes([
            self.buffer[0],
            self.buffer[1],
            self.buffer[2],
            self.buffer[3],
        ]) as usize;
        if declared > ENGINE_PROTOCOL_MAX_FRAME_BYTES {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::FrameTooLarge,
                "Declared protocol frame length exceeds the configured ceiling.",
            ));
        }
        let expected = PREFIX_BYTES + declared;
        if self.buffer.len() < expected {
            return Ok(None);
        }
        if self.buffer.len() > expected {
            return Err(ProtocolError::new(
                ProtocolDiagnostic::InvalidEnvelope,
                "Incremental decoder accepts exactly one frame at a time.",
            ));
        }
        let mut frame = std::mem::take(&mut self.buffer);
        frame.drain(..PREFIX_BYTES);
        Ok(Some(frame))
    }
}

pub(crate) fn validate_json_depth(body: &[u8]) -> Result<(), ProtocolError> {
    let mut depth = 0_usize;
    let mut in_string = false;
    let mut escaped = false;
    for byte in body {
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
            continue;
        }
        if *byte == b'"' {
            in_string = true;
        } else if matches!(*byte, b'{' | b'[') {
            depth = depth.checked_add(1).ok_or_else(|| {
                ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Protocol JSON nesting overflowed.",
                )
            })?;
            if depth > ENGINE_PROTOCOL_MAX_JSON_DEPTH {
                return Err(ProtocolError::new(
                    ProtocolDiagnostic::InvalidEnvelope,
                    "Protocol JSON exceeds the nesting ceiling.",
                ));
            }
        } else if matches!(*byte, b'}' | b']') {
            depth = depth.saturating_sub(1);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_every_incremental_split_point() {
        let body = br#"{"protocolVersion":1}"#;
        let frame = encode_frame(body).unwrap();
        for split in 0..frame.len() {
            let mut decoder = IncrementalFrameDecoder::new();
            decoder.push(&frame[..split]).unwrap();
            assert_eq!(decoder.try_take().unwrap(), None);
            decoder.push(&frame[split..]).unwrap();
            assert_eq!(decoder.try_take().unwrap(), Some(body.to_vec()));
        }
    }

    #[test]
    fn rejects_trailing_and_oversized_frames() {
        let body = br"{}";
        let mut frame = encode_frame(body).unwrap();
        frame.push(0);
        assert_eq!(
            decode_frame(&frame).unwrap_err().diagnostic,
            ProtocolDiagnostic::InvalidEnvelope
        );
        let oversized = u32::try_from(ENGINE_PROTOCOL_MAX_FRAME_BYTES + 1)
            .unwrap()
            .to_be_bytes();
        assert_eq!(
            decode_frame(&oversized).unwrap_err().diagnostic,
            ProtocolDiagnostic::FrameTooLarge
        );
    }

    #[test]
    fn ignores_structural_bytes_inside_json_strings_when_counting_depth() {
        validate_json_depth(br#"{"text":"[[[[[[[[[["}"#).unwrap();
        let nested = format!(
            "{}0{}",
            "[".repeat(ENGINE_PROTOCOL_MAX_JSON_DEPTH + 1),
            "]".repeat(ENGINE_PROTOCOL_MAX_JSON_DEPTH + 1)
        );
        assert_eq!(
            validate_json_depth(nested.as_bytes())
                .unwrap_err()
                .diagnostic,
            ProtocolDiagnostic::InvalidEnvelope
        );
    }
}
