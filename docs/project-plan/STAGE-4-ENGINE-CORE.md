# Stage 4 — DSP core, protocol and deterministic offline proof

## Status and scope

This document is the implementation plan for Stage 4 of
`APPLICATION_SKELETON.md`. The task integration branch is
`feature/skeleton-engine-core`.

Implementation status: completed through four reviewed stage branches;
acceptance evidence is recorded in `docs/evidence/STAGE-4-ENGINE-CORE.md`.
The task branch was subsequently fast-forwarded into local `main` at `d835cf9`; no push or remote
integration is implied by that local history.

The outcome is a platform-neutral Rust engine that accepts one bounded,
versioned render-plan contract and renders the reviewed `Deep` Bass patch
deterministically without Electron, browser APIs, filesystem authority, an
audio device or a JavaScript event loop.

This stage does not connect a native audio backend, supervise a child process,
add Electron IPC, compile an AudioWorklet, implement browser audio activation,
persist projects, implement the drum synthesizer, expose export UI or make the
shared application audible. Those are Stage 5–7 responsibilities. Stage 4
provides the protocol, DSP and offline proof those adapters must reuse.

## Source of truth

The implementation follows:

- `docs/architecture/TIEMPIO_ARCHITECTURE.md`, especially Render-plan and
  engine protocol, Real-time engine rules, State authorities and Performance
  boundaries;
- `docs/project-plan/APPLICATION_SKELETON.md` Stage 4;
- `docs/electronic_music_studio_concept(1).md` for the curated Bass/Deep sound
  intent;
- the Stage 3 `ProjectRenderPlan`, resolved patch model and revision semantics.

The existing protocol constants and Rust crates are scaffolding, not a reason
to preserve an inverted dependency or an underspecified `unknown` payload.
Stage 4 may refine those boundaries while retaining protocol versioning and
cross-language generated-file checks.

## Inherited contracts and starting point

Stage 3 already provides:

- the current project schema and patch model;
- a fully resolved `Deep` Bass patch with values rounded to six decimal places;
- a deterministic, revision-bound TypeScript render plan;
- stable layer, clip, note and event IDs;
- integer project time at 960 ticks per quarter;
- explicit mute, solo, gain, pan, loop and tempo data;
- rejection of stale render-plan compilation requests.

The Rust workspace already separates `protocol`, `core`, `dsp`, `synth`,
`drums`, `native-host` and `web-worklet`, but most crates contain only
foundation placeholders. The current protocol schema supplies stable command,
event, diagnostic and byte-limit constants but not typed payloads or a bounded
wire decoder. The current lifecycle compiles Rust tests but does not execute a
dedicated engine test suite; Stage 4 closes that gap.

## Non-negotiable architecture boundaries

- `ProjectSession` remains the musical-content authority. The engine owns only
  volatile playback, active voices, the audio clock and diagnostics.
- The application sends a validated render-plan projection. The engine never
  parses `.tiempio`, React state, localization data or platform handles.
- Protocol decode, render-plan validation and plan preparation run outside the
  render callback.
- The steady-state render callback allocates and deallocates nothing, takes no
  blocking lock, performs no I/O or logging and never parses JSON.
- Native and Web adapters compose the same Rust core later. Neither target may
  fork or approximate the DSP algorithm.
- Invalid, stale, unsupported or oversized input leaves the last accepted plan
  intact and produces a stable structured diagnostic.
- A protocol failure can terminate a protocol session, but it cannot corrupt
  the project snapshot or produce undefined/non-finite audio.
- Offline rendering drives the exact same scheduler, voice pool and DSP block
  function intended for real-time hosts.

## Crate responsibilities and dependency direction

Stage 4 will make the dependency graph explicit:

```text
tiempio-engine-dsp
        ↑
tiempio-engine-core
        ↑              ↑
tiempio-engine-synth   tiempio-engine-protocol
        ↑              ↑
        └── tiempio-engine-offline-render ──┘

native-host and web-worklet consume the same boundaries in later stages.
```

