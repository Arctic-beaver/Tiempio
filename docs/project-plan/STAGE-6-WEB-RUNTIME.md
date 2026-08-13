# Stage 6 — Static Web runtime, WASM AudioWorklet and browser persistence

## Status and scope

**Status:** planning complete; implementation has not started.

**Task integration branch:** `feature/skeleton-web-runtime`, created from local `main` at
`eda6a8a` after the completed pre-Stage-6 product work was fast-forwarded into `main`.

This document is the implementation plan for Stage 6 of
`docs/project-plan/APPLICATION_SKELETON.md`. It turns the existing static Web UI target into an
honest local-first runtime. The Web application must run the same project model, render plans and
Rust DSP implementation as Desktop while representing browser audio and persistence limitations as
capabilities rather than native guarantees.

The original skeleton used Bass / `Deep` as the minimum audible proof. The current accepted
baseline is broader: five synth families, 27 characters, five procedural drum voices, engine-clock
previews and the sample-aligned metronome already share one native render path. Stage 6 must not
create a Bass-only Web fork. `Deep` remains the required minimum proof, and representative parity
for every synth family plus the procedural drum kit is part of Stage 6 acceptance.

This plan does not authorize a push, pull request, additional worktree, merge to `main` or any file
under `.github/workflows/`. Every implementation stage is completed sequentially in the primary
worktree and merged back only into `feature/skeleton-web-runtime` after review.

## Required user-visible outcome

From the independent production Web artifact, a user can:

- load the same shared Tiempio application without a server-side API, account or cloud service;
- explicitly enable browser audio from an existing application-owned action and receive a truthful,
  actionable state if the browser blocks or suspends it;
- audition the current synth and drum instruments, hear previews and use play, stop, seek, loop and
  metronome through the Rust engine running in an `AudioWorklet`;
- keep editing an in-memory project when audio, IndexedDB or writable file handles are unavailable;
- open a bounded `.tiempio` snapshot and, where the browser grants a writable handle, write back to
  that handle without claiming Desktop atomicity;
- request a Download copy as a distinct outcome that does not clear dirty or recovery state;
- retain versioned presentation settings and checksummed bounded recovery through IndexedDB when
  browser storage is available.

Stage 6 activates the existing audio-status and settings presentation. It does not invent a new
onboarding journey, file-management surface or visual language. If a required state cannot be
expressed through the approved shell without new product design, implementation stops for user
review.

## Explicitly out of scope

- accounts, cloud storage, analytics, telemetry, collaboration or any application-content network
  transport;
- a service worker, installable PWA, background sync, origin migration or offline cache policy;
- native MIDI, browser MIDI permission, audio-device selection or exclusive/low-latency modes;
- SharedArrayBuffer, cross-origin isolation or a second high-performance transport path;
- imported user audio, large archive assets, time stretching or unbounded decode;
- production offline export, stems or browser-render farms;
- automatic permission prompts during ordinary Save;
- a claim that browser direct writes are atomic or equivalent to Desktop persistence;
- Stage 7 onboarding, tutorial, completion UI or a redesign of the accepted prototype surfaces.

## Sources of truth

Implementation follows, in order:

1. `docs/architecture/TIEMPIO_ARCHITECTURE.md` for authority, process boundaries, Web limitations,
   real-time rules, privacy and security;
2. this plan for Stage 6 scope, sequencing and acceptance;
3. `docs/project-plan/APPLICATION_SKELETON.md` for the complete Stage 0-8 dependency graph;
4. `docs/project-plan/STAGE-5-DESKTOP-RUNTIME.md` and
   `docs/evidence/STAGE-5-DESKTOP-RUNTIME.md` for the versioned runtime, persistence and engine
   semantics that Web must preserve without copying native guarantees;
5. `docs/project-plan/PLAYABLE-INSTRUMENTS-AND-DRUMS.md` and its evidence for the current composite
   synth/drum engine scope;
