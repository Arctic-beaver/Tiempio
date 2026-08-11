use std::time::{Duration, Instant};

use tiempio_engine_core::{
    CompositeVoiceBank, EngineControlError, EngineHealthSnapshot, EngineKernel, MAX_SAFE_INTEGER,
    PlanAcknowledgement, PreparedPlan, PreparedPlanError, RenderPlan, TempoError,
};
use tiempio_engine_drums::DrumVoicePool;
use tiempio_engine_dsp::{DspConfiguration, DspConfigurationError, StereoFrame};
use tiempio_engine_protocol::{ENGINE_PROTOCOL_MAX_OFFLINE_SECONDS, EngineCommand};
use tiempio_engine_synth::SynthVoicePool;

#[derive(Clone, Debug, PartialEq)]
pub struct OfflineRenderRequest {
    pub render_id: String,
    pub plan: RenderPlan,
    pub sample_rate: u32,
    pub block_frames: usize,
    pub end_tick: u64,
    pub plan_generation: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OfflineRequestError {
    InvalidGeneration,
    UnexpectedCommand,
}

impl OfflineRenderRequest {
    /// Converts one accepted protocol command into a render request.
    ///
    /// # Errors
    ///
    /// Returns a stable error when the command is not an offline-render request or
    /// the caller-provided plan generation is not cross-language safe.
    pub fn from_command(
        command: EngineCommand,
        plan_generation: u64,
    ) -> Result<Self, OfflineRequestError> {
        if plan_generation == 0 || plan_generation > MAX_SAFE_INTEGER {
            return Err(OfflineRequestError::InvalidGeneration);
        }
        let EngineCommand::StartOfflineRender {
            render_id,
            plan,
            sample_rate,
            block_frames,
            end_tick,
        } = command
        else {
            return Err(OfflineRequestError::UnexpectedCommand);
        };
        Ok(Self {
            render_id,
            plan,
            sample_rate,
            block_frames: usize::try_from(block_frames)
                .map_err(|_| OfflineRequestError::UnexpectedCommand)?,
            end_tick,
            plan_generation,
        })
    }
}

pub trait OfflineBlockSink {
    type Error;

    /// Consumes one bounded rendered block in chronological order.
    ///
    /// # Errors
    ///
    /// Returns the sink-owned error without retrying or buffering an unbounded tail.
    fn write_block(&mut self, block: &[StereoFrame]) -> Result<(), Self::Error>;
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct OfflineBlockProgress {
    pub completed_frames: u64,
    pub total_frames: u64,
    pub render_duration: Duration,
}

pub trait OfflineRenderControl {
    fn should_cancel(&mut self, completed_frames: u64, total_frames: u64) -> bool;