The arrows mean “is used by”. Responsibilities are:

- `dsp`: sample/frame types, oscillators, envelope, filter, smoothing, safe
  saturation and output guard. It has no dependency on protocol or engine
  orchestration.
- `core`: validated internal render-plan model, integer/fixed-point transport
  conversion, scheduler, transport state, bounded voice arena, block renderer,
  plan-revision state and diagnostics. It knows patch data but not platform
  transports.
- `synth`: the current `DeepBassVoice` implementation and its voice
  factory. It depends on `core` traits and `dsp` primitives.
- `protocol`: generated stable codes plus strict wire DTOs, UTF-8 JSON body
  validation, bounded framing, handshake state and conversion into validated
  core commands. It performs no DSP.
- `offline-render`: a small composition/test crate that combines protocol, core and
  synth, renders into a bounded sink and may encode a reviewed WAV artifact.
  Filesystem and evidence writing stay here, never in `core` or `dsp`.
- `drums`: remains a compiling placeholder in this stage. A plan requiring an
  unavailable drum capability fails explicitly rather than rendering silence
  while claiming success.
- `native-host` and `web-worklet`: continue to compile but receive no device,
  process or browser integration in this stage.

The current `core -> protocol` and `dsp -> core/protocol` scaffold dependencies
will be removed or reversed to match this graph and prevent protocol concerns
from leaking into sample processing.

## Wire protocol decisions

### Shared authority

`packages/contracts/schema/engine-protocol.schema.json` remains the authority
for protocol version, stable command/event/diagnostic codes, capability codes
and limits. The generator will emit deterministic TypeScript and Rust enums or
constants for those closed sets. Rich payload validators may be language-owned,
but committed conformance fixtures must be accepted or rejected identically by
TypeScript and Rust.

The TypeScript surface becomes a discriminated command/event union; production
code must not send an arbitrary `unknown` payload after this stage.

### Encoding and framing

- The control body is strict UTF-8 JSON with one top-level envelope.
- A transport-neutral frame codec uses a four-byte unsigned big-endian body
  length followed by exactly one JSON body. Stage 5 installs it on native IPC;
  Stage 6 adapts the same body semantics to worklet messages.
- Declared length is rejected before body allocation when it exceeds the frame
  limit. Truncated, trailing, invalid UTF-8, over-deep or malformed JSON fails
  closed.
- Envelopes deny unknown required-domain fields, validate every collection
  bound and restrict identifiers by UTF-8 byte length and stable syntax.
- Sequence numbers and project revisions are non-negative integers no greater
  than JavaScript's safe-integer maximum. Each direction is monotonic; replayed
  or out-of-order state-changing commands cannot mutate engine state.

### Handshake and capabilities

A protocol session starts in `awaiting-handshake`, advances once to `ready` and
becomes terminal after an incompatible or corrupt handshake. The handshake
binds:

- protocol version;
- peer kind;
- patch/render-plan model versions;
- supported capability codes;
- effective ceilings;
- sample formats supported by the offline proof.

Initial Stage 4 capabilities include typed protocol framing, full-plan load,
transport, loop, `Deep` Bass, ephemeral audition, diagnostics and offline
render. Live device, drums, WASM and native-host capabilities remain absent and
must not be inferred by clients.

### Commands and acknowledgements

Stage 4 implements typed payloads for handshake, load render plan, play, stop,
seek, set loop, note-on, note-off, diagnostics, offline render/cancel and
shutdown. Other already-reserved command codes remain explicitly unsupported
until their capability is negotiated.

Render-plan acknowledgement contains the accepted project revision and active
plan generation. It is emitted only after the prepared plan becomes active at
an audio-block boundary. Stale plan loads and unsupported deltas never replace
the active revision. Offline completion includes the source project revision so
a stale result cannot be applied to a newer application snapshot.