6. `docs/evidence/PRE-PHASE-6-PRODUCT-GATE.md` and
   `docs/evidence/PLAYABLE-INSTRUMENTS-AND-DRUMS.md` for the accepted shared UI and bundle baseline;
7. the prototype HTML, reference screenshots and repository UI policies for visual behavior.

Browser APIs are feature-detected at runtime. A browser-version matrix is evidence, not a source of
product truth, and must be re-recorded before public distribution.

## Inherited starting point

The plan begins from these verified facts:

- `apps/web/runtime/webRuntime.ts` returns `createUnavailableRuntime('web')`;
- Web mounts the shared application with an unavailable controller, so it does not currently import
  `ApplicationRuntimeController` or `EngineClient` into its initial graph;
- `engine/crates/web-worklet` is a `cdylib`/`rlib` skeleton that exposes only the protocol version;
- the real composite realtime implementation currently lives in `native-host` and combines
  platform-neutral scheduling/preview behavior with native queues, atomics, timing and backend
  concerns;
- `ApplicationRuntimeController` currently requests native-only capabilities and configures a fixed
  48 kHz / 512-frame output, which is not a valid Web assumption;
- `packages/project-format` owns the logical archive and recovery envelope, while the bounded
  physical ZIP codec currently lives inside the Desktop persistence adapter;
- the Web artifact is already static, uses relative asset paths, has no source maps and is governed
  by the production CSP and target-boundary policies;
- the accepted Web output is 566155 bytes against a 585728-byte full-output ceiling, with 414559
  initial bytes and 74584 deferred feature bytes. A WASM runtime cannot be hidden by simply raising
  this aggregate ceiling;
- the repository already has one fail-fast lifecycle owner, a single-run lock, direct child
  launches, bounded per-stage timeouts, progress heartbeats, signal handling and exact owned-tree
  cleanup. Stage 6 extends that owner rather than adding another runner.

## Non-negotiable architecture boundaries

### Authority and dependency direction

- `ProjectSession` remains the only mutable musical-content authority.
- The application compiles immutable revision-bound render plans; neither Web storage nor the
  worklet owns unsaved project content.
- `packages/application` and other shared packages do not import browser handles, IndexedDB,
  `AudioContext`, `AudioWorkletNode` or WebAssembly hosting details.
- Browser objects remain private to `apps/web/runtime`; shared contracts expose opaque handles and
  neutral results only.
- The main UI thread owns browser capability discovery and the lifetime of one `AudioContext` and
  one `AudioWorkletNode`.
- The worklet thread owns the WASM engine instance, engine clock, voices, active render plan and
  bounded realtime observations.
- Rust DSP crates remain unaware of React, DOM, browser storage and TypeScript application state.
- Desktop continues to use its supervised native process and receives no browser code or Web
  capability assumptions.

### Target-neutral capability negotiation

Stage 6 must replace the current native-only controller assumption with an explicit capability
profile:

- define one required common engine set for typed protocol, full render plans, transport, synth,
  drums, audition, previews, diagnostics and sample-clock metronome behavior;
- represent native shared output and Web AudioWorklet output as different capabilities;
- require exactly one compatible audible-output capability rather than requiring
  `audio.native.shared` everywhere;
- keep device enumeration and native supervision optional and Desktop-only;
- make protocol session construction accept an explicit supported capability set instead of a
  `native_audio_available` Boolean;
- use target-neutral diagnostic copy and stable action metadata. The shared controller must not
  report that a Web engine is missing a “native” capability;
- version and regenerate TypeScript/Rust protocol bindings whenever capability vocabulary or
  semantics change.

The preferred capability name for the Web output path is `audio.web.worklet`. If the existing
`metronome.native` name cannot truthfully describe the now-shared sample-clock implementation, Stage
A replaces it with a target-neutral versioned capability and migrates Desktop and fixtures in the
same protocol change.

### User activation and audio lifecycle

