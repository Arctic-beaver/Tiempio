use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, SampleFormat, StreamConfig, SupportedBufferSize};
use tiempio_engine_protocol::{AudioConfiguration, AudioDeviceDescriptor};

use crate::realtime::{RealtimeEngine, StreamSignals};

const STREAM_START_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutputSampleFormat {
    F32,
    I16,
    U16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NegotiatedOutput {
    pub device: AudioDeviceDescriptor,
    pub sample_rate: u32,
    pub block_frames: u32,
    pub sample_format: OutputSampleFormat,
}

pub struct BackendConfiguration<Private> {
    pub negotiated: NegotiatedOutput,
    private: Private,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AudioBackendError {
    pub code: &'static str,
    pub message: &'static str,
    pub device_lost: bool,
}

impl AudioBackendError {
    const fn unavailable() -> Self {
        Self {
            code: "audio.device-unavailable",
            message: "No compatible output device is available.",
            device_lost: false,
        }
    }

    const fn unsupported() -> Self {
        Self {
            code: "audio.configuration-unsupported",
            message: "The requested shared-output configuration is unsupported.",
            device_lost: false,
        }
    }

    const fn start_failed() -> Self {
        Self {
            code: "audio.start-failed",
            message: "The shared-output stream could not be started.",
            device_lost: false,
        }
    }
}

pub trait RunningOutput {
    fn stop(self);
}

pub trait OutputBackend {
    type PrivateConfiguration;
    type Stream: RunningOutput;

    fn devices(&self) -> Result<Vec<AudioDeviceDescriptor>, AudioBackendError>;

    fn negotiate(
        &self,
        requested: &AudioConfiguration,
    ) -> Result<BackendConfiguration<Self::PrivateConfiguration>, AudioBackendError>;

    fn start(
        &self,
        configuration: &BackendConfiguration<Self::PrivateConfiguration>,
        realtime: RealtimeEngine,
        signals: Arc<StreamSignals>,
    ) -> Result<Self::Stream, AudioBackendError>;
}

pub struct SharedOutputBackend {
    host: cpal::Host,
}

impl SharedOutputBackend {
    #[must_use]
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
        }
    }
}

pub struct SharedPrivateConfiguration {
    device: cpal::Device,
    stream: StreamConfig,
    sample_format: OutputSampleFormat,
}

pub struct SharedOutputStream {
    stream: cpal::Stream,
    signals: Arc<StreamSignals>,
}

impl RunningOutput for SharedOutputStream {
    fn stop(self) {
        self.signals.shutdown.store(true, Ordering::Release);
        drop(self.stream);
    }
}

impl OutputBackend for SharedOutputBackend {
    type PrivateConfiguration = SharedPrivateConfiguration;
    type Stream = SharedOutputStream;

    fn devices(&self) -> Result<Vec<AudioDeviceDescriptor>, AudioBackendError> {
        let default_identifier = self
            .host
            .default_output_device()
            .and_then(|device| raw_identifier(&device).ok());
        let devices = self
            .host
            .output_devices()
            .map_err(|_| AudioBackendError::unavailable())?;
        let mut descriptors = Vec::new();
        for device in devices {
            let Ok(raw_id) = raw_identifier(&device) else {
                continue;
            };
            let Ok(description) = device.description() else {
                continue;
            };
            descriptors.push(AudioDeviceDescriptor {
                id: opaque_device_id(&raw_id),
                label: bounded_label(description.name()),
                default: default_identifier.as_deref() == Some(raw_id.as_str()),
            });
        }
        descriptors.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(descriptors)
    }

