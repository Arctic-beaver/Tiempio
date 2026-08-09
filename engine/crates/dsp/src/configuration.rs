pub const MIN_SAMPLE_RATE: u32 = 8_000;
pub const MAX_SAMPLE_RATE: u32 = 192_000;
pub const MAX_BLOCK_FRAMES: usize = 2_048;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DspConfigurationError {
    BlockFramesOutOfRange,
    SampleRateOutOfRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DspConfiguration {
    sample_rate: u32,
    block_frames: usize,
}

impl DspConfiguration {
    /// Creates a bounded DSP configuration shared by realtime and offline renderers.
    ///
    /// # Errors
    ///
    /// Returns a stable error when sample rate or render block is outside Stage 4 limits.
    pub const fn new(sample_rate: u32, block_frames: usize) -> Result<Self, DspConfigurationError> {
        if sample_rate < MIN_SAMPLE_RATE || sample_rate > MAX_SAMPLE_RATE {
            return Err(DspConfigurationError::SampleRateOutOfRange);
        }
        if block_frames == 0 || block_frames > MAX_BLOCK_FRAMES {
            return Err(DspConfigurationError::BlockFramesOutOfRange);
        }
        Ok(Self {
            sample_rate,
            block_frames,
        })
    }

    #[must_use]
    pub const fn sample_rate(self) -> u32 {
        self.sample_rate
    }

    #[must_use]
    pub fn sample_rate_hz(self) -> f64 {
        f64::from(self.sample_rate)
    }

    #[must_use]
    pub const fn block_frames(self) -> usize {
        self.block_frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_sample_rate_and_block_ceilings() {
        assert!(DspConfiguration::new(48_000, 128).is_ok());
        assert_eq!(
            DspConfiguration::new(7_999, 128),
            Err(DspConfigurationError::SampleRateOutOfRange)
        );
        assert_eq!(
            DspConfiguration::new(48_000, 0),
            Err(DspConfigurationError::BlockFramesOutOfRange)
        );
    }
}