The Web runtime must not create or resume an `AudioContext` on application mount. Its initial engine
connection returns an actionable suspended/permission-required result without loading the engine
graph.

The existing audio retry/enable action is the activation boundary. Its event handler must
synchronously begin `AudioContext` construction or `resume()` before any awaited dynamic import,
storage operation or other promise can consume transient user activation. The resulting promise may
then continue the bounded initialization sequence:

1. capture valid activation and create/resume the one owned context;
2. load the deferred, content-hashed worklet module;
3. instantiate the WASM module inside the worklet;
4. create and connect one stereo `AudioWorkletNode`;
5. complete protocol handshake and capability negotiation;
6. configure the engine from the actual context sample rate and worklet output block shape;
7. load only the newest project render plan;
8. start output and publish truthful health.

Repeated clicks share one in-flight attempt. A failed attempt closes or disconnects only objects
owned by that generation before another attempt is allowed. React Strict Mode, navigation and
visibility changes cannot create a duplicate context, node or engine client.

### AudioWorklet and WASM ownership

Stage 6 extracts the platform-neutral realtime command preparation, preview scheduling, metronome,
plan activation, observation and allocation-free render behavior from `native-host` into a shared
Rust realtime crate or an equivalently explicit common module. Native-only queue, thread, CPAL,
device and wall-clock code stays in `native-host`. Both adapters must call the same composite
`EngineKernel` and voice-bank implementation.

The worklet adapter must:

- accept bounded protocol commands outside the render call and prepare allocations before they can
  become active at an audio-block boundary;
- use fixed-capacity command, event and retirement storage with explicit overflow diagnostics;
- preallocate output scratch, voices and bounded plan state before audio becomes ready;
- prevent `memory.grow`, Rust heap allocation, blocking, logging, I/O or structured serialization
  inside the Rust render call;
- render the actual browser-provided frame count and actual context sample rate instead of assuming
  the Desktop request;
- replace non-finite output with silence and retain bounded overload/underrun diagnostics;
- publish critical acknowledgements without loss and coalesce transport/meter observations to at
  most the application limit;
- release all audition and preview voices on disconnect, context interruption, visibility loss and
  fatal worklet failure.

`MessagePort` is the initial control transport. SharedArrayBuffer and cross-origin isolation are not
introduced. Commands and events retain the generated protocol envelope semantics, sequence rules,
frame ceilings and revision acknowledgements. Transferable bounded byte buffers may be used, but an
unbounded structured-clone queue is forbidden.

### WASM build and CSP

Stage A records and pins one reproducible binding strategy before engine implementation begins. The
current Cargo lock already contains a transitive `wasm-bindgen` family, but that does not authorize a
direct dependency or CLI. The selected library and generator versions must match exactly, support
the pinned Rust 1.85.0 toolchain, have an accepted license/security review and run only through the
lifecycle owner.

The production design preserves `connect-src 'none'`. Generated glue must not fetch a WASM file or
use `eval`. The deferred worklet artifact therefore owns bounded WASM bytes and instantiates them
inside the worklet from an already packaged payload. Stage A measures the cost of an inline/encoded
payload against a generated module-wrapper alternative and records the smallest CSP-compatible
choice. If supported browsers require `wasm-unsafe-eval`, only that narrowly scoped directive may be
proposed and browser-tested; ordinary `unsafe-eval` remains forbidden.

Worklet JavaScript, WASM and engine-client code remain outside the initial shell graph until the
activation action. All emitted production filenames are content-hashed, source maps and debug names
are absent, and the artifact contains no development-relative URLs.

### Web persistence semantics

`WebProjectsRuntime` owns an in-memory registry from unpredictable opaque project handles to one of:

- a new in-memory project with no writable destination;
- an explicitly selected immutable `File` snapshot;
- a feature-detected browser file handle with the last observed bounded fingerprint and current
  permission state;
- a checksummed recovery restored from IndexedDB.

