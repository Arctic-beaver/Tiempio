use tiempio_engine_protocol::ENGINE_PROTOCOL_VERSION;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct RenderPlanRevision(u64);

impl RenderPlanRevision {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> u64 {
        self.0
    }
}

#[must_use]
pub const fn protocol_version() -> u32 {
    ENGINE_PROTOCOL_VERSION
}
