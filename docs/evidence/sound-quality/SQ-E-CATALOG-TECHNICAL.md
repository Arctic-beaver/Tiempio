# SQ-E curated catalog technical evidence

Date: 2026-08-14

Branch: `feature/curated-sound-catalog`

Machine-readable evidence:

- `SQ-E-CATALOG-BASELINE-SUMMARY.json` records the measured before/after decision;
- `SQ-E-CATALOG-TECHNICAL.json` contains all 648 retained measurements;
- `SQ-F-AUDITION-MANIFEST.json` and `SQ-F-AUDITION-KEY.json` define the blinded study package.

## Architecture decision

The application still owns exactly one catalog in `packages/project-core`. Candidate generation,
rendering, analysis, normalization and study packaging remain bounded offline tooling. Desktop,
Web, native and WASM continue to consume the same resolved patch and production engine; no
candidate registry, alternate catalog or target-private render path was added.

The first baseline exposed a measurement-boundary problem before catalog tuning: an all-sample
slope maximum treated legitimate bright waveforms as clicks, raw peaks made noise attacks
rate-sensitive, and Bass pitch detection ignored the intentional sub oscillator. The shared
catalog analyzer was therefore extracted from the SQ-D binary and corrected with a 5 ms onset
envelope, local-RMS-normalized and sub-aware/interpolated pitch anchors, and event-boundary
residuals measured against the adjacent musical slope. The original all-sample maximum remains a
diagnostic; the click gate uses the event residual in synth-only single, role-phrase and polyphony
contexts. A combined drum-mix transient cannot be attributed to one source, so that context uses
the paired synth-only phrase for click safety and retains its own peak, DC, stereo and tail gates.
This analyzer is offline-only and does not enter the real-time callback.

## Reproducible matrix

`npm run evidence:sq-e-catalog` compiles the current TypeScript catalog and expands exactly 648
production render plans, then runs the release Rust renderer through the repository lifecycle
owner. The bounded matrix covers all 27 presets at 44.1 and 48 kHz with nine isolated probes per
rate (low/middle/high role notes at velocities 32/80/120), plus role phrase, family-specific
polyphony/retrigger stress and a compact protected-drum mix. Sustained sounds cross a late analysis
window; Plucks use an early audible spectral window; every eight-second plan retains a bounded tail.

The same command writes 27 blinded candidate bundles with four WAV contexts each (108 files) to
`artifacts/sq-f-audition`, verifies level match and headroom after matching, hashes every file and
writes the public blind manifest plus a separate coordinator key. `npm run check:sq-e-catalog`
rebuilds the matrix and WAV bytes in memory and requires all three committed JSON reports to match
byte for byte.

## Catalog changes

The baseline family spreads were 4.681 dB Bass, 6.772 dB Lead, 7.607 dB Pad, 7.178 dB Pluck and
5.550 dB Texture. Per-preset output gains were moved to each family's measured K-weighted median;
this preserves velocity response and patch topology rather than hiding the mismatch with a new
dynamics stage. `pad.motion` received a further 0.16 dB trim after its dense chord measured 0.05 dB
above the frozen true-peak limit.

Level matching also exposed an obsolete shared `0.18` output-gain floor: the lower `pluck.bell`
seed hit that floor during the Length sweep, clipping the declared loudness compensation and
creating a 1.43 dB step. The compensation formula is already finite and strictly positive, so the
resolver now preserves it down to zero while retaining each family's explicit upper ceiling. The
frozen SQ-D continuity matrix guards this boundary.

`pluck.glass` was the only stable transient pitch outlier. A local 220 ms decay candidate cleared
the isolated pitch and tail gates but failed the frozen SQ-D Length-continuity gate, so it was
rejected and the production 150 ms decay was retained. Local-RMS normalization removed the
short-decay bias in the analyzer instead of changing the sound. No names or descriptions changed.
Drums were not modified.

## Results

| Measure                         | Observed worst case |       Gate |
| ------------------------------- | ------------------: | ---------: |
| Family default level spread     |            0.240 dB |    <= 4 dB |
| Blinded asset level-match error |         0.000170 dB | <= 0.25 dB |
| Production polyphony true peak  |        -1.0377 dBTP | <= -1 dBTP |
| Blinded asset true peak         |        -1.1915 dBTP | <= -1 dBTP |
| Synth event residual            |            0.067719 |    <= 0.08 |
| Steady absolute DC              |            0.000901 |   <= 0.001 |
| Mono fold loss                  |          -0.0990 dB |   >= -3 dB |
| Interchannel correlation        |              0.9549 |    >= -0.2 |

All 648 probes pass the hard, role, velocity, stereo, tail, pitch, cross-rate and runtime-facing
technical gates. Five directed nearest-neighbour rows remain, representing three unique pairs:
`bass.deep`/`bass.warm`, `bass.soft`/`bass.warm` and `texture.pulse`/`texture.wire`. They are flagged
for blind review and are not auto-deleted; technical proximity is not a preference decision.

## SQ-F handoff

The study package contains 27 name-hidden, level-matched candidate bundles, four context WAVs per
candidate (108 files total), and 29 balanced trials, including all technical-neighbour pairs. Its
status is `awaiting-human-observations`; it contains no response rows and makes no preference or
catalog-freeze claim. SQ-E is technically complete. SQ-F remains externally blocked until both
trained/critical and target-creator panels provide valid observations.