Raw `File`, `Blob`, `FileSystemFileHandle`, names and browser storage keys never cross the Web
runtime boundary.

Physical `.tiempio` ZIP validation must be shared with Desktop rather than copied. The current pure
central-directory preflight, path normalization, compression-ratio, CRC and logical-archive checks
move to an optional public physical-codec boundary owned by `project-format` (or another explicitly
approved platform-neutral package). Desktop and Web keep their own I/O adapters. `fflate` remains
lazy and must not enter the initial Web shell graph.

Operation semantics are fixed as follows:

- `create` creates only an in-memory opaque handle;
- `open` uses the File System Access picker when supported and falls back to a bounded file-input
  snapshot without pretending that the fallback is writable;
- `load` returns exact supported/unsupported compatibility, a bounded fingerprint and truthful
  `saveAllowed` state;
- `persist` writes only through an existing handle whose current `queryPermission({ mode:
  'readwrite' })` result is already `granted`; it never prompts implicitly;
- `persistAs` may invoke a save picker from a valid user action and bind the selected handle only
  after a successful write/close/re-read sequence;
- unsupported picker APIs produce a Download request or an explicit unavailable result according to
  the called operation; they never fabricate persistence;
- `saveCopy` creates a bounded Blob/object URL and triggers Download, returning
  `download-requested` because browser completion cannot be observed;
- Download, canceled operations and failed writes never acknowledge a saved revision or discard
  valid recovery;
- direct writes are serialized per handle, revalidate the last observed fingerprint before opening
  a writer and verify the resulting bytes after close where the API permits it;
- successful direct write is reported as `persisted`, but UI and evidence explicitly state that it
  is not a native atomic-replace guarantee.

### IndexedDB settings and recovery

One versioned Tiempio database owns separate settings and recovery stores. Database name, schema
version, object-store names, key shapes and migration behavior are constants covered by tests.

- Settings reuse the existing validated `SettingsSnapshot` version and return defaults only for a
  genuinely absent record.
- Recovery stores the existing checksummed envelope, project identity and revision in one atomic
  transaction.
- Every byte array, record count and transaction duration has an application-owned ceiling before
  data enters IndexedDB.
- Recovery writes are latest-revision-wins; an older completion cannot replace or acknowledge a
  newer project revision.
- Corrupt, future-version or excessive records fail closed and are not silently rewritten.
- Quota, blocked upgrade, denied/private-mode storage, abort and transaction errors map to stable
  `STORAGE_UNAVAILABLE`, `STORAGE_QUOTA_EXCEEDED` or project-format errors.
- Storage failure does not disable the in-memory project or audio runtime.
- Browser handles are not persisted in Stage 6; reopening a direct-write destination requires a new
  explicit selection after page reload.
- `pagehide`/unload is not treated as a durable async barrier. Recovery is scheduled while the page
  is active, forced on visibility loss when possible and tested so the last acknowledged recovery is
  never discarded by an unobservable close attempt.

`LifecycleRuntime` remains unavailable on Web unless the contract is versioned with truthful
non-native semantics. A fake “closed” acknowledgement is forbidden.

## Initial ceilings and performance evidence

Stage A freezes exact numbers after the first measured spike. At minimum, the implementation owns
separate ceilings for:

| Class | Required measurement |
| --- | --- |
| Initial Web shell | Must not contain engine client, worklet, WASM or physical ZIP modules |
| Deferred application features | Retains the existing workflow/editor split without duplication |
| Web runtime JavaScript | Engine adapter and persistence code measured separately |
| Worklet JavaScript | One content-hashed worklet entry with no unrelated UI modules |
| WASM release binary | Raw and packaged bytes, stripped of debug/source-map output |
| Activation | Click-to-ready and click-to-first-confirmed-output timings |
| Worklet render | Per-block duration, overloads and non-finite replacements |
| Control transport | Queue capacity, maximum command bytes and maximum events per second |
| Memory | Initial, post-activation and peak bounded-project memory; no render-time growth |
| IndexedDB | Settings bytes, recovery bytes, record count and transaction timeout |

