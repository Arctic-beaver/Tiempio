//! Platform-neutral offline composition boundary.

#[must_use]
pub const fn protocol_version() -> u32 {
    tiempio_engine_protocol::ENGINE_PROTOCOL_VERSION
}