    fn negotiate(
        &self,
        requested: &AudioConfiguration,
    ) -> Result<BackendConfiguration<Self::PrivateConfiguration>, AudioBackendError> {
        let device = self
            .host
            .default_output_device()
            .ok_or_else(AudioBackendError::unavailable)?;
        let raw_id = raw_identifier(&device).map_err(|_| AudioBackendError::unavailable())?;
        let description = device
            .description()
            .map_err(|_| AudioBackendError::unavailable())?;
        let mut selected = None;
        for range in device
            .supported_output_configs()
            .map_err(|_| AudioBackendError::unavailable())?
        {
            if range.channels() != 2
                || requested.sample_rate < range.min_sample_rate()
                || requested.sample_rate > range.max_sample_rate()
                || !buffer_supported(range.buffer_size(), requested.block_frames)
            {
                continue;
            }
            let Some(format) = supported_format(range.sample_format()) else {
                continue;
            };
            let score = sample_format_score(format);
            if selected
                .as_ref()
                .is_none_or(|(selected_score, _)| score > *selected_score)
            {
                selected = Some((score, format));
            }
        }
        let (_, sample_format) = selected.ok_or_else(AudioBackendError::unsupported)?;
        let stream = StreamConfig {
            channels: 2,
            sample_rate: requested.sample_rate,
            buffer_size: BufferSize::Fixed(requested.block_frames),
        };
        Ok(BackendConfiguration {
            negotiated: NegotiatedOutput {
                device: AudioDeviceDescriptor {
                    id: opaque_device_id(&raw_id),
                    label: bounded_label(description.name()),
                    default: true,
                },
                sample_rate: requested.sample_rate,
                block_frames: requested.block_frames,
                sample_format,
            },
            private: SharedPrivateConfiguration {
                device,
                stream,
                sample_format,
            },
        })
    }

    fn start(
        &self,
        configuration: &BackendConfiguration<Self::PrivateConfiguration>,
        mut realtime: RealtimeEngine,
        signals: Arc<StreamSignals>,
    ) -> Result<Self::Stream, AudioBackendError> {
        let error_signals = Arc::clone(&signals);
        let error_callback = move |_| {
            error_signals.stream_error.store(true, Ordering::Release);
        };
        let stream = match configuration.private.sample_format {
            OutputSampleFormat::F32 => configuration
                .private
                .device
                .build_output_stream::<f32, _, _>(
                    &configuration.private.stream,
                    move |output, _| realtime.render_f32(output),
                    error_callback,
                    Some(STREAM_START_TIMEOUT),
                ),
            OutputSampleFormat::I16 => configuration
                .private
                .device
                .build_output_stream::<i16, _, _>(
                    &configuration.private.stream,
                    move |output, _| realtime.render_i16(output),
                    error_callback,
                    Some(STREAM_START_TIMEOUT),
                ),
            OutputSampleFormat::U16 => configuration
                .private
                .device
                .build_output_stream::<u16, _, _>(
                    &configuration.private.stream,
                    move |output, _| realtime.render_u16(output),
                    error_callback,
                    Some(STREAM_START_TIMEOUT),
                ),
        }
        .map_err(|_| AudioBackendError::start_failed())?;
        stream
            .play()
            .map_err(|_| AudioBackendError::start_failed())?;
        wait_until_active(&signals)?;
        Ok(SharedOutputStream { stream, signals })
    }
}

fn raw_identifier(device: &cpal::Device) -> Result<String, AudioBackendError> {
    device
        .id()
        .map(|identifier| identifier.to_string())
        .map_err(|_| AudioBackendError::unavailable())
}

fn buffer_supported(supported: &SupportedBufferSize, requested: u32) -> bool {
    match supported {
        SupportedBufferSize::Range { min, max } => (*min..=*max).contains(&requested),
        SupportedBufferSize::Unknown => true,
    }
}

fn supported_format(format: SampleFormat) -> Option<OutputSampleFormat> {
    match format {
        SampleFormat::F32 => Some(OutputSampleFormat::F32),
        SampleFormat::I16 => Some(OutputSampleFormat::I16),
        SampleFormat::U16 => Some(OutputSampleFormat::U16),
        _ => None,
    }
}

const fn sample_format_score(format: OutputSampleFormat) -> u8 {
    match format {
        OutputSampleFormat::F32 => 3,
        OutputSampleFormat::I16 => 2,
        OutputSampleFormat::U16 => 1,
    }
}

fn wait_until_active(signals: &StreamSignals) -> Result<(), AudioBackendError> {
    let deadline = Instant::now() + STREAM_START_TIMEOUT;
    while signals.callback_count.load(Ordering::Acquire) == 0 {
        if signals.stream_error.load(Ordering::Acquire) || Instant::now() >= deadline {
            return Err(AudioBackendError::start_failed());
        }
        thread::sleep(Duration::from_millis(5));
    }
    Ok(())
}

