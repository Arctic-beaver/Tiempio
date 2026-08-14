# Stage 8 implementation plan

## Status and scope

**Status:** engineering implementation closed, 2026-08-14. SQ-A through SQ-E and the SQ-F technical
package are complete. The product owner approved squash merge with human preference validation
deferred post-merge; no preference pass or catalog freeze is claimed.

**Authoritative product plan:**
[`STAGE-8-PERCEPTUAL-SOUND-QUALITY.md`](./STAGE-8-PERCEPTUAL-SOUND-QUALITY.md).

**Integration branch:** `feature/perceptual-sound-quality` from local `main` at `19ada46`.

Stage 7 is an entry gate, not Stage 8 scope. The gate passed because `main` contains the complete
Stage 7 merge and the Stage 7, 7A and 7B branches are ancestors of `main`.

This plan records implementation sequencing, architecture decisions, failure policy, verification
and the definition of done. It does not weaken the objective or subjective acceptance rules in the
authoritative product plan.

## Architecture assessment

The existing ownership boundaries are sound:

- `packages/project-core` owns catalog resolution, persistence and render-plan compilation;
- `packages/contracts` owns exact TypeScript wire validation;
- `engine/crates/protocol` converts validated wire values into engine-core values;
- `engine/crates/core`, `synth`, `dsp` and `offline-render` are shared by native and Web targets;
- the repository lifecycle owner supplies locks, direct `shell: false` child launches, bounded
  stage timeouts, progress heartbeats, signal handling and exact task-owned cleanup.

SQ-C replaced the inadequate oscillator, envelope, nonlinearity and expression primitives with one
current cross-target patch/render implementation. SQ-D then addressed four narrower architecture
gaps:

1. one primary oscillator plus sub/noise cannot create enough dry harmonic identity for every family;
2. the single global macro formula cannot prove per-family direction, gain compensation or safe
   corners;
3. active-voice parameter changes need the same smoothing discipline for any adopted topology field;
4. space effects would introduce new tail, mono and callback ownership, so they remain deferred
   unless dry evidence proves the bounded topology insufficient.

The ownership boundaries remain appropriate, and the MVP implementation remains one current path:

- introduce one current patch model and use unsuffixed TypeScript/Rust runtime types;
- update project schema/state, exact TypeScript wire validation, Rust protocol/core and the shared
  synth implementation in one cross-language cutover;
- validate the stored current patch structurally and test resolver equality only for the current
  catalog revision;
- remove all alternate synth validators, conversion/render code, fixtures and catalog evidence;
- retain drum algorithms as the approved positive control while renaming/bumping their shared
  current contract consistently and proving their output did not drift;
- keep the sound lab offline and drive it through the existing lifecycle owner.

### SQ-D architecture decision

- `project-core` owns one immutable effective macro profile per preset, composed from explicit
  family defaults and reviewed preset overrides. Shared logarithmic, exponential, decibel and
  smoothstep primitives are pure and bounded; the UI and engine never reinterpret macro intent.
- The only candidate topology is one explicit secondary oscillator with waveform, coarse/fine pitch
  and level. It is present in the current patch, uses preallocated per-voice phases and the accepted
  band-limited oscillator path, and is gain-normalized with the primary/sub/noise mixture.
- Secondary level changes are smoothed in active voices. Macro mappings never switch waveform or
  coarse pitch during live gestures, avoiding discontinuous phase/topology changes.
- Output compensation is authored in decibels and converted once by the resolver. It compensates
  macro-driven energy without erasing intentional velocity dynamics.
- Space effects are not adopted in SQ-D when the dry secondary-oscillator candidate clears family
  coverage. Adding one later requires a separate measured tail/mono/callback decision within Stage 8.
- The offline evidence owns candidate comparison and descriptor correlation. Runtime code owns only
  the accepted bounded patch and performs no analysis or allocation in the audio callback.

SQ-D dangerous cases are all 32 macro corners, continuous one-axis sweeps, plateau handling, high
register secondary aliasing, sub/secondary normalization, zero-level secondary silence, active-note
macro updates, mono fold-down, dense polyphony and identical native/WASM interpretation. Exit
requires deterministic fixtures, no macro reversal/discontinuity, bounded output/CPU/allocations and
documented deferral of any rejected topology or effect.