The current 585728-byte aggregate Web ceiling is not raised until module attribution proves which
approved Stage 6 class owns every increase. Final policy keeps a stable initial-shell ceiling and
gives deferred JavaScript and WASM their own smallest practical measured headroom.

## Delivery stages

The plan commit lives on `feature/skeleton-web-runtime`. Each implementation branch starts from the
updated integration head, contains only its stage, uses atomic English commits, passes focused
checks and is reviewed before a no-conflict merge back. Stages are sequential even when their code
could be developed independently.

### Stage A — Web contracts, dependency decisions and lifecycle workflows

**Branch:** `feature/web-contracts-lifecycle`.

- Define the common/one-of/optional engine capability profile and neutral diagnostic actions.
- Version the application runtime or engine protocol only where semantics actually change; update
  schema, generated TypeScript/Rust bindings and all fixtures together.
- Replace the protocol session's native Boolean with explicit supported capabilities while
  preserving Desktop behavior.
- Decide and exactly pin the WASM binding/generator strategy after Rust 1.85.0, license, CSP, output
  size and worklet-context proof.
- Add lifecycle-owned direct steps for target/tool availability, WASM build, binding generation,
  deterministic Web-engine tests and Web production assembly.
- Install no target or tool implicitly during ordinary build. Dependency/toolchain installation is
  an explicit bounded lifecycle workflow.
- Add fake-child, timeout, signal, lock and cleanup policy coverage before running the new heavy
  build path.
- Define the production worklet/WASM asset contract and separate bundle ceilings.
- Record supported secure-context assumptions: production HTTPS and localhost development are in;
  direct `file://` execution is not promised.

**Stage exit:** contracts generate deterministically, Desktop fixtures retain their semantics, the
toolchain is reproducible and every later heavy command has one safe lifecycle owner.

### Stage B — Shared realtime kernel and WASM ABI

**Branch:** `feature/web-realtime-kernel`.

- Extract platform-neutral realtime command preparation, preview/metronome scheduling, block-boundary
  plan activation and observation state from `native-host`.
- Keep CPAL, device management, native threads, `rtrb` ownership and process protocol I/O in
  `native-host`.
- Adapt native-host back to the common realtime API without changing its accepted sound, device
  recovery, callback-allocation or protocol behavior.
- Implement the bounded `web-worklet` ABI around the same composite synth/drum voice bank and
  protocol session.
- Preallocate WASM memory and render buffers, reject excessive configuration and expose explicit
  control/event drains outside the Rust render call.
- Add native-versus-WASM fixture parity for `Deep`, one character from every synth family, drums,
  preview, metronome, transport, seek and loop.
- Prove render-plan revision acknowledgements, stale-plan rejection, queue overflow, invalid message,
  non-finite containment and bounded failure behavior.

**Stage exit:** a deterministic non-browser WASM harness can handshake, load the current composite
render plan and produce bounded non-silent stereo blocks from the same Rust implementation while
Desktop controlled-audio regressions remain green.

### Stage C — AudioWorklet host, activation and Web engine runtime

**Branch:** `feature/web-audio-worklet-runtime`.

- Add the content-hashed worklet entry and CSP-compatible WASM initialization inside the worklet.
- Implement the bounded main-thread/worklet `MessagePort` adapter with generation IDs, transfer
  limits, event coalescing and fatal teardown.
- Implement one `WebEngineRuntime` with lazy adapter import, one activation attempt and one owned
  context/node generation.
- Refactor `ApplicationRuntimeController` to use target-neutral capability profiles and the actual
  negotiated Web audio configuration.
- Map `AudioContext.state`, worklet load/processor errors and browser interruptions into stable
  health snapshots and actionable diagnostics.
- Resume only from a valid activation, release all live notes on visibility/blur/pagehide and never
  let repeated retry create duplicate graphs.
