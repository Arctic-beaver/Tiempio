# Sound-quality analyzer

## Scope and ownership

The deterministic perceptual-analysis and candidate-comparison lab lives in
`tiempio-engine-offline-render`. It consumes the same validated render plan and offline engine as
the native/WASM real-time paths, but it is not linked from application, native-host or Web runtime
crates. Analysis may allocate bounded working buffers; no part of it runs in the audio callback.

Full catalog reports are generated from the application-owned catalog during SQ-D through SQ-F and
exercise the production renderer.

## Streaming and bounded analysis

The analyzer streams the full render for safety, level and stereo counters and retains at most
8,192 mono frames after a stimulus-specific analysis offset for spectral and pitch work.

| Axis          | Current implementation                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peak          | Sample peak plus 4-phase, 16-tap windowed-sinc inter-sample estimate; the estimate is never lower than sample peak.                                                                                 |
| Level         | Full-render stereo RMS and sample-rate-derived K-weighting filters with the BS.1770 channel coefficient.                                                                                            |
| Spectrum      | 2,048-point Hann-windowed radix-2 FFT, 1,024-frame hop, centroid, 95% rolloff and positive spectral flux.                                                                                           |
| Pitch         | Expected-register-bounded normalized autocorrelation after local-RMS envelope normalization, with sub-sample lag interpolation; catalog anchors account for an intentional dominant sub oscillator. |
| Alias control | Energy outside bins around the expected harmonic series, evaluated only for controlled periodic references.                                                                                         |
| Stereo        | Inter-channel correlation, mid-energy mono fold loss, and side/mid energy below a 160 Hz one-pole low-pass.                                                                                         |
| Onset/tail    | A 5 ms envelope follower for rate-stable onset, trailing frames below amplitude `1e-4`, whole-render slope diagnostics and event residuals over adjacent musical slope for click gates.             |
| Safety        | Non-finite replacement and output-ceiling-clamp counters remain sourced from the engine health snapshot.                                                                                            |

Event residuals are evaluated only where the synth is the sole rendered source: isolated notes,
role phrases and polyphony. In the protected-drum mix, an intentional drum transient cannot be
separated from a simultaneous synth boundary in the summed waveform. Click safety therefore comes
from the paired synth-only phrase, while the combined render retains peak, DC, stereo and tail
gates.

This is not a claim of formal ITU conformance. The analyzer reports ungated whole-render
K-weighted level rather than a complete BS.1770 programme-loudness gate, and its compact true-peak
filter is a documented 4x approximation. The harmonic-bin ratio is a deterministic defect probe,
not a psychoacoustic alias audibility model. Human desirability still requires the blind protocol.

## Reference fixtures

`analyzer-reference.json` defines three bounded controls at 48 kHz and 8,192 frames:

- a bin-centred 468.75 Hz sine must remain within 8 cents, below -50 dB unwanted harmonic energy,
  and between 0.49 and 0.51 true peak;
- the same signal with an inharmonic 7,312.5 Hz component must exceed the -15 dB defect floor;
- an anti-phase control must measure correlation at or below -0.999 and mono loss at or below
  -100 dB.

The clean control measures -81.29 dB unwanted harmonic energy, remains inside the frozen 8-cent
pitch bound and reaches -6.02 dBTP. The injected defect measures -6.02 dB unwanted harmonic
energy. The anti-phase control measures -1.0 correlation and -150 dB mono loss.

## Candidate-space and comparison contract

`exploration-plan.json` defines 64 samples across eight bounded dimensions: oscillator blend,
pulse width, filter cutoff/resonance, drive, envelope curve, stereo width and space mix. A fixed
integer generator creates a jittered Latin hypercube. Every dimension visits all 64 strata exactly
once.

Candidate reports accept at most 256 candidates and 32 objectives. They reject missing or
non-finite metrics and duplicate identifiers, retain absolute hard-gate failures, normalize
objective direction so positive always means improvement, and assign deterministic non-dominated
Pareto fronts only to gate-passing candidates. This machinery ranks objective tradeoffs; it never
chooses a timbre or substitutes for listener evidence.

Native/WASM callback cost, allocation and parity gates belong to SQ-C. Blind preference and device
panels belong to SQ-F.
