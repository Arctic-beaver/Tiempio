# Stage 4 engine core acceptance evidence

Date: 2026-08-10

Task integration branch: `feature/skeleton-engine-core`

Delivery branches:

- `feature/engine-protocol-contracts`;
- `feature/engine-dsp-primitives`;
- `feature/engine-transport-synth`;
- `feature/engine-offline-proof`.

## Accepted architecture

- One strict, length-prefixed, typed JSON protocol accepts the shared Stage 3
  Bass render plan. It validates versions, capabilities, sequence/revision
  monotonicity, UTF-8, JSON depth, identifiers and every collection ceiling
  before engine preparation.
- `tiempio-engine-dsp` owns dependency-free finite stereo DSP primitives;
  `tiempio-engine-core` owns validated plans, checked rational tempo, prepared
  scheduling, transport, revisioned block-boundary publication and health;
  `tiempio-engine-synth` owns the fixed 64-slot `DeepBassVoice` pool;
  `tiempio-engine-offline-render` composes those same production boundaries.
- The render callback has no JSON, filesystem, platform, allocation, lock,
  sort or I/O path. Its allocator harness warms the real Bass engine, performs
  a plan swap, renders 64 blocks and observes zero allocations, deallocations
  or output-capacity changes.
- Offline rendering allocates one bounded block, streams it to a caller-owned
  sink, polls cancellation only at block boundaries and enforces the shared
  ten-minute ceiling. PCM16 WAV output uses one fixed 8,192-byte conversion
  buffer and declares its exact frame count in advance.
- Native host and Web worklet remain thin compiling future adapters. Stage 4
  contains no audio-device, Electron, browser, project persistence or UI
  integration.

## Deterministic golden phrase

Source: `fixtures/engine-protocol/valid-bass-plan.json` through an accepted
`start-offline-render` protocol command.

Configuration: 48,000 Hz, stereo f64 engine samples, 128-frame blocks, end tick
3,840, project revision 7 and plan generation 1. PCM evidence is symmetric
signed 16-bit little-endian quantization after the production output guard. The
committed digest is FNV-1a 64 over interleaved PCM bytes; floating metrics use
explicit cross-platform tolerances in `offline_proof.rs`.

| Metric                           |              Golden value |
| -------------------------------- | ------------------------: |
| Frames / blocks                  |             106,667 / 834 |
| Peak                             |               0.365004326 |
| RMS                              |               0.127433346 |
| DC left / right                  | 0.000450464 / 0.000453556 |
| Non-silent frames                |                    88,226 |
| Leading / trailing silent frames |                 1 / 9,220 |
| First / last non-silent frame    |                1 / 97,446 |
| Low band, below 200 Hz           |               0.014300652 |
| Mid band, 200-2,000 Hz           |               0.001523968 |
| High band, above 2,000 Hz        |               0.000050375 |
| Clipped / non-finite samples     |                     0 / 0 |
| PCM16 FNV-1a 64                  |        `8e3d8e2e6e48671a` |

Two independent metric renders and two complete in-memory WAV renders are
byte-for-byte deterministic in the test suite. The evidence workflow performs
the metric comparison again and writes a third review copy to the ignored
`artifacts/engine/stage-4-deep-bass.wav` together with
`stage-4-metrics.json`.

Run `npm run evidence:engine` to regenerate both artifacts under the bounded
lifecycle owner. The 2026-08-10 non-gating local baseline rendered 2.222 seconds
of audio in 96.2 ms (23.1x real time); the worst observed render block was
0.337 ms. Timing is retained only as a development baseline and never gates
shared-machine checks.

## Covered failure and lifecycle cases

- malformed UTF-8, over-deep JSON, oversized frames, unknown fields and an
  unsupported Drum source fail closed with stable protocol diagnostics;
- stale revision/generation cannot replace the active plan, and an
  acknowledgement appears only after a block-boundary activation;
- checked tempo conversion covers tempo segments and cross-language integer
  ceilings; scheduler ordering is note-off before note-on and rejects more than
  512 actions at one sample;
- stop, seek, loop wrap and plan swap reset scheduled notes while audition
  identities remain independently controlled;
- retrigger, unknown/repeated note-off, oldest-release/oldest-active stealing
  and all 64 voice slots are deterministic;
- cancellation, duration overflow and sink failure stop without buffering an
  unbounded tail or leaving active voices;
- oscillator, ADSR, filter, smoother, saturation, mixer and output guard tests
  cover bounds, stability, DC, clipping and non-finite containment.

The first link of each newly added Windows Rust test binary spawned the exact
task-owned MSVC `VCTIP.EXE` helper after `link.exe` exited. The lifecycle owner
identified it by PID, creation time, the recorded `link.exe` parent and the
Visual Studio command line, terminated only that owned helper and the
post-incident audit found no survivor, lock or quarantine. The bounded
natural-exit grace is now 15 seconds so one-shot compiler helpers can finish
normally. Only this exact, already-owned compiler auxiliary may be cleaned and
reported without failing an otherwise successful step; every other survivor
fails closed and receives the same exact-identity cleanup.

## Human review checklist

The ignored WAV is available for subjective review of:

- two clearly distinct low Bass notes with silence between phrases;
- controlled attack and release without a stuck tail;
- centered deep/sub-heavy character with restrained stereo width;
- absence of clicks, harsh clipping or unexpected level jumps.

The objective suite establishes finite, audible, non-silent and unclipped
output; subjective timbre approval remains a product review rather than an
automated gate.

## Final automated acceptance

- `npm run test:lifecycle`: 46/46 lifecycle and ownership tests passed;
- `npm run check:quick`: 19/19 bounded stages passed, including 57 application
  contract tests, 68 repository-policy tests and 47 Rust tests;
- `npm run checks`: 29/29 bounded stages passed, including production Desktop
  and Web builds, CSP verification and per-target bundle budgets;
- `npm run evidence:engine`: the committed golden PCM digest and all objective
  metrics reproduced exactly;
- the lifecycle audit after every workflow reported no recorded process, lock
  or cleanup quarantine.

## Acceptance conclusion

Stage 4 provides the engine skeleton required by later native and Web hosts: a
single validated cross-language plan becomes an acknowledged deterministic
Rust engine revision, uses the production no-allocation callback and streams
repeatable offline audio. Device hosting, AudioWorklet packaging and application
transport wiring remain explicitly assigned to later skeleton stages.
