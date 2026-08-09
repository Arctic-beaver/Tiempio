mod pool;
mod voice;

pub use pool::{BASS_VOICE_COUNT, BassVoicePool};
pub use voice::{DeepBassVoice, VoiceLifecycle};

pub const SYNTH_MODEL_VERSION: u32 = 1;