## Render-plan boundary

The TypeScript project plan is converted into a wire plan with only engine
facts:

- protocol, render-plan and patch-model versions;
- project revision and stable IDs;
- PPQ and a bounded tempo map;
- loop range;
- active Bass layers with gain, pan and resolved patch;
- sorted MIDI note events with absolute integer ticks.

Reference layers never cross this boundary. Drum layers are either absent from
the Stage 4 proof or rejected with `engine.unsupported-source` until the drum
capability exists.

Tempo is normalized at the TypeScript boundary to integer micro-BPM. Rust uses
checked `u128` rational arithmetic to convert each tempo segment into sample
positions with one documented round-to-nearest rule. This avoids cumulative
floating-point transport drift while leaving saved project tempo human-friendly.
Patch and gain values remain finite bounded floating-point control values and
are revalidated before plan preparation.

Events at the same sample have a stable total order: note-off before note-on,
then layer ID, event ID and original plan order. Note duration is converted by
its absolute end tick, so tempo changes inside a note remain correct.

## Transport, scheduler and plan lifecycle

The core transport has explicit `stopped` and `playing` states and owns the
current absolute sample and musical tick projection.

- `play` starts from the acknowledged seek position.
- `stop`, seek, loop wrap and incompatible plan replacement cannot leave a
  scheduled voice indefinitely active.
- Scheduler events are precompiled into sample positions before activation.
- Each block is split only at bounded event offsets; no per-block sort or
  allocation is allowed.
- Loop wrap releases/restarts project-scheduled voices deterministically while
  leaving separately identified audition voices under note-on/note-off control.
- A full plan is validated and prepared in an inactive slot. Publication is
  revisioned, and activation happens only at the next block boundary.
- Old plan storage is reclaimed outside the callback. The handoff uses a
  preallocated bounded exchange; if a small audited SPSC/triple-buffer
  dependency is required, its exact version is pinned and its callback
  allocation/lock behavior is covered by the harness.

## Voice pool and note lifecycle

The initial engine uses one preallocated pool of 64 Bass voices. Every voice
records its slot, stable note/audition identity, start sample, lifecycle state
and plan generation.

Allocation policy is deterministic:

1. reuse the matching identity for a deliberate retrigger;
2. take the lowest-index free slot;
3. steal the oldest released voice;
4. otherwise steal the oldest active voice, breaking ties by slot index.

An unknown or repeated note-off is a bounded no-op. Stop, seek, plan swap and
loop wrap use a short bounded release or a documented emergency reset. Every
voice has a finite maximum release duration, so invalid state cannot create a
permanent voice.

## Deep Bass signal path

The reviewed voice is intentionally small and reproducible:

1. phase-continuous anti-aliased saw pair with bounded detune;
2. centered sine sub oscillator controlled by `subLevel`;
3. velocity and filter-envelope modulation;
4. stable resonant low-pass filter with sample-rate-aware cutoff clamping;
5. amplifier ADSR;
6. bounded drive/saturation;
7. stereo-width and layer pan/gain;
8. smoothed master gain;
9. final finite-value guard and conservative soft-clip/hard-ceiling policy.

Filter, drive, width and gain targets are smoothed. Envelope timing parameters
are captured for a new note unless a later patch-model version defines a
different active-note behavior. Denormal-scale state is driven explicitly to
zero without platform-specific unsafe CPU flags.

The final output policy is a safety boundary, not a mastering limiter. It must
produce finite stereo samples within the documented ceiling and increment a
diagnostic counter if a non-finite intermediate is replaced with silence.

## Initial ceilings

Stage A freezes the following conservative ceilings as generated or shared
constants and verifies that all conversions use checked arithmetic:

