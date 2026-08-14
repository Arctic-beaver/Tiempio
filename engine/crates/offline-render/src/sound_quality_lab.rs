use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

pub const SOUND_QUALITY_LAB_GENERATOR_REVISION: u32 = 1;
pub const SOUND_QUALITY_LAB_MAXIMUM_DIMENSIONS: usize = 16;
pub const SOUND_QUALITY_LAB_MAXIMUM_SAMPLES: usize = 256;
pub const SOUND_QUALITY_LAB_MAXIMUM_CANDIDATES: usize = 256;
pub const SOUND_QUALITY_LAB_MAXIMUM_OBJECTIVES: usize = 32;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ParameterScale {
    Linear,
    Logarithmic,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExplorationDimension {
    pub id: String,
    pub minimum: f64,
    pub maximum: f64,
    pub scale: ParameterScale,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExplorationPlan {
    pub schema_version: u32,
    pub generator_revision: u32,
    pub seed: u64,
    pub sample_count: usize,
    pub dimensions: Vec<ExplorationDimension>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterSample {
    pub id: String,
    pub normalized: BTreeMap<String, f64>,
    pub values: BTreeMap<String, f64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SoundQualityLabError {
    DuplicateIdentifier,
    InvalidBounds,
    InvalidCandidate,
    InvalidMetadata,
    MissingMetric,
    NonFiniteMetric,
}

impl ExplorationPlan {
    /// Validates the bounded, versioned parameter-space definition.
    ///
    /// # Errors
    ///
    /// Returns a stable error when metadata, identifiers or parameter bounds are invalid.
    pub fn validate(&self) -> Result<(), SoundQualityLabError> {
        if self.schema_version != 1
            || self.generator_revision != SOUND_QUALITY_LAB_GENERATOR_REVISION
            || self.sample_count == 0
            || self.sample_count > SOUND_QUALITY_LAB_MAXIMUM_SAMPLES
            || self.dimensions.is_empty()
            || self.dimensions.len() > SOUND_QUALITY_LAB_MAXIMUM_DIMENSIONS
        {
            return Err(SoundQualityLabError::InvalidMetadata);
        }
        let identifiers: BTreeSet<&str> = self
            .dimensions
            .iter()
            .map(|dimension| dimension.id.as_str())
            .collect();
        if identifiers.len() != self.dimensions.len()
            || identifiers
                .iter()
                .any(|identifier| !valid_identifier(identifier))
        {
            return Err(SoundQualityLabError::DuplicateIdentifier);
        }
        if self.dimensions.iter().any(|dimension| {
            !dimension.minimum.is_finite()
                || !dimension.maximum.is_finite()
                || dimension.maximum <= dimension.minimum
                || (dimension.scale == ParameterScale::Logarithmic && dimension.minimum <= 0.0)
        }) {
            return Err(SoundQualityLabError::InvalidBounds);
        }
        Ok(())
    }

    /// Builds a deterministic jittered Latin-hypercube manifest.
    ///
    /// Each dimension visits every stratum exactly once. The fixed integer generator avoids
    /// platform RNG state and keeps later native/WASM candidate manifests byte-reproducible.
    ///
    /// # Errors
    ///
    /// Returns a stable error when the plan fails bounded validation.
    pub fn latin_hypercube_samples(&self) -> Result<Vec<ParameterSample>, SoundQualityLabError> {
        self.validate()?;
        let mut permutations = Vec::with_capacity(self.dimensions.len());
        for dimension_index in 0..self.dimensions.len() {
            permutations.push(permutation(
                self.sample_count,
                splitmix64(self.seed ^ usize_as_u64(dimension_index)),
            ));
        }
        let mut samples = Vec::with_capacity(self.sample_count);
        for sample_index in 0..self.sample_count {
            let mut normalized = BTreeMap::new();
            let mut values = BTreeMap::new();
            for (dimension_index, dimension) in self.dimensions.iter().enumerate() {
                let stratum = permutations[dimension_index][sample_index];
                let jitter_seed = self.seed
                    ^ usize_as_u64(sample_index).rotate_left(17)
                    ^ usize_as_u64(dimension_index).rotate_left(41)
                    ^ 0xA076_1D64_78BD_642F;
                let unit = (usize_as_f64(stratum) + unit_interval(splitmix64(jitter_seed)))
                    / usize_as_f64(self.sample_count);
                normalized.insert(dimension.id.clone(), unit);
                values.insert(dimension.id.clone(), scale_value(dimension, unit));
            }
            samples.push(ParameterSample {
                id: format!("lhs-{:03}", sample_index + 1),
                normalized,
                values,
            });
        }
        Ok(samples)
    }
}

fn valid_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 64
        && identifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_'))
}

fn usize_as_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(0)
}

fn usize_as_f64(value: usize) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(0))
}

