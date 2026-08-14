# Stage 8 perceptual-audio research synthesis

## Scope

This note records the research assumptions used by Tiempio's offline sound lab and catalog review.
It is an engineering interpretation for deterministic product comparisons. Tiempio does not claim
formal compliance with any referenced standard.

## Primary sources

- [ISO 226:2023](https://www.iso.org/standard/83117.html) specifies equal-loudness combinations
  for pure continuous tones under controlled binaural free-field conditions. It justifies treating
  frequency, register and playback level as interacting variables; it does not provide a direct
  score for short, complex synth notes.
- [ISO 532-1:2017](https://www.iso.org/standard/63077.html) defines stationary and time-varying
  Zwicker loudness methods. Tiempio records a simpler K-weighted comparison level for the bounded
  automated matrix and reserves a Zwicker implementation for a separately validated lab revision.
- [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en) defines a reproducible
  loudness algorithm and true-peak guidance. Tiempio uses the K-weighting structure, channel-energy
  summation and 4x oversampled peak principle for level matching. Fixed short synth stimuli are not
  broadcast programmes, so the result is labelled `kWeightedLevelDb`, not LUFS compliance.
- [ITU-R BS.1534-3](https://www.itu.int/rec/R-REC-BS.1534-3-201510-I/en) covers controlled blind
  presentation, assessor preparation, power analysis, exploratory analysis and confidence
  reporting for intermediate audio quality.
- [ITU-R BS.1116-3](https://www.itu.int/rec/R-REC-BS.1116-3-201502-I/en) motivates trained
  listeners, randomized conditions, appropriate controls and explicit reporting for subtle
  technical artifacts. Tiempio uses an internal derivative rather than claiming a formal BS.1116
  test.
- [Välimäki, Nam, Smith and Abel (2010)](https://research.aalto.fi/en/publications/alias-suppressed-oscillators-based-on-differentiated-polynomial-w/)
  show why differentiated polynomial correction is a bounded candidate for discontinuous virtual
  analog waveforms.
- [Pekonen (2014)](https://research.aalto.fi/en/publications/filter-based-oscillator-algorithms-for-virtual-analog-synthesis/)
  documents disturbing aliasing from trivial waveforms, band-limited step/impulse approaches and
  the need to relate computational measures to audibility.
- [McAdams et al. (1995)](https://articles.ircam.fr/textes/McAdams95a/) supports treating attack,
  spectral distribution and spectral variation as useful timbre coordinates while retaining
  listener-specific weights and attributes.

## Deterministic quantities

For stereo samples `l[n]` and `r[n]`, with `N` frames:

- sample peak: `p = max(|l[n]|, |r[n]|)`;
- decibels relative to full scale: `dBFS(x) = 20 log10(max(x, 1e-15))`;
- unweighted RMS: `sqrt(sum(l[n]^2 + r[n]^2) / (2N))`;
- crest factor: `20 log10(peak / max(RMS, 1e-15))`;
- DC per channel: arithmetic mean of that channel;
- mid/side: `m[n] = (l[n] + r[n]) / 2`, `s[n] = (l[n] - r[n]) / 2`;
- correlation: normalized cross-energy of left and right with a zero-energy special case;
- spectral centroid: `sum(f[k] A[k]) / sum(A[k])` on the declared analysis window;
- roll-off: the lowest bin containing 95% of declared spectral energy;
- spectral flux: positive frame-to-frame change in normalized magnitudes;
- pitch error in cents: `1200 log2(measuredHz / expectedHz)`;
- Spearman direction: Pearson correlation of average ranks, including tied ranks.

The true-peak approximation reconstructs four evenly spaced phases with a fixed, normalized
windowed-sinc low-pass kernel, then takes the maximum absolute reconstructed value. The kernel,
phase count and edge padding are frozen fixtures. This follows the BS.1770-5 oversampled-peak
principle but is not described as a certified meter.

The K-weighted comparison level applies the documented high-frequency pre-filter and RLB-style
high-pass stages, accumulates stereo mean-square energy, and reports
`-0.691 + 10 log10(sum(channelEnergy))`. Tiempio compares identical-duration, identically gated
stimuli. Formal programme gating and multichannel weights are outside revision 1.

## Aliasing probe

For an oscillator at fundamental `f0` and sample rate `fs`, intended harmonic bins are integer
multiples `h f0 <= fs/2`, with a tolerance window declared by the probe. Energy outside those
windows, after excluding DC and the analysis window's calibrated leakage floor, is counted as
foldback/alias energy. The report records both absolute energy and
`10 log10(aliasEnergy / intendedEnergy)`.

This metric can misclassify intentional inharmonic content, noise or nonlinear colour. Therefore it
is a hard gate only for controlled oscillator and saturation probes. Musical Texture presets use
the metric as a diagnostic alongside their declared source components and listening evidence.

## Perceptual mapping rules

- Frequency and time endpoints interpolate exponentially: `a * (b / a)^t`.
- Gain interpolation occurs in decibels and returns to linear gain with `10^(dB / 20)`.
- Equal-power blends use sine/cosine gains over `[0, pi/2]`.
- Live blend curves use a cubic smoothstep, `t^2(3 - 2t)`, unless an explicit mapping declares a
  different continuous curve.
- Level matching is applied before preference comparison; it never mutates the stored patch.

## Limits of inference

Objective descriptors reject defects, expose duplicates and verify macro direction. They do not
establish beauty or desire to use a sound. PCA, multidimensional scaling and Pareto ranking are
exploration aids only. Final active-catalog freeze requires valid trained-listener and target-user
observations collected under the separately frozen protocol.