- Keep output-device identity null and native mode/device capabilities unavailable rather than
  fabricating browser device facts.
- Cover mount without activation, activation loss, suspended context, module failure, WASM failure,
  processor error, message overflow, disconnect/retry and Strict Mode duplication.

**Stage exit:** an actual browser activation makes the shared application controller ready through
the worklet, and losing/suspending the context produces one truthful recovery action without stale
sound or duplicate contexts.

### Stage D — Physical archive, file handles, Download and IndexedDB

**Branch:** `feature/web-persistence-runtime`.

- Extract and regression-test the shared pure physical ZIP codec without moving platform I/O into
  shared application code.
- Implement the opaque Web project registry, picker/input feature detection, bounded snapshot load
  and unsupported-version preservation.
- Implement permission-checked serialized direct write, save-picker binding, fingerprint conflict
  detection and post-close verification.
- Implement Download-copy object URL lifecycle and the exact `download-requested` outcome.
- Implement versioned IndexedDB settings and recovery with bounded upgrades, transactions and
  stable error mapping.
- Add deterministic fakes for granted/prompt/denied/revoked permissions, concurrent writes, external
  change, canceled picker, missing APIs, corrupt ZIP, quota, blocked database and aborted transaction.
- Add real-browser persistence checks for the APIs available in the selected acceptance browsers.

**Stage exit:** runtime tests round-trip a minimal current project, preserve unsupported bytes,
distinguish direct persistence from Download and keep the application usable when every optional
storage feature fails.

### Stage E — Web composition and prototype-preserving integration

**Branch:** `feature/web-runtime-integration`.

- Compose available projects, engine and settings in `createWebRuntime`; keep resources,
  native-window and unsupported lifecycle/command capabilities explicitly unavailable.
- Mount one real `ApplicationRuntimeController` with the canonical project codec while keeping the
  worklet/WASM and ZIP graphs dynamically deferred.
- Route current synth/drum audition, previews, metronome, transport and latest render plans through
  the Web engine.
- Route settings and recovery through IndexedDB without blocking first render or in-memory editing.
- Use the existing audio chip/action for “enable audio” and retry states with localized neutral copy;
  add no new panel, popup, dropdown or scrollbar variant.
- Audit keyboard ownership against browser-reserved shortcuts and release paths.
- Verify Light/Dark, EN/RU/ES, compact, standard, ultrawide and constrained-height states with audio
  ready, suspended and unavailable.
- Update target and chunk-topology policies so only the approved lazy runtime graph becomes legal;
  Electron, Node/native filesystem and Desktop bridge imports remain forbidden from Web/shared code.

**Stage exit:** the production Web composition uses real Web runtime capabilities through the same
shared application while retaining the approved design-system treatment and initial-shell boundary.

### Stage F — Production security, browser matrix and acceptance evidence

**Branch:** `feature/web-runtime-verification`.

- Build the complete static artifact through the lifecycle owner and inventory every emitted file,
  hash, size and import edge.
- Prove strict production CSP, no source maps/eval/development URLs, no server API dependency and no
  Electron/Node/native code in shared or Web bundles.
- Prove worklet/WASM/engine and physical ZIP modules are absent before activation/open and appear
  only in their approved deferred paths.
- Run common protocol, Rust, TypeScript, Web production and Desktop regression gates sequentially.
- Exercise actual browser audio activation, `Deep`, representative synth families, drums, preview,
  metronome, play/stop/seek/loop, suspension and retry.
- Exercise snapshot fallback, writable handle, permission revocation, external-change conflict,
  Download, settings, recovery, quota/storage-unavailable and reload behavior.
- Inspect network traffic and prove no project bytes, name, handle, musical content or diagnostics
  leave the origin.
- Record the latest-stable browser matrix with exact versions, operating systems, supported/fallback
  persistence paths and explicit unsupported modes.