fn splitmix64(mut value: u64) -> u64 {
    value = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    value ^ (value >> 31)
}

fn unit_interval(value: u64) -> f64 {
    const DENOMINATOR: f64 = 9_007_199_254_740_992.0;
    let mantissa = value >> 11;
    let high = u32::try_from(mantissa >> 32).unwrap_or(u32::MAX);
    let low = u32::try_from(mantissa & u64::from(u32::MAX)).unwrap_or(u32::MAX);
    f64::from(high).mul_add(4_294_967_296.0, f64::from(low)) / DENOMINATOR
}

fn greatest_common_divisor(mut left: usize, mut right: usize) -> usize {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left
}

fn permutation(sample_count: usize, seed: u64) -> Vec<usize> {
    let mut multiplier = usize::try_from(seed % usize_as_u64(sample_count))
        .unwrap_or(1)
        .max(1);
    while greatest_common_divisor(multiplier, sample_count) != 1 {
        multiplier = multiplier % sample_count + 1;
    }
    let offset = usize::try_from(splitmix64(seed) % usize_as_u64(sample_count)).unwrap_or(0);
    (0..sample_count)
        .map(|index| (multiplier * index + offset) % sample_count)
        .collect()
}

fn scale_value(dimension: &ExplorationDimension, unit: f64) -> f64 {
    match dimension.scale {
        ParameterScale::Linear => {
            unit.mul_add(dimension.maximum - dimension.minimum, dimension.minimum)
        }
        ParameterScale::Logarithmic => (unit.mul_add(
            dimension.maximum.ln() - dimension.minimum.ln(),
            dimension.minimum.ln(),
        ))
        .exp(),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ObjectiveDirection {
    Minimize,
    Maximize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ComparisonObjective {
    pub metric_id: String,
    pub direction: ObjectiveDirection,
    pub minimum_allowed: Option<f64>,
    pub maximum_allowed: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateMeasurement {
    pub id: String,
    pub metrics: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateComparisonRow {
    pub id: String,
    pub metrics: BTreeMap<String, f64>,
    pub improvement_from_baseline: BTreeMap<String, f64>,
    pub hard_gate_failures: Vec<String>,
    pub pareto_rank: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateComparisonReport {
    pub baseline_id: String,
    pub objectives: Vec<ComparisonObjectiveSummary>,
    pub candidates: Vec<CandidateComparisonRow>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonObjectiveSummary {
    pub metric_id: String,
    pub direction: ObjectiveDirection,
    pub minimum_allowed: Option<f64>,
    pub maximum_allowed: Option<f64>,
}

/// Compares bounded candidates to one baseline and assigns deterministic Pareto fronts.
///
/// Candidates that fail an absolute gate remain in the report but have no Pareto rank. A positive
/// baseline delta always means improvement, independently of objective direction.
///
/// # Errors
///
/// Returns a stable error for invalid identifiers, bounds, missing metrics or non-finite values.
pub fn compare_candidates(
    baseline: &CandidateMeasurement,
    candidates: &[CandidateMeasurement],
    objectives: &[ComparisonObjective],
) -> Result<CandidateComparisonReport, SoundQualityLabError> {
    validate_comparison(baseline, candidates, objectives)?;
    let mut rows: Vec<CandidateComparisonRow> = candidates
        .iter()
        .map(|candidate| comparison_row(baseline, candidate, objectives))
        .collect();
    assign_pareto_ranks(&mut rows, objectives);
    Ok(CandidateComparisonReport {
        baseline_id: baseline.id.clone(),
        objectives: objectives
            .iter()
            .map(|objective| ComparisonObjectiveSummary {
                metric_id: objective.metric_id.clone(),
                direction: objective.direction,
                minimum_allowed: objective.minimum_allowed,
                maximum_allowed: objective.maximum_allowed,
            })
            .collect(),
        candidates: rows,
    })
}

fn validate_comparison(
    baseline: &CandidateMeasurement,
    candidates: &[CandidateMeasurement],
    objectives: &[ComparisonObjective],
) -> Result<(), SoundQualityLabError> {
    if candidates.is_empty()
        || candidates.len() > SOUND_QUALITY_LAB_MAXIMUM_CANDIDATES
        || objectives.is_empty()
        || objectives.len() > SOUND_QUALITY_LAB_MAXIMUM_OBJECTIVES
        || !valid_identifier(&baseline.id)
    {
        return Err(SoundQualityLabError::InvalidMetadata);
    }
    let candidate_ids: BTreeSet<&str> = candidates
        .iter()
        .map(|candidate| candidate.id.as_str())
        .collect();
    let objective_ids: BTreeSet<&str> = objectives
        .iter()
        .map(|objective| objective.metric_id.as_str())
        .collect();
    if candidate_ids.len() != candidates.len()
        || candidate_ids.contains(baseline.id.as_str())
        || candidate_ids.iter().any(|id| !valid_identifier(id))
        || objective_ids.len() != objectives.len()
        || objective_ids.iter().any(|id| !valid_identifier(id))
    {
        return Err(SoundQualityLabError::DuplicateIdentifier);
    }
    if objectives.iter().any(|objective| {
        objective
            .minimum_allowed
            .is_some_and(|value| !value.is_finite())
            || objective
                .maximum_allowed
                .is_some_and(|value| !value.is_finite())
            || objective
                .minimum_allowed
                .zip(objective.maximum_allowed)
                .is_some_and(|(minimum, maximum)| minimum > maximum)
    }) {
        return Err(SoundQualityLabError::InvalidBounds);
    }
    for measurement in std::iter::once(baseline).chain(candidates) {
        for objective in objectives {
            let value = measurement
                .metrics
                .get(&objective.metric_id)
                .ok_or(SoundQualityLabError::MissingMetric)?;
            if !value.is_finite() {
                return Err(SoundQualityLabError::NonFiniteMetric);
            }
        }
    }
    Ok(())
}

fn comparison_row(
    baseline: &CandidateMeasurement,
    candidate: &CandidateMeasurement,
    objectives: &[ComparisonObjective],
) -> CandidateComparisonRow {
    let mut improvement_from_baseline = BTreeMap::new();
    let mut hard_gate_failures = Vec::new();
    for objective in objectives {
        let baseline_value = baseline.metrics[&objective.metric_id];
        let candidate_value = candidate.metrics[&objective.metric_id];
        let improvement = match objective.direction {
            ObjectiveDirection::Minimize => baseline_value - candidate_value,
            ObjectiveDirection::Maximize => candidate_value - baseline_value,
        };
        improvement_from_baseline.insert(objective.metric_id.clone(), improvement);
        if objective
            .minimum_allowed
            .is_some_and(|minimum| candidate_value < minimum)
            || objective
                .maximum_allowed
                .is_some_and(|maximum| candidate_value > maximum)
        {
            hard_gate_failures.push(objective.metric_id.clone());
        }
    }
    CandidateComparisonRow {
        id: candidate.id.clone(),
        metrics: candidate.metrics.clone(),
        improvement_from_baseline,
        hard_gate_failures,
        pareto_rank: None,
    }
}

fn assign_pareto_ranks(rows: &mut [CandidateComparisonRow], objectives: &[ComparisonObjective]) {
    let mut remaining: BTreeSet<usize> = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| row.hard_gate_failures.is_empty().then_some(index))
        .collect();
    let mut rank = 1;
    while !remaining.is_empty() {
        let front: Vec<usize> = remaining
            .iter()
            .copied()
            .filter(|candidate| {
                !remaining.iter().copied().any(|other| {
                    other != *candidate && dominates(&rows[other], &rows[*candidate], objectives)
                })
            })
            .collect();
        for index in &front {
            rows[*index].pareto_rank = Some(rank);
            remaining.remove(index);
        }
        rank += 1;
    }
}

fn dominates(
    left: &CandidateComparisonRow,
    right: &CandidateComparisonRow,
    objectives: &[ComparisonObjective],
) -> bool {
    let mut strictly_better = false;
    for objective in objectives {
        let left_value = left.metrics[&objective.metric_id];
        let right_value = right.metrics[&objective.metric_id];
        let ordering = left_value.total_cmp(&right_value);
        match objective.direction {
            ObjectiveDirection::Minimize if ordering.is_gt() => return false,
            ObjectiveDirection::Maximize if ordering.is_lt() => return false,
            ObjectiveDirection::Minimize if ordering.is_lt() => strictly_better = true,
            ObjectiveDirection::Maximize if ordering.is_gt() => strictly_better = true,
            _ => {}
        }
    }
    strictly_better
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan() -> ExplorationPlan {
        ExplorationPlan {
            schema_version: 1,
            generator_revision: 1,
            seed: 17,
            sample_count: 8,
            dimensions: vec![
                ExplorationDimension {
                    id: "linear".to_owned(),
                    minimum: -1.0,
                    maximum: 1.0,
                    scale: ParameterScale::Linear,
                },
                ExplorationDimension {
                    id: "log".to_owned(),
                    minimum: 20.0,
                    maximum: 20_000.0,
                    scale: ParameterScale::Logarithmic,
                },
            ],
        }
    }

    #[test]
    fn generates_repeatable_latin_hypercube_strata() {
        let samples = plan().latin_hypercube_samples().unwrap();
        assert_eq!(samples, plan().latin_hypercube_samples().unwrap());
        for dimension in ["linear", "log"] {
            let strata: BTreeSet<u64> = samples
                .iter()
                .map(|sample| (sample.normalized[dimension] * 8.0).floor().to_bits())
                .collect();
            assert_eq!(strata.len(), 8);
        }
        assert!(samples.iter().all(|sample| {
            (-1.0..=1.0).contains(&sample.values["linear"])
                && (20.0..=20_000.0).contains(&sample.values["log"])
        }));
    }

    #[test]
    fn rejects_unbounded_or_invalid_exploration_plans() {
        let mut invalid = plan();
        invalid.sample_count = SOUND_QUALITY_LAB_MAXIMUM_SAMPLES + 1;
        assert_eq!(
            invalid.latin_hypercube_samples(),
            Err(SoundQualityLabError::InvalidMetadata)
        );
        invalid = plan();
        invalid.dimensions[1].minimum = 0.0;
        assert_eq!(invalid.validate(), Err(SoundQualityLabError::InvalidBounds));
    }

    fn measurement(id: &str, alias: f64, preference: f64) -> CandidateMeasurement {
        CandidateMeasurement {
            id: id.to_owned(),
            metrics: BTreeMap::from([
                ("alias".to_owned(), alias),
                ("preference".to_owned(), preference),
            ]),
        }
    }

    #[test]
    fn reports_gates_baseline_deltas_and_pareto_fronts() {
        let objectives = [
            ComparisonObjective {
                metric_id: "alias".to_owned(),
                direction: ObjectiveDirection::Minimize,
                minimum_allowed: None,
                maximum_allowed: Some(-40.0),
            },
            ComparisonObjective {
                metric_id: "preference".to_owned(),
                direction: ObjectiveDirection::Maximize,
                minimum_allowed: Some(3.0),
                maximum_allowed: None,
            },
        ];
        let report = compare_candidates(
            &measurement("baseline", -45.0, 3.0),
            &[
                measurement("cleaner", -55.0, 3.5),
                measurement("tradeoff", -50.0, 4.0),
                measurement("dominated", -50.0, 3.25),
                measurement("failed", -20.0, 5.0),
            ],
            &objectives,
        )
        .unwrap();
        assert_eq!(report.candidates[0].pareto_rank, Some(1));
        assert_eq!(report.candidates[1].pareto_rank, Some(1));
        assert_eq!(report.candidates[2].pareto_rank, Some(2));
        assert_eq!(report.candidates[3].pareto_rank, None);
        assert_eq!(report.candidates[3].hard_gate_failures, ["alias"]);
        assert!(
            (report.candidates[0].improvement_from_baseline["alias"] - 10.0).abs() < f64::EPSILON
        );
    }

    #[test]
    fn accepts_the_committed_exploration_fixture() {
        let fixture: ExplorationPlan = serde_json::from_str(include_str!(
            "../../../../fixtures/sound-quality/exploration-plan.json"
        ))
        .unwrap();
        let samples = fixture.latin_hypercube_samples().unwrap();
        assert_eq!(samples.len(), 64);
        assert_eq!(samples[0].values.len(), 8);
    }
}