No UI redesign, parallel Desktop-only synth fork, hidden master effect or repository-hosted
automation belongs in Stage 8.

## MVP cutover invariants

- Exactly one current synth patch/render path and preset registry exists after SQ-C.
- The current project schema round-trips the complete resolved patch, preset revision, macro values
  and macro-mapping revision deterministically.
- Protocol, TypeScript and Rust validators accept the same bounded current shape and reject missing,
  malformed or non-current markers consistently.
- Native, offline and Web/WASM targets use the same Rust DSP implementation.
- Drums retain their approved algorithm/output identity unless measured evidence identifies a
  concrete defect.

## Stage sequence

### SQ-A — research and frozen protocol

Branch: `feature/sound-quality-baseline`.

1. Write the primary-source research synthesis with formulas, approximation limits and no
   compliance claims.
2. Freeze role ranges, objective thresholds, stimulus manifest ceilings and listening decision
   rules before candidate ranking.
3. Define bounded objective stimuli for the current catalog, DSP candidates and protected drums.
4. Retain only current analyzer references, quality thresholds and stimulus definitions.
5. Specify randomized, name-hidden, level-matched trained-listener and creator panels, including
   pilot and power-analysis procedures.

Exit: every current role has deterministic stimuli and candidate thresholds are frozen.

### SQ-B — offline perceptual analysis lab

Branch: `feature/sound-quality-lab`.

1. Extend streaming analysis with sample/true peak, K-weighted level approximation, RMS, DC,
   non-finite/guard counters, pitch, onset/tail, spectral and stereo descriptors.
2. Add bounded deterministic stimuli, low-discrepancy multidimensional sampling and comparison
   reports.
3. Verify metrics against synthetic reference fixtures and known defects.
4. Keep full catalog analysis lifecycle-owned and out of app bundles when the current catalog is
   rendered in SQ-D through SQ-F.

Exit: one command produces the bounded report and rejects reference defects.

### SQ-C — current patch boundary and DSP primitives

Branch: `feature/synth-quality-primitives`.

Primitive foundation status (2026-08-14): the reproducible 44.1/48 kHz bakeoff accepted
band-limited Square, leaky-integrated Triangle and ADAA colour. The first per-period-reset Triangle
candidate was rejected by the same gate. The current-only patch boundary and runtime integration
are complete on native and Web/WASM.

1. Bake off band-limited Square/Pulse and DC-stable band-limited Triangle against naive controls;
   retain PolyBLEP Saw.
2. Add controlled alias-reduced nonlinear colour with explicit loudness compensation.
3. Add click-safe bounded curved envelopes/retrigger, key tracking and musical velocity curves.
4. Replace project/wire/Rust synth types with one current patch model and shared render path;
   regenerate development fixtures from that model.
5. Verify oscillator sweeps, sample-rate normalization,
   deterministic hashes, drum positive-control hashes and callback allocation invariants.

Exit: only primitives that clear the frozen objective and artifact comparison are adopted.

### SQ-D — timbre breadth and semantic macros

Branch: `feature/perceptual-macro-mapping`.

1. Bake off a bounded secondary oscillator/fixed unison model and adopt only what family coverage
   requires.
2. Defer space effects unless dry family candidates cannot clear the frozen role profile and the
   effect clears mono and callback budgets.
3. Replace the global resolver with per-preset mappings built from shared logarithmic,
   exponential, decibel and smooth blend curves.
4. Add gain compensation, continuity, direction, plateau and dangerous-corner tests.

Exit: all five macros meet their frozen correlation and safety contracts across role ranges.

### SQ-E — curated catalog

Branch: `feature/curated-sound-catalog`.

1. Generate a bounded candidate pool from the current surface and retain Pareto candidates.
2. Refine defaults for register, velocity, note length, polyphony and protected drum mix context.
3. Remove or merge technical duplicates; regenerate MVP seed content against the retained catalog.
4. Level-match defaults and freeze active catalog names only after their audio identities pass
   internal technical review.

Exit: every visible candidate clears objective review and is ready for blind creator testing.

#### SQ-E execution plan and architecture checkpoint — 2026-08-14

