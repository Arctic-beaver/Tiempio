# Sound quality profile

## Freeze policy

This profile is frozen before Stage 8 candidate ranking. A threshold may change only through a
reviewed plan change that reruns the current evidence and explains the measurement defect. It must not be
loosened to admit a preferred candidate.

All levels compare deterministic, equal-duration stimuli at the same sample rate. Role-specific
exceptions must be declared in the stimulus manifest, never inferred after rendering.

## Hard safety gates

| Measure                                    | Gate                                                   |
| ------------------------------------------ | ------------------------------------------------------ |
| Non-finite output                          | exactly `0` samples                                    |
| Output-guard non-finite replacement        | exactly `0`                                            |
| Unexpected output-guard ceiling clamp      | exactly `0`                                            |
| Default single-note true peak              | at most `-3.0 dBTP`                                    |
| Chord, overlap and protected mix true peak | at most `-1.0 dBTP`                                    |
| Absolute per-channel DC                    | at most `0.001` (`-60 dBFS`)                           |
| Tail                                       | below `-80 dBFS` by declared maximum tail; never stuck |
| Pitch error after attack                   | at most `5 cents` absolute for pitched/default probes  |
| Realtime allocation                        | zero allocation and deallocation after warm-up         |
| Native/Web model                           | one shared Rust path; no target-private quality fork   |

## Oscillator and nonlinear gates

- Controlled Saw/Square/Pulse/Triangle sweep alias ratio: at most `-48 dB` below 2 kHz,
  `-42 dB` from 2–6 kHz and `-36 dB` above 6 kHz within the approved role range.
- The current SQ-C high-register controls require harmonic-alias ratios at or below `-30 dB` for
  Square/Pulse, `-40 dB` for Triangle and `-28 dB` for nonlinear colour at matched level.
- Controlled nonlinear-colour probes may not exceed the true-peak gate.
- Oscillator fundamental amplitude may vary by at most `1.5 dB` between 44.1 and 48 kHz.

## Level and register gates

- Defaults within one family: K-weighted comparison-level spread at the role phrase is at most
  `4.0 dB`; pairwise trials are matched to within `0.25 dB`.
- One preset across low/middle/high role notes: comparison-level spread is at most `6.0 dB` after
  the declared role allowance.
- Velocity 32 remains audible and reaches at least `-42 dBFS` RMS in the held-note window.
- Velocity response is strictly non-decreasing in level; velocity 120 is `6–18 dB` above velocity
  32 before trial matching and also changes the declared expressive descriptor.
- Preset switching may not create a true-peak jump greater than `3 dB` at matched audition input.

## Stereo gates

- Mono fold-down RMS loss is no worse than `-3.0 dB` at defaults and any macro corner.
- Inter-channel correlation is at least `-0.20` for any published synth surface.
- Energy below 160 Hz in the side channel is at least `18 dB` below corresponding mid energy for
  Bass and `12 dB` below for other pitched families.
- Width movement must not shift measured fundamental pitch by more than `2 cents`.

## Envelope and continuity gates

- Onset one-sample discontinuity is at most `0.08` full scale and may not be the largest peak of a
  normal note unless the role explicitly declares a percussive transient.
- Measured attack and release duration may differ by at most 15% between 44.1 and 48 kHz.
- Published live macro sweeps have no adjacent level jump above `1.0 dB`, centroid jump above one
  octave, or parameter discontinuity outside a documented plateau.

## Macro gates

Across the representative, level-matched sweep:

- Brightness, Length and Width: absolute Spearman `rho >= 0.90` in the named direction;
- Hardness and Dirt: absolute Spearman `rho >= 0.85` in the named direction;
- no unexplained reversal;
- no dead zone longer than 25% of the control travel;
- every low/default/high and pairwise dangerous corner also clears peak, alias, tail, mono and CPU
  gates.

## Runtime gates

- Native and WASM deterministic fixture samples agree within `1e-9` before PCM quantization and
  produce the same PCM16 hash where the target arithmetic permits it.
- At 32 active synth voices and the production block size, p99 render time is at most 65% of the
  block deadline on each declared reference target.
- Any primitive that cannot meet the declared native and WASM callback budgets is rejected or
  simplified; the deadline is never raised to admit it.

## Subjective floors

- Seven-point `want to use` and role-fit median: at least `5` each.
- Lower quartile for both: at least `4`.
- Replacement versus current: positive lower bound of the paired 95% bootstrap confidence
  interval, or a predeclared non-inferiority role decision.
- The same critical artifact independently reported by two trained listeners blocks the candidate.
