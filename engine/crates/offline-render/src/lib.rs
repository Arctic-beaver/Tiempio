//! Platform-neutral offline composition boundary.

mod metrics;
mod render;
mod wav;

pub use metrics::{RenderMetrics, RenderMetricsSink, SpectralBandEnergy};
pub use render::{
    NoopRenderControl, OfflineBlockProgress, OfflineBlockSink, OfflineRenderControl,
    OfflineRenderError, OfflineRenderRequest, OfflineRenderSummary, OfflineRequestError,
    render_to_sink, render_to_sink_with_control,
};
pub use wav::Pcm16WavSink;

#[must_use]
pub const fn protocol_version() -> u32 {
    tiempio_engine_protocol::ENGINE_PROTOCOL_VERSION
}
