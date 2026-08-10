use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::{
    AudioConfiguration, ENGINE_PROTOCOL_MAX_BLOCK_FRAMES, ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES,
    ENGINE_PROTOCOL_MAX_SAMPLE_RATE, ENGINE_PROTOCOL_MIN_SAMPLE_RATE, ProtocolDiagnostic,
    ProtocolError,
};

pub(crate) fn parse_payload<T: DeserializeOwned>(
    value: &Value,
    label: &str,
) -> Result<T, ProtocolError> {
    T::deserialize(value).map_err(|error| {
        ProtocolError::new(
            ProtocolDiagnostic::InvalidEnvelope,
            format!("{label} payload is invalid: {error}"),
        )
    })
}

pub(crate) fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'.' | b'_' | b':' | b'-'))
        })
}

pub(crate) const fn wire_safe(value: u64) -> bool {
    value <= tiempio_engine_core::MAX_SAFE_INTEGER
}

pub(crate) fn validate_configuration(
    configuration: &AudioConfiguration,
) -> Result<(), ProtocolError> {
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
