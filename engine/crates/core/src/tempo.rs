use crate::{MAX_SAFE_INTEGER, RenderPlan};

const MICRO_MINUTE: u128 = 60_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TempoError {
    ArithmeticOverflow,
    InvalidTempoMap,
    TickOutOfRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TempoSegment {
    pub start_tick: u64,
    pub start_sample: u64,
    pub micro_bpm: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TempoTimeline {
    sample_rate: u32,
    ticks_per_quarter: u32,
    segments: Vec<TempoSegment>,
}

impl TempoTimeline {
    /// Builds checked integer tempo segments from a validated render plan.
    ///
    /// # Errors
    ///
    /// Returns a stable error for an invalid map, out-of-range tick or arithmetic overflow.
    pub fn new(plan: &RenderPlan, sample_rate: u32) -> Result<Self, TempoError> {
        if plan.tempo_map.is_empty() || sample_rate == 0 || plan.ticks_per_quarter == 0 {
            return Err(TempoError::InvalidTempoMap);
        }
        let mut segments = Vec::with_capacity(plan.tempo_map.len());
        let mut start_sample = 0_u64;
        for (index, point) in plan.tempo_map.iter().enumerate() {
            if point.tick > MAX_SAFE_INTEGER
                || point.micro_bpm == 0
                || (index == 0 && point.tick != 0)
                || (index > 0 && plan.tempo_map[index - 1].tick >= point.tick)
            {
                return Err(TempoError::InvalidTempoMap);
            }
            if index > 0 {
                let previous = &plan.tempo_map[index - 1];
                start_sample = start_sample
                    .checked_add(samples_for_ticks(
                        point.tick - previous.tick,
                        previous.micro_bpm,
                        plan.ticks_per_quarter,
                        sample_rate,
                    )?)
                    .ok_or(TempoError::ArithmeticOverflow)?;
            }
            segments.push(TempoSegment {
                start_tick: point.tick,
                start_sample,
                micro_bpm: point.micro_bpm,
            });
        }
        Ok(Self {
            sample_rate,
            ticks_per_quarter: plan.ticks_per_quarter,
            segments,
        })
    }

    #[must_use]
    pub fn segments(&self) -> &[TempoSegment] {
        &self.segments
    }

    #[must_use]
    pub const fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Converts an absolute musical tick to the nearest deterministic sample.
    ///
    /// # Errors
    ///
    /// Returns a stable error when the tick is not wire-safe or arithmetic overflows.
    pub fn tick_to_sample(&self, tick: u64) -> Result<u64, TempoError> {
        if tick > MAX_SAFE_INTEGER {
            return Err(TempoError::TickOutOfRange);
        }
        let index = self
            .segments
            .partition_point(|segment| segment.start_tick <= tick)
            .saturating_sub(1);
        let segment = self
            .segments
            .get(index)
            .ok_or(TempoError::InvalidTempoMap)?;
        segment
            .start_sample
            .checked_add(samples_for_ticks(
                tick - segment.start_tick,
                segment.micro_bpm,
                self.ticks_per_quarter,
                self.sample_rate,
            )?)
            .ok_or(TempoError::ArithmeticOverflow)
    }

    /// Projects an absolute sample position back to an integer musical tick.
    ///
    /// # Errors
    ///
    /// Returns a stable error when checked inverse arithmetic overflows.
    pub fn sample_to_tick_floor(&self, sample: u64) -> Result<u64, TempoError> {
        self.sample_to_tick(sample, false)
    }

    /// Projects an absolute sample position to the nearest deterministic musical tick.
    ///
    /// # Errors
    ///
    /// Returns a stable error when checked inverse arithmetic overflows.
    pub fn sample_to_tick_nearest(&self, sample: u64) -> Result<u64, TempoError> {
        self.sample_to_tick(sample, true)
    }

    fn sample_to_tick(&self, sample: u64, nearest: bool) -> Result<u64, TempoError> {
        let index = self
            .segments
            .partition_point(|segment| segment.start_sample <= sample)
            .saturating_sub(1);
        let segment = self
            .segments
            .get(index)
            .ok_or(TempoError::InvalidTempoMap)?;
        let numerator = u128::from(sample - segment.start_sample)
            .checked_mul(u128::from(segment.micro_bpm))
            .and_then(|value| value.checked_mul(u128::from(self.ticks_per_quarter)))
            .ok_or(TempoError::ArithmeticOverflow)?;
        let denominator = u128::from(self.sample_rate)
            .checked_mul(MICRO_MINUTE)
            .ok_or(TempoError::ArithmeticOverflow)?;
        let rounded_numerator = if nearest {
            numerator
                .checked_add(denominator / 2)
                .ok_or(TempoError::ArithmeticOverflow)?
        } else {
            numerator
        };
        let delta_tick = u64::try_from(rounded_numerator / denominator)
            .map_err(|_| TempoError::ArithmeticOverflow)?;
        segment
            .start_tick
            .checked_add(delta_tick)
            .filter(|tick| *tick <= MAX_SAFE_INTEGER)
            .ok_or(TempoError::TickOutOfRange)
    }
}

fn samples_for_ticks(
    ticks: u64,
    micro_bpm: u64,
    ticks_per_quarter: u32,
    sample_rate: u32,
) -> Result<u64, TempoError> {
    let numerator = u128::from(ticks)
        .checked_mul(u128::from(sample_rate))
        .and_then(|value| value.checked_mul(MICRO_MINUTE))
        .ok_or(TempoError::ArithmeticOverflow)?;
    let denominator = u128::from(micro_bpm)
        .checked_mul(u128::from(ticks_per_quarter))
        .ok_or(TempoError::ArithmeticOverflow)?;
    if denominator == 0 {
        return Err(TempoError::InvalidTempoMap);
    }
    let rounded = numerator
        .checked_add(denominator / 2)
        .ok_or(TempoError::ArithmeticOverflow)?
        / denominator;
    u64::try_from(rounded).map_err(|_| TempoError::ArithmeticOverflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        LoopRegion, MeterPoint, RENDER_PLAN_VERSION, RenderPlanRevision, TICKS_PER_QUARTER,
        TempoPoint,
    };

    fn plan_with_tempo(tempo_map: Vec<TempoPoint>) -> RenderPlan {
        RenderPlan {
            plan_version: RENDER_PLAN_VERSION,
            project_id: "project.tempo".to_owned(),
            project_revision: RenderPlanRevision::new(1),
            ticks_per_quarter: TICKS_PER_QUARTER,
            end_tick: 3_840,
            tempo_map,
            meter_map: vec![MeterPoint {
                tick: 0,
                numerator: 4,
                denominator: 4,
            }],
            loop_region: LoopRegion {
                enabled: false,
                start_tick: 0,
                end_tick: 3_840,
            },
            layers: Vec::new(),
        }
    }

    #[test]
    fn converts_across_tempo_segments_with_checked_integer_math() {
        let plan = plan_with_tempo(vec![
            TempoPoint {
                tick: 0,
                micro_bpm: 120_000_000,
            },
            TempoPoint {
                tick: 960,
                micro_bpm: 60_000_000,
            },
        ]);
        let timeline = TempoTimeline::new(&plan, 48_000).expect("valid timeline");
        assert_eq!(timeline.tick_to_sample(960), Ok(24_000));
        assert_eq!(timeline.tick_to_sample(1_920), Ok(72_000));
        assert_eq!(timeline.sample_to_tick_floor(72_000), Ok(1_920));
        assert_eq!(timeline.sample_to_tick_nearest(13), Ok(1));
        assert_eq!(timeline.sample_to_tick_nearest(12), Ok(0));
    }

    #[test]
    fn rejects_ticks_above_the_cross_language_ceiling() {
        let plan = plan_with_tempo(vec![TempoPoint {
            tick: 0,
            micro_bpm: 120_000_000,
        }]);
        let timeline = TempoTimeline::new(&plan, 48_000).expect("valid timeline");
        assert_eq!(
            timeline.tick_to_sample(MAX_SAFE_INTEGER + 1),
            Err(TempoError::TickOutOfRange)
        );
    }
}
