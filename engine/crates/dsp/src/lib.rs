mod configuration;
mod dc_blocker;
mod envelope;
mod filter;
mod high_pass;
mod mixer;
mod oscillator;
mod sample;
mod saturation;
mod smoothing;

pub use configuration::{DspConfiguration, DspConfigurationError};
pub use dc_blocker::DcBlocker;
pub use envelope::{AdsrEnvelope, EnvelopeSettings, EnvelopeStage};
pub use filter::StateVariableLowPass;
pub use mixer::{LowSideGuard, OutputGuard, apply_gain_pan, apply_stereo_width, clear_block};
pub use oscillator::PhaseOscillator;
pub use sample::{Sample, StereoFrame, finite_or_silence};
pub use saturation::{AntialiasedSaturator, saturate};
pub use smoothing::LinearSmoother;

pub const DSP_MODEL_VERSION: u32 = 1;