| Resource | Initial ceiling |
| --- | ---: |
| Protocol frame body | 262,144 bytes |
| Protocol payload | 196,608 bytes |
| Identifier | 128 UTF-8 bytes |
| JSON nesting | 32 levels |
| Items in one protocol batch | 4,096 |
| Layers in an engine plan | 32 |
| Tempo points | 256 |
| Musical note events | 4,096 |
| Prepared note-on/off actions | 8,192 |
| Actions at one block offset | 512 |
| Bass voices | 64 |
| Render block | 1–2,048 frames |
| Sample rate | 8,000–192,000 Hz |
| Output channels | exactly 2 |
| Offline duration | 10 minutes, streamed in blocks |

The engine may support a smaller plan than the project schema. Capability and
limit diagnostics must state that honestly; the application can then reduce or
refuse the render without losing project content.

## Delivery stages

### Stage A — Protocol, wire plan and dependency correction

**Branch:** `feature/engine-protocol-contracts` from the task integration
branch.

- Correct the Rust crate dependency direction.
- Expand the shared protocol schema with capability and limit codes.
- Generate deterministic closed-set bindings for TypeScript and Rust.
- Replace `unknown` production payloads with typed discriminated unions.
- Implement strict Rust envelope/body parsing and transport-neutral bounded
  frame decoding.
- Define the wire render-plan projection, micro-BPM normalization and shared
  accepted/rejected fixtures.
- Add handshake/sequence state, version negotiation and structured failures.
- Extend lifecycle workflows so Rust unit/integration tests execute, not merely
  compile.

### Stage B — DSP primitives and output safety

**Branch:** `feature/engine-dsp-primitives` from the updated task branch.

- Add stereo sample/frame types and finite/range guards.
- Implement oscillator phase, anti-aliased saw, sine sub, ADSR, stable low-pass
  filter, smoothed values and bounded saturation.
- Implement layer/master gain, pan/width and final output guard.
- Add reset semantics and sample-rate/block validation.
- Add focused numeric tests for discontinuities, envelopes, filter stability,
  smoothing duration, silence, DC, clipping and NaN containment.

### Stage C — Transport, scheduler, Bass voice and real-time kernel

**Branch:** `feature/engine-transport-synth` from the updated task branch.

- Implement checked tempo-segment conversion and transport state.
- Precompile sorted note-on/off actions into bounded plan storage.
- Implement the fixed voice pool and deterministic stealing policy.
- Implement `DeepBassVoice` from the stored resolved patch.
- Add play/stop/seek/loop and ephemeral audition commands.
- Add prepared-plan validation, pending/active generation and block-boundary
  swap.
- Add structured health counters and revision acknowledgement.
- Put the real-time invariant contract beside `render_block` and add a callback
  harness proving steady-state capacity and allocator behavior.

### Stage D — Offline proof, golden evidence and acceptance

**Branch:** `feature/engine-offline-proof` from the updated task branch.

- Add the offline composition crate and bounded block sink.
- Render one fixed 48 kHz, 128-frame-block, multi-note `Deep` Bass phrase from a
  real cross-language wire-plan fixture.
- Render twice and compare deterministic sample output within the documented
  floating-point/quantization policy.
- Record compact golden metrics: frame count, peak, RMS, DC, silence/non-silence
  windows, clipped/non-finite counts and selected spectral-band energies.
- Generate a short reviewable WAV under ignored `artifacts/engine/` and retain a
  human-review checklist plus compact committed numeric evidence.
- Add a non-gating deadline benchmark that records throughput and worst block
  time as a baseline rather than a flaky unit assertion.
- Add malformed/corpus tests, combined lifecycle workflows and Stage 4
  acceptance evidence.

Each delivery branch receives focused tests and `check:quick`/engine checks,
then an atomic English commit and post-commit lifecycle audit before a
fast-forward merge into `feature/skeleton-engine-core`.

## Edge cases and failure modes