fn opaque_device_id(raw: &str) -> String {
    let hash = raw.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |value, byte| {
        (value ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    });
    format!("device.{hash:016x}")
}

fn bounded_label(label: &str) -> String {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return "Audio output".to_owned();
    }
    let mut result = String::new();
    for character in trimmed.chars() {
        if result.len() + character.len_utf8()
            > tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES
        {
            break;
        }
        result.push(character);
    }
    result
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NullOutputBackend;

#[derive(Clone, Copy, Debug)]
pub struct NullPrivateConfiguration;

pub struct NullOutputStream {
    thread: Option<JoinHandle<()>>,
    signals: Arc<StreamSignals>,
}

impl RunningOutput for NullOutputStream {
    fn stop(mut self) {
        self.signals.shutdown.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for NullOutputStream {
    fn drop(&mut self) {
        self.signals.shutdown.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl OutputBackend for NullOutputBackend {
    type PrivateConfiguration = NullPrivateConfiguration;
    type Stream = NullOutputStream;

    fn devices(&self) -> Result<Vec<AudioDeviceDescriptor>, AudioBackendError> {
        Ok(vec![AudioDeviceDescriptor {
            id: "device.null".to_owned(),
            label: "Controlled audio output".to_owned(),
            default: true,
        }])
    }

    fn negotiate(
        &self,
        requested: &AudioConfiguration,
    ) -> Result<BackendConfiguration<Self::PrivateConfiguration>, AudioBackendError> {
        Ok(BackendConfiguration {
            negotiated: NegotiatedOutput {
                device: self.devices()?.remove(0),
                sample_rate: requested.sample_rate,
                block_frames: requested.block_frames,
                sample_format: OutputSampleFormat::F32,
            },
            private: NullPrivateConfiguration,
        })
    }

    fn start(
        &self,
        configuration: &BackendConfiguration<Self::PrivateConfiguration>,
        mut realtime: RealtimeEngine,
        signals: Arc<StreamSignals>,
    ) -> Result<Self::Stream, AudioBackendError> {
        let block_frames = usize::try_from(configuration.negotiated.block_frames)
            .map_err(|_| AudioBackendError::unsupported())?;
        let sample_rate = configuration.negotiated.sample_rate;
        let thread_signals = Arc::clone(&signals);
        let thread = thread::Builder::new()
            .name("tiempio-null-audio".to_owned())
            .spawn(move || {
                let mut output = vec![0.0_f32; block_frames.saturating_mul(2)];
                let interval = Duration::from_secs_f64(
                    f64::from(u32::try_from(block_frames).unwrap_or(u32::MAX))
                        / f64::from(sample_rate),
                );
                while !thread_signals.shutdown.load(Ordering::Acquire) {
                    realtime.render_f32(&mut output);
                    thread::sleep(interval);
                }
            })
            .map_err(|_| AudioBackendError::start_failed())?;
        if let Err(error) = wait_until_active(&signals) {
            signals.shutdown.store(true, Ordering::Release);
            let _ = thread.join();
            return Err(error);
        }
        Ok(NullOutputStream {
            thread: Some(thread),
            signals,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opaque_identifiers_are_stable_and_do_not_reveal_backend_handles() {
        let first = opaque_device_id("wasapi:{PRIVATE-HANDLE}");
        assert_eq!(first, opaque_device_id("wasapi:{PRIVATE-HANDLE}"));
        assert_ne!(first, opaque_device_id("wasapi:{OTHER-HANDLE}"));
        assert!(!first.contains("PRIVATE"));
    }

    #[test]
    fn supported_formats_have_an_explicit_preference() {
        assert!(
            sample_format_score(OutputSampleFormat::F32)
                > sample_format_score(OutputSampleFormat::I16)
        );
        assert!(
            sample_format_score(OutputSampleFormat::I16)
                > sample_format_score(OutputSampleFormat::U16)
        );
        assert_eq!(supported_format(SampleFormat::F64), None);
    }

    #[test]
    fn labels_are_non_empty_and_bounded_by_protocol_bytes() {
        assert_eq!(bounded_label("   "), "Audio output");
        let bounded = bounded_label(&"я".repeat(200));
        assert!(bounded.len() <= tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_IDENTIFIER_BYTES);
        assert!(std::str::from_utf8(bounded.as_bytes()).is_ok());
    }
}
