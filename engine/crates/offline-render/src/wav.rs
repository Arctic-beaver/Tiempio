use std::io::{Error, ErrorKind, Write};

use tiempio_engine_dsp::{DspConfiguration, StereoFrame};
use tiempio_engine_protocol::ENGINE_PROTOCOL_MAX_BLOCK_FRAMES;

use crate::OfflineBlockSink;

const WAV_HEADER_BYTES: usize = 44;
const PCM_BYTES_PER_FRAME: usize = 4;
const MAX_BLOCK_BYTES: usize = ENGINE_PROTOCOL_MAX_BLOCK_FRAMES * PCM_BYTES_PER_FRAME;

#[allow(clippy::cast_possible_truncation)]
pub(crate) fn quantize_pcm16(sample: f64) -> i16 {
    let finite = if sample.is_finite() { sample } else { 0.0 };
    (finite.clamp(-1.0, 1.0) * f64::from(i16::MAX)).round() as i16
}

pub struct Pcm16WavSink<Writer: Write> {
    writer: Writer,
    expected_frames: u64,
    written_frames: u64,
}

impl<Writer: Write> Pcm16WavSink<Writer> {
    /// Writes a complete PCM16 stereo WAV header before accepting bounded blocks.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the expected output cannot fit a WAV/RF64-free
    /// 32-bit data chunk or the header cannot be written.
    pub fn new(mut writer: Writer, sample_rate: u32, expected_frames: u64) -> Result<Self, Error> {
        DspConfiguration::new(sample_rate, 1).map_err(|error| {
            Error::new(
                ErrorKind::InvalidInput,
                format!("WAV sample rate is unsupported: {error:?}"),
            )
        })?;
        let data_bytes_u64 = expected_frames
            .checked_mul(u64::try_from(PCM_BYTES_PER_FRAME).unwrap_or(u64::MAX))
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "WAV data length overflowed"))?;
        let data_bytes = u32::try_from(data_bytes_u64).map_err(|_| {
            Error::new(
                ErrorKind::InvalidInput,
                "PCM output exceeds the classic WAV data-chunk ceiling",
            )
        })?;
        let riff_size = data_bytes
            .checked_add(u32::try_from(WAV_HEADER_BYTES - 8).unwrap_or(u32::MAX))
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "WAV RIFF length overflowed"))?;
        let byte_rate = sample_rate
            .checked_mul(u32::try_from(PCM_BYTES_PER_FRAME).unwrap_or(u32::MAX))
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "WAV byte rate overflowed"))?;

        let mut header = [0_u8; WAV_HEADER_BYTES];
        header[0..4].copy_from_slice(b"RIFF");
        header[4..8].copy_from_slice(&riff_size.to_le_bytes());
        header[8..12].copy_from_slice(b"WAVE");
        header[12..16].copy_from_slice(b"fmt ");
        header[16..20].copy_from_slice(&16_u32.to_le_bytes());
        header[20..22].copy_from_slice(&1_u16.to_le_bytes());
        header[22..24].copy_from_slice(&2_u16.to_le_bytes());
        header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
        header[28..32].copy_from_slice(&byte_rate.to_le_bytes());
        header[32..34].copy_from_slice(&4_u16.to_le_bytes());
        header[34..36].copy_from_slice(&16_u16.to_le_bytes());
        header[36..40].copy_from_slice(b"data");
        header[40..44].copy_from_slice(&data_bytes.to_le_bytes());
        writer.write_all(&header)?;
        Ok(Self {
            writer,
            expected_frames,
            written_frames: 0,
        })
    }

    /// Completes the sink only after exactly the declared frame count was written.
    ///
    /// # Errors
    ///
    /// Returns an invalid-data error for a truncated render.
    pub fn finish(self) -> Result<Writer, Error> {
        if self.written_frames != self.expected_frames {
            return Err(Error::new(
                ErrorKind::InvalidData,
                "WAV sink did not receive its declared frame count",
            ));
        }
        Ok(self.writer)
    }
}

impl<Writer: Write> OfflineBlockSink for Pcm16WavSink<Writer> {
    type Error = Error;

    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error> {
        if block.len() > ENGINE_PROTOCOL_MAX_BLOCK_FRAMES {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "WAV sink block exceeds the engine ceiling",
            ));
        }
        let next_frames = self
            .written_frames
            .checked_add(u64::try_from(block.len()).unwrap_or(u64::MAX))
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "WAV frame count overflowed"))?;
        if next_frames > self.expected_frames {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "WAV sink received more frames than declared",
            ));
        }
        let mut bytes = [0_u8; MAX_BLOCK_BYTES];
        for (index, frame) in block.iter().enumerate() {
            let offset = index * PCM_BYTES_PER_FRAME;
            bytes[offset..offset + 2].copy_from_slice(&quantize_pcm16(frame.left).to_le_bytes());
            bytes[offset + 2..offset + 4]
                .copy_from_slice(&quantize_pcm16(frame.right).to_le_bytes());
        }
        self.writer
            .write_all(&bytes[..block.len() * PCM_BYTES_PER_FRAME])?;
        self.written_frames = next_frames;
        Ok(())
    }
}