- Record output energy, context sample rate, worklet block observations, activation/first-output
  latency, render overloads and peak memory without recording private device or project data.
- Create `docs/evidence/STAGE-6-WEB-RUNTIME.md` mapping every definition-of-done item to automated or
  retained manual evidence.

**Stage exit:** all Stage 6 criteria have reproducible evidence, retained platform limits are
explicit and the clean integration branch is ready for user review without merge to `main`.

## Edge cases and failure modes

### Activation, context and output

- The initial mount, settings read or dynamic import consumes transient user activation.
- `AudioContext` is created but remains suspended, changes state during initialization or is closed
  by the browser after inactivity.
- The sample rate differs from 48 kHz or the worklet provides a different bounded frame count.
- `audioWorklet.addModule`, WASM compilation/instantiation or processor construction fails after a
  partial generation exists.
- Rapid retry creates overlapping contexts, nodes, listeners or protocol sequences.
- Visibility loss, focus loss, pagehide or processor failure leaves held notes, previews or
  transport running.
- Browser-managed output changes without exposing a stable device identifier.

### Protocol and realtime safety

- Message order is replayed, skipped or delivered after its generation was disposed.
- A command or render plan exceeds byte, event, layer, voice or memory ceilings.
- Critical plan acknowledgement is crowded out by meter/transport traffic.
- Worklet/main-thread backpressure creates an unbounded clone queue.
- WASM memory grows or a serializer allocates during the Rust render call.
- Native extraction changes accepted Desktop sound, preview timing, metronome alignment or device
  recovery.
- Preview, audition and transport contend for voices or fail to release at a block boundary.
- Web and native floating-point output differs beyond the documented parity tolerance.

### Files and browser storage

- Open returns a read-only snapshot even though a picker API exists but permission is not granted.
- Permission is `prompt` or revoked between `queryPermission`, preflight read and writer creation.
- The file changes externally before or during a non-atomic browser write.
- Picker cancellation is confused with unavailable API or permission denial.
- Download is requested but blocked or abandoned; completion remains unknowable.
- Object URLs, hidden inputs or event listeners leak after completion/cancel.
- ZIP metadata lies about local entries, sizes, CRC, compression or normalized paths.
- IndexedDB is absent, private-mode restricted, blocked by another tab, quota-limited or corrupt.
- A stale recovery transaction completes after a newer project revision.
- Page termination occurs before an async recovery write can start or finish.

### Security, privacy and production assembly

- Generated WASM glue introduces `eval`, a network fetch, a source map or an unhashed development
  path.
- CSP permits arbitrary same-origin content transport merely to load the engine.
- File names, browser handle objects or project bytes enter logs, exceptions, URLs or analytics.
- The static artifact requires `file://` behavior that secure browser APIs cannot provide.
- Worklet/WASM or `fflate` leaks into the initial graph or duplicates shared singleton modules.
- A Web import reaches Electron, Node filesystem code or native host implementation.

### UI, accessibility and shortcuts

- The audio action says “retry” before audio has ever been enabled or claims ready before health
  acknowledgement.
- Browser-reserved shortcuts steal focus/navigation or application letter keys fire while typing.
- A suspended diagnostic announces repeatedly on every context state event.
- Reduced motion, forced colors, Light/Dark or constrained height hides the existing audio action.
- Runtime integration introduces a local dropdown/scrollbar treatment instead of the shared design
  system.

## Verification strategy

### Focused automated checks

- generated engine protocol/schema parity and target-neutral capability profiles;
- protocol sessions for native and Web supported-capability sets;
- shared realtime allocation, queue, plan, preview, metronome and observation tests;
- native-versus-WASM deterministic render fixtures and bounded failure corpus;
- Web engine fake tests for activation, context state, generation teardown and message backpressure;
- physical ZIP malformed/collision/bomb corpus reused by Desktop and Web;
- project-handle, permission, fingerprint, direct-write and Download outcome tests;
- IndexedDB upgrade, corruption, quota, abort, stale revision and recovery tests;
- target-boundary, CSP, bundle-budget, chunk-topology and no-network source policies;
- Node/Web typechecks, lint, formatting, Rust format/check/Clippy/tests and existing UI policy tests.