The production boundary remains unchanged: `packages/project-core` owns the application catalog and
resolved patches, while deterministic candidate generation, rendering, analysis, normalization and
ranking live only in `tiempio-engine-offline-render` and lifecycle-owned scripts. Candidate pools,
temporary audio and ranking internals must not enter project files, Desktop/Web bundles or the
real-time callback. The existing production renderer is the only render authority.

Implementation proceeds in this order:

1. Freeze a bounded full-catalog manifest for all 27 current presets at 44.1 and 48 kHz, covering
   role low/middle/high notes, velocities 32/80/120, note-length behaviour, family-appropriate
   polyphony/retrigger and the protected compact drum mix. Reject the manifest before rendering if
   it exceeds 2,048 probes or the declared lifecycle deadline.
2. Produce the current default technical report first. Apply the frozen peak, DC, tail, pitch,
   register, velocity, mono, low-side and cross-rate gates without changing thresholds after seeing
   results.
3. Generate small deterministic local candidate pools only where a measured weakness exists. Use
   bounded low-discrepancy sampling around the current seed, retain hard-gate survivors and assign
   Pareto fronts across role descriptors, artifact margins, headroom and callback cost. Do not treat
   Pareto rank or descriptor distance as a taste decision.
4. Level-match defaults toward the within-family K-weighted median while preserving the declared
   6–18 dB velocity range and intentional family dynamics. Pairwise audition assets must be within
   0.25 dB; published family spread must be at most 4 dB and every output gain stays within its
   explicit profile ceiling.
5. Standardize log centroid/roll-off, log attack/tail, crest, harmonic/noise, stereo and movement
   descriptors within each family. Flag nearest neighbours for audition, but never auto-delete an
   entry: a technically close pair may still serve distinct musical jobs, while a distant but ugly
   sound is not acceptable.
6. Adopt only reviewed seed/default changes into the one application catalog, regenerate fixtures
   and seed content, rerun current-only, macro, quality, native/Web/WASM and callback gates, then
   record deterministic evidence and an audition manifest for SQ-F.

Edge cases and failure modes are explicit:

- short Plucks need an audible early spectral window while long Pads/Textures need bounded tail and
  late steady-state checks;
- noise and movement use stable voice identities so repeated renders and cross-rate comparisons do
  not drift;
- low Bass notes, wide high notes, release overlap and compact mixes can pass solo metrics while
  failing mono, headroom or deadline gates;
- silence, clipped output, output-gain saturation, descriptor plateaus, tied Pareto fronts and
  zero-variance family axes fail closed or are reported explicitly;
- a candidate that needs a new topology, target-private DSP, a second catalog path or relaxed frozen
  threshold is rejected from SQ-E scope;
- protected drums remain unchanged unless a separately documented level-matched A/B proves a
  concrete defect;
- missing human listening observations are never synthesized or inferred from objective metrics.

SQ-E technical Definition of Done:

- the bounded manifest and full-catalog report regenerate byte-for-byte through one lifecycle
  owner;
- all retained defaults pass every hard, role, velocity, stereo, tail, cross-rate and runtime gate;
- family level spread, pairwise trial matching and technical duplicate suspects are reported;
- every adopted catalog edit has measured before/after evidence and keeps macro SQ-D gates green;
- names/descriptions are changed only for retained audio identities;
- the branch is clean, current-only and ready with level-matched assets and a blinded audition
  manifest; actual human preference remains an explicit SQ-F gate.

Completion evidence: the lifecycle-owned 648-probe report passes for all 27 current presets at
44.1/48 kHz; the worst family level spread is 0.240 dB; 27 name-hidden candidate bundles with four
context WAVs each (108 files total) and 29 trials regenerate with byte-stable manifests and
0.000170 dB maximum matching error. Technical-neighbour flags remain human-review items rather
than automatic deletion decisions.

### SQ-F — acceptance and freeze

Branch: `feature/sound-quality-acceptance`.

1. Produce randomized level-matched study assets and analyze only valid collected observations.
2. Never fabricate listener observations. Missing trained-listener or target-creator data is an
   explicit external acceptance blocker, not an inferred pass.
3. Rework or remove failures through declared new rounds.
4. Verify 44.1/48 kHz, native/WASM, offline/realtime, mono, headphones/speakers and compact mix
   evidence.
