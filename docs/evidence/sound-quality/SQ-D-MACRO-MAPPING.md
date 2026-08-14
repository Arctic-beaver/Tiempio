# SQ-D perceptual macro mapping

Date: 2026-08-14

Branch: `feature/perceptual-macro-mapping`

Machine-readable evidence:
`docs/evidence/sound-quality/SQ-D-MACRO-MAPPING.json`.

## Decision

The MVP uses the same application-owned preset catalog, semantic macro model and synth render path
across Desktop, Web, native and WASM. Project and runtime boundaries accept exactly these current
shapes.

The five user-facing macros remain `Brightness`, `Hardness`, `Dirt`, `Length` and `Width`, but their
resolved patch changes are family-aware. Each preset owns a fixed seed and inherits a bounded family
profile. The mapping is deterministic and frozen into the render plan before entering the real-time
engine.

Production corrections made during the objective gate:

- a reusable 5 Hz DC blocker removes oscillator/filter bias without attenuating the 41 Hz register;
- a 160 Hz side high-pass keeps low frequencies mono-stable while preserving high-frequency width;
- Lead and Pad width use fixed secondary detune, motion and stereo balance instead of
  macro-controlled primary-oscillator beating;
- Pluck length has family-specific loudness compensation and a bounded 1.3 output-gain ceiling;
  the strictly-positive compensation formula is not clipped by a shared gain floor;
- short Pluck spectra are captured after 50 ms, while onset and steady DC retain the 3.5-second
  analysis point, so every gate measures an audible and relevant window.

## Reproducible method

`npm run evidence:sq-d-macros` compiles the current TypeScript mapping, creates 275 production render
plans and analyzes them through the release offline renderer under the repository lifecycle owner.
`npm run check:sq-d-macros` recomputes the same matrix and requires the committed report to match
byte for byte.

The matrix covers five representative families and all five semantic macros at eleven values from
0.0 through 1.0. Every probe uses the production project-to-wire compiler and the same Rust synth,
DSP and render kernel used by native and Web playback. Group validation aggregates all continuity
and rank-correlation failures in one result.

Frozen gates require:

- zero non-finite samples and zero output-guard clipping;
- true peak at or below -1 dBTP, steady absolute DC at or below 0.001 and maximum sample
  discontinuity at or below 0.08;
- mono fold loss at or above -3 dB and interchannel correlation at or above -0.2;
- low-side/mid at or below -18 dB for Bass and -12 dB for other families;
- adjacent level changes at or below 1 dB and adjacent centroid ratios at or below 2;
- Spearman `rho >= 0.90` for Brightness, Length and Width and `rho >= 0.85` for Hardness and Dirt.

## Results

| Measure                              | Observed worst case |       Gate |
| ------------------------------------ | ------------------: | ---------: |
| Brightness/Length/Width Spearman rho |              0.9535 |    >= 0.90 |
| Hardness/Dirt Spearman rho           |              0.8677 |    >= 0.85 |
| Adjacent level delta                 |           0.9805 dB |  <= 1.0 dB |
| Adjacent centroid ratio              |              1.1661 |     <= 2.0 |
| True peak                            |        -9.8731 dBTP | <= -1 dBTP |
| Steady absolute DC                   |            0.000158 |   <= 0.001 |
| Maximum discontinuity                |            0.058807 |    <= 0.08 |
| Mono fold loss                       |          -0.0927 dB |   >= -3 dB |
| Interchannel correlation             |              0.9578 |    >= -0.2 |
| Bass low-side/mid                    |         -28.3219 dB |  <= -18 dB |
| Other-family low-side/mid            |         -17.2160 dB |  <= -12 dB |

All 275 probes and all 25 family/macro sweeps pass. The current report is the SQ-D objective artifact;
subjective listening and catalog presentation continue in SQ-E and SQ-F.
