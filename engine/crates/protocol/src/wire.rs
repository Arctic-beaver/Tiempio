use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineHandshake {
    pub protocol_version: u32,
    pub peer: HandshakePeer,
    pub render_plan_version: u32,
    pub patch_model_version: u32,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum HandshakePeer {
    Application,
    NativeHost,
    WebWorklet,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioConfiguration {
    pub sample_rate: u32,
    pub block_frames: u32,
    pub channels: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TickPayload {
    pub tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayPayload {
    pub start_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoopPayload {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetronomeEnabledPayload {
    pub enabled: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetronomeVolumePayload {
    pub volume: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteOnPayload {
    pub audition_id: String,
    pub layer_id: String,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentifierPayload {
    pub audition_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewEventPayload {
    pub offset_ms: u32,
    pub duration_ms: u32,
    pub pitches: Vec<u8>,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewProgramPayload {
    pub preview_id: String,
    pub layer_id: String,
    pub program_version: u32,
    pub events: Vec<PreviewEventPayload>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewIdentifierPayload {
    pub preview_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroPayload {
    pub base_revision: u64,
    pub layer_id: String,
    pub r#macro: String,
    pub value: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderPlanDeltaPayload {
    pub base_revision: u64,
    pub target_revision: u64,
    pub changes: Vec<RenderPlanDeltaChange>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RenderPlanDeltaChange {
    LayerGain { layer_id: String, gain: f64 },
    LayerPan { layer_id: String, pan: f64 },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderIdentifierPayload {
    pub render_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HeartbeatPayload {
    pub heartbeat_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfflineRenderPayload {
    pub render_id: String,
    pub plan: WireRenderPlan,
    pub sample_rate: u32,
    pub block_frames: u32,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EmptyPayload {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RawCommandEnvelope {
    pub(crate) protocol_version: u32,
    pub(crate) request_id: String,
    pub(crate) sequence: u64,
    #[serde(rename = "type")]
    pub(crate) command_type: String,
    pub(crate) payload: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireTempoPoint {
    pub tick: u64,
    pub micro_bpm: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireMeterPoint {
    pub tick: u64,
    pub numerator: u8,
    pub denominator: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireLoop {
    pub enabled: bool,
    pub start_tick: u64,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthOscillatorPatchV2 {
    pub waveform: String,
    pub detune_cents: f64,
    pub sub_level: f64,
    pub noise_level: f64,
    pub pulse_width: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthFilterPatchV2 {
    pub cutoff_hz: f64,
    pub envelope_amount: f64,
    pub resonance: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthAmplifierPatchV2 {
    pub attack_ms: f64,
    pub decay_ms: f64,
    pub release_ms: f64,
    pub sustain: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthMovementPatchV2 {
    pub rate_hz: f64,
    pub depth: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthPatchV2 {
    pub patch_model_version: u32,
    pub oscillator: WireSynthOscillatorPatchV2,
    pub filter: WireSynthFilterPatchV2,
    pub amplifier: WireSynthAmplifierPatchV2,
    pub movement: WireSynthMovementPatchV2,
    pub drive: f64,
    pub stereo_width: f64,
    pub output_gain: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireMidiNote {
    pub id: String,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireSynthSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub patch: WireSynthPatchV2,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireDrumVoicePatchV2 {
    pub algorithm: String,
    pub pitch_hz: f64,
    pub tone: f64,
    pub decay_ms: f64,
    pub noise: f64,
    pub drive: f64,
    pub gain: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireDrumVoicesV2 {
    pub kick: WireDrumVoicePatchV2,
    pub clap: WireDrumVoicePatchV2,
    pub closed_hat: WireDrumVoicePatchV2,
    pub open_hat: WireDrumVoicePatchV2,
    pub perc: WireDrumVoicePatchV2,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireDrumKitPatchV2 {
    pub patch_model_version: u32,
    pub voices: WireDrumVoicesV2,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireDrumSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub patch: WireDrumKitPatchV2,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireDrumHit {
    pub id: String,
    pub start_tick: u64,
    pub swing_ticks: u64,
    pub instrument: String,
    pub velocity: u8,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireInstrumentLayer {
    pub id: String,
    pub gain: f64,
    pub pan: f64,
    pub source: Value,
    pub events: Vec<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireRenderPlan {
    pub plan_version: u32,
    pub project_id: String,
    pub project_revision: u64,
    pub ticks_per_quarter: u32,
    pub end_tick: u64,
    pub tempo_map: Vec<WireTempoPoint>,
    pub meter_map: Vec<WireMeterPoint>,
    #[serde(rename = "loop")]
    pub loop_region: WireLoop,
    pub layers: Vec<WireInstrumentLayer>,
}
