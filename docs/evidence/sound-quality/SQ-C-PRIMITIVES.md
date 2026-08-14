# SQ-C synth primitive bakeoff

Date: 2026-08-14

Branch: `feature/synth-quality-primitives`

Machine-readable evidence:
`docs/evidence/sound-quality/SQ-C-PRIMITIVE-BAKEOFF.json`.

## Decision

The MVP has one current fixed-state DSP implementation and one synth render path.
Naive Square/Triangle and memoryless saturation exist only inside this bounded offline bakeoff as
controls. They are not project, protocol, native or Web runtime paths.

Accepted primitives:

- zero-mean dual-edge `PolyBLEP` pulse, including 50% Square;
- DC-stable leaky integration of the band-limited pulse for Triangle;
- first-order antiderivative antialiasing (`ADAA`) for synth nonlinear colour;
- bounded smoothstep ADSR segments with click-safe retrigger and exact release cleanup.

The first Triangle candidate reset its integration state every oscillator period. The objective
gate rejected it because alias energy regressed by 10.24 dB. The accepted leaky integrator removes
that discontinuity and improves the same measure by 8.09 dB.

## Reproducible method

`npm run evidence:synth-quality-primitives` directly launches one bounded Rust evidence binary
through the repository lifecycle owner. `npm run check:synth-quality-primitives` recomputes the
same six probes and requires the committed report to match byte for byte.

Each probe uses 2,048 warm-up frames followed by the analyzer's bounded 8,192-frame capture. Test
frequencies are coherent with the 2,048-point FFT and normalized by sample rate, so 44.1 and 48 kHz
exercise equivalent spectra without leakage being mistaken for aliasing. Both channels receive the
same samples; stereo processing is outside this primitive-level comparison.

Frozen acceptance gates require:

- at least 3 dB less harmonic alias energy than the offline control;
- candidate harmonic alias ratio at or below -18 dB;
- absolute DC below 0.002;
- candidate/control RMS ratio from 0.75 through 1.25;
- sample peak no greater than 1.0 and reconstructed true peak no greater than 1.35;
- no sample-discontinuity regression beyond a 1.05 ratio.

## Results

| Primitive  | Control alias | Candidate alias | Improvement | RMS ratio | Candidate true peak |
| ---------- | ------------: | --------------: | ----------: | --------: | ------------------: |
| Square     |     -12.75 dB |       -30.86 dB |    18.10 dB |     0.935 |               1.127 |
| Triangle   |     -35.06 dB |       -43.15 dB |     8.09 dB |     1.013 |               0.985 |
| Saturation |     -14.75 dB |       -29.89 dB |    15.14 dB |     0.803 |               0.998 |

The normalized results are identical at 44.1 and 48 kHz. Maximum accepted DC is 0.000129; all
candidate samples are finite and bounded. These results qualify the primitives for integration
into the one current patch/render path. Catalog-level quality, native/Web parity and callback
budgets remain SQ-C exit gates rather than claims of this isolated bakeoff.

## Production integration

The accepted primitives now run through one unsuffixed synth contract in project state, render
plans, generated TypeScript/Rust protocol bindings, native playback, offline rendering and the Web
AudioWorklet. The cutover also adds explicit per-family key tracking and velocity-to-amplitude,
filter and attack response. All controls are finite and bounded at the shared validation boundary.

The MVP loader accepts only the current project, patch and macro shapes. It has no synth conversion,
earlier patch decoder, alternate preset registry or alternate render path. Retired catalog reports,
witness audio and generation/analyzer entry points were removed rather than retained beside the
current evidence.

Verification completed on 2026-08-14:

- project/application/policy tests pass;
- Rust formatting, checking, Clippy with warnings denied and all Rust tests pass;
- real-time synth tests retain zero callback allocations and bounded voice cleanup;
- native/Web parity passes five representative synth families, procedural drums, live controls and
  bounded failure cases;
- the release Web engine artifact is 642,968 bytes;
- the committed primitive report regenerates byte-for-byte at 44.1 and 48 kHz.
