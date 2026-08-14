//! Platform-neutral offline composition boundary.

mod catalog_analysis;
mod metrics;
mod perceptual;
mod render;
mod sound_quality_lab;
mod wav;

pub use catalog_analysis::{
    CatalogAnalysisConfiguration, CatalogAnalysisError, CatalogAnalysisResult, CatalogAnalysisSink,
};
pub use metrics::{RenderMetrics, RenderMetricsSink, SpectralBandEnergy};
pub use perceptual::{
    PERCEPTUAL_ANALYZER_REVISION, PERCEPTUAL_CAPTURE_FRAMES, PERCEPTUAL_SPECTRAL_FFT_FRAMES,
    PerceptualAnalysisConfiguration, PerceptualAnalysisError, PerceptualAnalysisSink,
    PerceptualMetrics, PitchDescriptor, SpectralDescriptors,
};
pub use render::{
    NoopRenderControl, OfflineBlockProgress, OfflineBlockSink, OfflineRenderControl,
    OfflineRenderError, OfflineRenderRequest, OfflineRenderSummary, OfflineRequestError,
    render_to_sink, render_to_sink_with_control,
};
pub use sound_quality_lab::{
    CandidateComparisonReport, CandidateComparisonRow, CandidateMeasurement, ComparisonObjective,
    ComparisonObjectiveSummary, ExplorationDimension, ExplorationPlan, ObjectiveDirection,
    ParameterSample, ParameterScale, SOUND_QUALITY_LAB_GENERATOR_REVISION,
    SOUND_QUALITY_LAB_MAXIMUM_CANDIDATES, SOUND_QUALITY_LAB_MAXIMUM_DIMENSIONS,
    SOUND_QUALITY_LAB_MAXIMUM_OBJECTIVES, SOUND_QUALITY_LAB_MAXIMUM_SAMPLES, SoundQualityLabError,
    compare_candidates,
};
pub use wav::Pcm16WavSink;

#[must_use]
pub const fn protocol_version() -> u32 {
    tiempio_engine_protocol::ENGINE_PROTOCOL_VERSION
}