    fn block_rendered(&mut self, _progress: OfflineBlockProgress) {}
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct NoopRenderControl;

impl OfflineRenderControl for NoopRenderControl {
    fn should_cancel(&mut self, _completed_frames: u64, _total_frames: u64) -> bool {
        false
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum OfflineRenderError<SinkError> {
    Cancelled { completed_frames: u64 },
    Configuration(DspConfigurationError),
    DurationLimitExceeded { max_frames: u64 },
    Engine(EngineControlError),
    Plan(PreparedPlanError),
    Sink(SinkError),
    Tempo(TempoError),
}

impl<SinkError> OfflineRenderError<SinkError> {
    #[must_use]
    pub const fn stable_code(&self) -> &'static str {
        match self {
            Self::Cancelled { .. } => "offline.canceled",
            Self::Configuration(_)
            | Self::DurationLimitExceeded { .. }
            | Self::Plan(PreparedPlanError::LimitExceeded) => "engine.limit-exceeded",
            Self::Engine(EngineControlError::StalePlan) => "engine.stale-revision",
            Self::Engine(_) | Self::Plan(_) | Self::Tempo(_) => "engine.invalid-plan",
            Self::Sink(_) => "engine.unavailable",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OfflineRenderSummary {
    pub render_id: String,
    pub project_revision: u64,
    pub plan_generation: u64,
    pub frame_count: u64,
    pub block_count: u64,
    pub acknowledgement: PlanAcknowledgement,
    pub health: EngineHealthSnapshot,
}

/// Renders through the production engine block function into a bounded sink.
///
/// # Errors
///
/// Returns a stable configuration, plan, duration, engine or sink error.
pub fn render_to_sink<Sink: OfflineBlockSink>(
    request: OfflineRenderRequest,
    sink: &mut Sink,
) -> Result<OfflineRenderSummary, OfflineRenderError<Sink::Error>> {
    render_to_sink_with_control(request, sink, &mut NoopRenderControl)
}

/// Renders through the production engine while polling cancellation exactly at
/// block boundaries and reporting non-gating per-block timing observations.
///
/// # Errors
///
/// Returns a stable error and stops the engine on every failure or cancellation path.
pub fn render_to_sink_with_control<Sink: OfflineBlockSink, Control: OfflineRenderControl>(
    request: OfflineRenderRequest,
    sink: &mut Sink,
    control: &mut Control,
) -> Result<OfflineRenderSummary, OfflineRenderError<Sink::Error>> {
    let configuration = DspConfiguration::new(request.sample_rate, request.block_frames)
        .map_err(OfflineRenderError::Configuration)?;
    let prepared =
        PreparedPlan::prepare(request.plan, request.sample_rate, request.plan_generation)
            .map_err(OfflineRenderError::Plan)?;
    let total_frames = prepared
        .timeline()
        .tick_to_sample(request.end_tick)
        .map_err(OfflineRenderError::Tempo)?;
    let max_frames = u64::from(request.sample_rate)
        .checked_mul(
            u64::try_from(ENGINE_PROTOCOL_MAX_OFFLINE_SECONDS)
                .map_err(|_| OfflineRenderError::DurationLimitExceeded { max_frames: 0 })?,
        )
        .ok_or(OfflineRenderError::DurationLimitExceeded { max_frames: 0 })?;
    if total_frames == 0 || total_frames > max_frames {
        return Err(OfflineRenderError::DurationLimitExceeded { max_frames });
    }

    let mut engine = EngineKernel::new(
        configuration,
        CompositeVoiceBank::new(
            SynthVoicePool::new(configuration),
            DrumVoicePool::new(configuration),
        ),
    );
    engine
        .publish_plan(prepared)
        .map_err(OfflineRenderError::Engine)?;
    let mut block = vec![StereoFrame::default(); request.block_frames];

    // The discarded stopped block is the same real-time boundary a host uses to
    // activate a published plan and emit its acknowledgement. Musical transport
    // remains at sample zero, so the first streamed frame is the first phrase frame.
    engine.render_block(&mut block);
    let acknowledgement = engine
        .take_plan_acknowledgement()
        .ok_or(OfflineRenderError::Engine(EngineControlError::NoActivePlan))?;
    engine.play(0).map_err(OfflineRenderError::Engine)?;

    let mut completed_frames = 0_u64;
    let mut block_count = 0_u64;
    while completed_frames < total_frames {
        if control.should_cancel(completed_frames, total_frames) {
            engine.shutdown();
            return Err(OfflineRenderError::Cancelled { completed_frames });
        }
        let remaining = total_frames - completed_frames;
        let visible_frames = usize::try_from(remaining)
            .unwrap_or(usize::MAX)
            .min(request.block_frames);
        let started = Instant::now();
        engine.render_block(&mut block[..visible_frames]);
        let render_duration = started.elapsed();
        if let Err(error) = sink.write_block(&block[..visible_frames]) {
            engine.shutdown();
            return Err(OfflineRenderError::Sink(error));
        }
        completed_frames =
            completed_frames.saturating_add(u64::try_from(visible_frames).unwrap_or(u64::MAX));
        block_count = block_count.saturating_add(1);
        control.block_rendered(OfflineBlockProgress {
            completed_frames,
            total_frames,
            render_duration,
        });
    }

    engine.shutdown();
    Ok(OfflineRenderSummary {
        render_id: request.render_id,
        project_revision: acknowledgement.project_revision,
        plan_generation: acknowledgement.plan_generation,
        frame_count: completed_frames,
        block_count,
        acknowledgement,
        health: engine.health_snapshot(),
    })
}