5. Freeze preset, mapping and patch manifests and update dependent Stage 7 fixtures.

Exit: the product plan's objective and human decision rules both pass with retained evidence.

Merge disposition: the package is ready, but neither required panel has supplied observations. On
14 August 2026 the product owner approved Stage 8 engineering closure and squash merge with this
study deferred. SQ-F must not be described as preference-passed, and the catalog must not be
described as frozen until the listening protocol is actually run.

## Edge cases and failure policy

- Loudness matching changes a preference result: invalidate and rerun that comparison.
- More than one runtime validator, type or render branch is reachable: block acceptance and finish
  the single-current-path cutover.
- A current preset passes but a macro corner clips, aliases, reverses, collapses in mono or leaves a
  stuck tail: reject the whole published surface.
- A preset passes at middle C but fails its documented role boundary or velocity range: reject it.
- 44.1 and 48 kHz identities diverge materially: repair rate normalization before tuning.
- Dense pad releases exceed headroom: redesign patch gain/envelope; do not rely on output guard.
- The current synth misses the Web callback or allocation budget: optimize or reject the primitive
  for all targets.
- A non-current preset/schema remains in a development fixture: regenerate the fixture from the
  current MVP model.
- A stale, malformed or non-current patch reaches any boundary: fail closed with the same stable
  contract error.
- Analysis render count exceeds the manifest ceiling: fail before rendering or allocating output.
- A task-owned heavy process causes noticeable system slowdown: stop only its verified process
  tree, confirm lock cleanup, and schedule one continuation after one hour.
- Human observations are absent or insufficient: finish the reproducible study package and report
  the external acceptance blocker without claiming catalog freeze.

## Verification strategy

Checks remain sequential and lifecycle-owned. Stage-level verification grows from focused tests to
the complete matrix:

1. TypeScript resolver, current-project round-trip and exact-wire tests.
2. Rust DSP unit/reference tests, naive-versus-candidate alias evidence and drum control hashes.
3. Sound-lab metric fixture tests and bounded catalog report.
4. Native workspace tests, realtime allocation tests and Web/WASM parity.
5. Current project round-trip plus stale/future patch rejection fixtures.
6. Macro direction, continuity, loudness, alias, true-peak, mono and polyphony gates.
7. `check:quick`, Web engine checks and only then production/package acceptance when required.
8. `npm run lifecycle:audit` after every commit and before any following check, commit, stage,
   branch or merge.

## Definition of done

- All SQ-A through SQ-E engineering exits, the SQ-F reproducible-package exit and the Stage 8
  technical definition of done are satisfied; the human SQ-F exit is explicitly deferred.
- One current patch/render implementation round-trips deterministically with no alternate runtime
  branch.
- Every active synth preset and macro surface clears frozen technical limits. Human
  desire-to-use/role-fit rules remain mandatory before any later preference or freeze claim.
- Protected drums retain their identity and pass the expanded regression/mix matrix.
- Native and Web/WASM share one accepted DSP path within documented tolerances and budgets.
- The integration branch contains all stage merges, documentation, manifests and evidence, is
  clean, and has no task-owned process, lock or cleanup quarantine.
- No merge to `main`, push or pull request is performed without a separate user request.

## Execution log

| Stage | Status | Evidence |
| --- | --- | --- |
| Entry gate | complete | `main` merge `19ada46`; Stage 7/7A/7B are ancestors |
| SQ-A | complete | `docs/evidence/sound-quality/RESEARCH.md`, `QUALITY-PROFILE.md`, `STIMULUS-MATRIX.md`, `LISTENING-PROTOCOL.md` |
| SQ-B | complete | `docs/evidence/sound-quality/ANALYZER.md`; bounded analyzer/reference tests |
| SQ-C | complete | `docs/evidence/sound-quality/SQ-C-PRIMITIVES.md`; native/Web/WASM parity, Rust, TypeScript and policy checks |
| SQ-D | complete | `SQ-D-MACRO-MAPPING.md` and deterministic 275-probe report; quality and Web/WASM workflows pass |
| SQ-E | complete | 648-probe current-catalog report; baseline/final evidence; 27 blinded bundles, 108 level-matched WAVs and 29 trials |
| SQ-F | deferred post-merge | Technical package ready; observations absent; no preference/freeze claim |