- Protocol version, render-plan version or patch-model version mismatch.
- Oversized, truncated, trailing, non-UTF-8, over-deep or unknown protocol data.
- Duplicate/replayed sequence, unsafe-integer revision or stale plan generation.
- Duplicate layer/note IDs, unsorted tempo data or an unavailable source type.
- Empty tempo map, zero PPQ, invalid loop, arithmetic overflow or event past the
  offline duration ceiling.
- NaN/infinite/out-of-range gain, pan, patch, sample rate or BPM normalization.
- Multiple tempo changes inside one block or note.
- More simultaneous actions than the bounded per-offset capacity.
- Note-off before note-on, repeated note-off, retriggered audition identity and
  note ID collision across layers.
- Voice exhaustion and deterministic stealing while releases are active.
- Stop/seek/loop/plan swap during attack, sustain or release.
- Newer plan queued before the older pending plan becomes active.
- Offline cancellation at every block boundary.
- Filter instability near Nyquist, denormal-scale tails, DC accumulation,
  clipping and non-finite intermediates.
- Empty plan and silence-only plan.
- Unknown drum voices or non-current patch shapes must fail explicitly, never be
  silently omitted from an acknowledged plan.

## Verification strategy

### Protocol and cross-language contracts

- Generated binding determinism and schema validation.
- The same positive and negative fixtures exercised by TypeScript and Rust.
- Bounded incremental-frame tests for every split point and malformed length.
- Handshake, capability, sequence, stale-revision and terminal-session tests.
- Corpus tests for nesting, invalid UTF-8, unknown fields and every collection
  ceiling.

### DSP and musical behavior

- Unit tests for oscillator bounds/phase, envelope stages, filter stability,
  smoothing and saturation.
- Exhaustive bounded voice-pool transitions and deterministic stealing.
- Tempo/tick/sample fixtures including fractional BPM and tempo boundaries.
- Scheduler ordering, loop, stop, seek, plan swap and audition lifecycle tests.
- Silence, finite-output, DC, peak, clipping and reset invariants across the
  supported sample-rate/block matrix.

### Real-time and deterministic proof

- A callback harness warms the engine, then proves no steady-state allocation,
  deallocation, blocking lock or capacity growth while rendering representative
  blocks and plan swaps.
- Offline rendering uses the production block function and bounded streaming
  storage.
- Repeated rendering is compared at sample/quantized-output level as documented.
- Golden metrics use reviewed numeric tolerances broad enough for supported
  architectures but narrow enough to detect audible model drift.
- The benchmark records a baseline artifact and never fails solely because a
  shared development machine is temporarily slow.

### Repository acceptance

The combined task branch must pass:

- generated protocol checks;
- TypeScript and Rust unit/integration tests;
- Rust formatting, clippy/static policy and workspace checks;
- target/dependency-boundary policies;
- offline golden and callback-invariant harnesses;
- existing Node/Web checks and Desktop/Web production builds;
- final staged `precommit` and exact post-run lifecycle audit.

Resource-intensive engine, build and acceptance commands remain sequential
under the repository lifecycle owner with stage timeouts and heartbeats.

## Definition of done

- A valid Stage 3 Bass render plan crosses one typed, bounded, versioned
  protocol boundary and becomes an acknowledged active Rust plan revision.
- The fixed offline phrase produces audible, finite, non-silent and
  deterministic `Deep` Bass output through the production DSP block function.
- Stale, invalid, oversized or unsupported plans leave the current plan intact
  and return a stable diagnostic.
- Transport, tempo changes, loop, stop, seek and audition cannot leave stuck
  voices.
- Voice exhaustion follows the documented deterministic policy.
- The steady-state callback satisfies the written no-allocation/no-lock/no-I/O
  contract in its harness.
- `core`, `dsp`, `synth` and `protocol` contain no Electron, Node, Web,
  filesystem or audio-device dependency.
- Native host and Web worklet still compile as thin future adapters against the
  same engine boundaries.
- Rust tests execute in normal repository checks, golden evidence is retained
  compactly and the task branch is clean and ready for an explicit merge
  request.
