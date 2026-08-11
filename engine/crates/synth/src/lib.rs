mod pool;
mod voice;

pub use pool::{BASS_VOICE_COUNT, BassVoicePool, SYNTH_VOICE_COUNT, SynthVoicePool};
pub use voice::{DeepBassVoice, SynthVoice, VoiceLifecycle};

pub const SYNTH_MODEL_VERSION: u32 = 2;
