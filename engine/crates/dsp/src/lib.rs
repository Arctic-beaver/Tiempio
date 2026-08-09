mod configuration;
mod envelope;
mod filter;
mod mixer;
mod oscillator;
mod sample;
mod saturation;
mod smoothing;

pub use configuration::{DspConfiguration, DspConfigurationError};
pub use envelope::{AdsrEnvelope, EnvelopeSettings, EnvelopeStage};
pub use filter::StateVariableLowPass;
pub use mixer::{OutputGuard, apply_gain_pan, apply_stereo_width, clear_block};
pub use oscillator::PhaseOscillator;
pub use sample::{Sample, StereoFrame, finite_or_silence};
pub use saturation::saturate;
pub use smoothing::LinearSmoother;

pub const DSP_MODEL_VERSION: u32 = 1;