### Browser and production checks

- one real production build served from the supported secure static context;
- initial network/module graph before audio activation and project open;
- valid activation, actual AudioWorklet execution, confirmed non-silent output and transport clock;
- suspension/interruption/retry with no duplicate graph or stuck notes;
- writable-handle and fallback snapshot paths where each browser exposes them;
- Download remains dirty/recovery-protected;
- IndexedDB settings/recovery across reload plus storage-unavailable in-memory continuation;
- Light/Dark, EN/RU/ES and the accepted viewport matrix without document overflow;
- console, CSP and network inspection with no unexpected warning, violation or content transfer.

### Resource-safe execution

- warn the user before dependency/toolchain installation, Rust/WASM compilation, full validation,
  production build or browser-matrix execution;
- run every heavy workflow sequentially through `scripts/lifecycle-runner.mjs`;
- retain one single-run lock, direct `shell: false` children, explicit stage/whole-workflow timeouts,
  progress heartbeats, signal propagation and exact task-owned tree cleanup;
- after every commit and before every next check, branch, merge or commit, run the lifecycle audit;
- if ownership cannot be proven, stop rather than killing by executable name;
- if the system slows materially, stop starting work, terminate only the verified task-owned heavy
  tree and wait for user direction.

## Definition of done

### Runtime and audio

- Web mounts one real application controller but creates no audio context before user activation.
- A valid activation starts one `AudioWorklet` containing the WASM instance and reaches truthful
  ready health.
- `Deep`, representative characters from all five synth families and the procedural drum kit use the
  same Rust DSP/render-plan implementation as Desktop.
- Audition, preview, metronome, play, stop, seek and loop are engine-clock driven and release cleanly.
- Suspended, unavailable, overloaded and failed states expose stable diagnostics with one applicable
  action.
- No render-call allocation, blocking, I/O, logging, unbounded queue or WASM memory growth is
  observed within the defined test boundary.

### Persistence and degradation

- A bounded current `.tiempio` snapshot opens and round-trips without musical loss.
- Unsupported future project bytes remain preserved and non-destructively read-only.
- Direct write occurs only with current granted permission and never claims Desktop atomicity.
- Download returns `download-requested` and does not acknowledge Save, clear dirty state or discard
  recovery.
- Settings and checksummed latest recovery survive reload when IndexedDB is available.
- Missing, denied, full or corrupt browser storage leaves the in-memory project and audio path usable.
- Raw browser handles, file names and project content remain private to the Web adapter.

### Security, boundaries and performance

- The production artifact is static, relative-path safe, content-hashed and source-map-free.
- CSP contains no ordinary `unsafe-eval`; application-content network transport remains disabled.
- Initial shell contains no engine client, worklet, WASM or physical ZIP module.
- Separate measured ceilings cover initial shell, deferred UI, Web runtime, worklet and WASM.
- Shared/Web bundles contain no Electron, Node filesystem, native path or native-host code.
- Desktop controlled audio, project persistence, package security and accepted UI behavior do not
  regress after common realtime/ZIP extraction.

### Engineering acceptance

- Every implementation stage has focused tests, an atomic English commit, reviewed scope and a clean
  lifecycle audit before integration.
- Required quick, Rust, Web production, Desktop regression and browser acceptance gates pass
  sequentially or record an explicitly accepted platform limitation.
- `docs/evidence/STAGE-6-WEB-RUNTIME.md` maps every exit criterion to reproducible evidence.
- Architecture, skeleton status, testing scenarios and policy documentation match the delivered
  behavior.
- No task-owned process, lifecycle lock or cleanup quarantine remains.
- `feature/skeleton-web-runtime` is clean and ready for review, with no push, PR or merge to `main`.
