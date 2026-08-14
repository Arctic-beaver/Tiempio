# Sound-quality stimulus matrix

## Bounded matrix

Primary rates are 44.1 and 48 kHz with 128-frame blocks. The complete automated matrix is capped at
2,048 renders and 45 minutes through the lifecycle owner. Generation fails before rendering if a
manifest expansion exceeds either ceiling.

## Role ranges

| Family  |     Low |  Middle |    High | Polyphony probe                         |
| ------- | ------: | ------: | ------: | --------------------------------------- |
| Bass    | MIDI 28 | MIDI 40 | MIDI 55 | unison + octave, 4 overlapping releases |
| Lead    | MIDI 55 | MIDI 69 | MIDI 84 | unison + fifth, fast octave alternation |
| Pad     | MIDI 48 | MIDI 60 | MIDI 76 | triad and 8-voice release overlap       |
| Pluck   | MIDI 48 | MIDI 64 | MIDI 84 | repeated 16th notes and triad           |
| Texture | MIDI 40 | MIDI 60 | MIDI 79 | triad plus sustained noise/motion       |

The drum positive control covers all 15 variants at velocities 32, 80 and 120 plus the protected
Clean Pulse pattern and compact Bass/Lead/Pad mix.

## Default probes per synth preset and rate

1. Low/middle/high held note at velocities 32, 80 and 120.
2. Short tap, held note and note-off during attack or decay.
3. Repeated staccato, retrigger, octave leap and fast pitch alternation.
4. Role-appropriate interval/chord and bounded release overlap.
5. Solo, mono fold-down and protected-drum compact mix.

## Macro probes

- each macro at 0, default and 1 with other macros at default;
- an 11-point one-axis sweep for rank direction and continuity;
- deterministic pairwise/corner coverage generated from the declared interaction list;
- a 32-point scrambled Sobol-style binary digital-net sample for the five-dimensional safe
  surface; the seed and index range are part of the manifest.

The matrix does not enumerate an unbounded Cartesian product.

## Controlled DSP probes

- Sine/Saw/Square/Pulse/Triangle oscillator sweeps at MIDI 28–96, including role boundaries;
- nonlinear colour at five drive levels and three input levels, with output level matching;
- impulse, full-scale sine, inter-sample peak and silence reference fixtures;
- hard-left/right, anti-phase, low-side and mono stereo fixtures;
- minimum/maximum envelope, retrigger and release cleanup fixtures.

## Determinism

Noise and any phase variation use a stable voice-identity seed. Every row contains the catalog,
preset, patch, macro-mapping, stimulus and analyzer revision plus the expected render count. The
report records PCM16 FNV-1a and SHA-256 hashes for retained artifacts.
