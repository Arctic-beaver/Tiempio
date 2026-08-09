use tiempio_engine_core::RenderPlanRevision;
use tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_BATCH_ITEMS;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderPlanHeader {
    pub revision: RenderPlanRevision,
    pub event_count: usize,
}

impl RenderPlanHeader {
    #[must_use]
    pub const fn is_within_foundation_limits(self) -> bool {
        self.event_count <= ENGINE_PROTOCOL_MAX_BATCH_ITEMS
    }
}
