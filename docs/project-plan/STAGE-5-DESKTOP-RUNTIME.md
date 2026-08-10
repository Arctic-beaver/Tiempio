# Stage 5 — Secure Desktop runtime, native engine host and prototype-preserving integration

## Status and scope

This document is the implementation plan for Stage 5 of
`APPLICATION_SKELETON.md`.

**Implementation status:** in progress. Stages A through D are complete; Stage E Desktop runtime
composition and existing-command integration is next.

**Task integration branch:** `feature/skeleton-desktop-runtime`.

**Baseline:** `9ee5191`, the accepted prototype-restoration revision on local `main`.

The outcome is a packaged Electron Desktop application that owns native persistence, supervises
one Rust engine host, opens the system's normal shared-output path and exposes those capabilities
through the existing versioned application runtime. It must play the Stage 4 `Deep` Bass engine,
preserve the latest project revision through engine failure and round-trip a minimal `.tiempio`
project without giving the renderer filesystem or process authority.

The prototype-exact UI restored immediately before this stage is a non-negotiable part of the
baseline. Stage 5 is a runtime and platform-integration stage, not a redesign. Its implementation
must retain the approved visual hierarchy, geometry, typography, colors, density, shared controls,
light/dark schemes and responsive compositions. Runtime availability may activate an already
designed state, but it may not reshape or restyle that state.

Stage 5 does not implement the Web AudioWorklet, the complete primary onboarding journey, production
drums, imported audio, native MIDI, exclusive/low-latency device modes, offline export, advanced
routing, multiple project windows, cloud features or a new product surface. Those remain later
plans. It also does not create repository-hosted automation under `.github/workflows/`.

## Sources of truth

Implementation follows these authorities in order of concern:

- `docs/architecture/TIEMPIO_ARCHITECTURE.md` for process responsibilities, state authority,
  persistence, engine supervision, security and real-time rules;
- `docs/project-plan/APPLICATION_SKELETON.md` Stage 5 for the approved product boundary and exit
  criteria;
- `docs/tiempio_ux_prototype.html` for the exact application-owned appearance;
- `docs/project-plan/PROTOTYPE-VISUAL-RESTORATION.md` and
  `docs/evidence/prototype-visual-reference/` for the visual boundary, reference hashes, component
  ownership and accepted light/dark witnesses;
- `docs/project-plan/STAGE-3-PROJECT-CORE.md` for `ProjectSession`, revision, logical archive and
  recovery contracts;
- `docs/project-plan/STAGE-4-ENGINE-CORE.md` for protocol, DSP, render-plan, capability, scheduling
  and real-time invariants;
- the current runtime, engine-client, project-format and Desktop scaffolding as the implemented
  starting point, not as permission to weaken the approved architecture.

If a runtime requirement conflicts with the exact prototype or another product invariant,
implementation stops at that boundary, records the conflict and asks the user for a decision. It
does not silently choose a visual compromise or invent a new interaction.

## Inherited starting point

The accepted baseline already provides:

- one shared React application mounted by Desktop and Web;
- all seven prototype states restored in Light and Dark with a locked prototype hash and 14 retained
  visual witnesses;
- shared application-owned title bar, dropdown, popover, tooltip, focus and scrollbar treatments;
- one `ProjectSession`, immutable project revisions, logical archive validation and checksummed
  recovery envelopes;
- a typed `ApplicationRuntime` whose Desktop implementation currently exposes only lifecycle and
  native-window capabilities;
- a typed `EngineClient`, strict command/event validators and revision-aware protocol session;
- bounded four-byte big-endian engine framing and deterministic Stage 4 Rust DSP/rendering;
- a native-host crate that currently proves only workspace composition and protocol-version access;
- secure Electron window defaults with sandboxing, context isolation and no renderer Node access;
- a lifecycle owner with a single-run lock, per-step timeouts, heartbeats, termination handling and
  exact task-owned process-tree cleanup.

Stage 4 deliberately rejects live-audio commands such as `configure-audio`, `start-audio`,
`stop-audio` and `refresh-devices`. Stage 5 must enable them only behind honestly negotiated native
capabilities. It must not make the existing shell appear healthy before the host, device and active
configuration have actually acknowledged readiness.

## Required user-visible outcome

At Stage 5 acceptance:

- the packaged Windows Desktop application starts one supervised native engine host;
- the host opens the normal shared output path and produces the real Stage 4 `Deep` Bass sound;
- existing keyboard audition and transport requests can cross the typed runtime boundary without
  exposing raw Electron or process transport;
- engine readiness, device loss, restart and failure appear through truthful states of the existing
  prototype-owned audio status treatment;
- a minimal project can be created, opened, saved, saved under a new destination and recovered
  through opaque project handles and revision-bound results;
- closing the application waits for the bounded recovery and engine-shutdown barriers;
- another ordinary audio source can continue playing during the Windows Shared Audio acceptance
  scenario;
- the application-owned UI remains visually equivalent to the accepted prototype baseline.

Persistence and engine APIs must be complete and integration-tested in this stage even where the
full beginner-facing save/open journey remains Stage 7 presentation work. A control stays disabled
when its production command coordinator is not yet present; backend availability alone is not a
reason to simulate or prematurely expose a flow.

## Non-negotiable authority and dependency boundaries

### Process and state ownership

- The renderer owns presentation, `ProjectSession` and command coordination. It owns no path,
  dialog, archive stream, child process, device handle or engine pipe.
- Electron main owns the single-instance lifecycle, current window, project registry, native
  dialogs, physical archive access, fingerprints, recovery files, settings files and engine
  supervisor.
- Preload is a narrow typed membrane. It exposes neutral values, opaque handles and explicit event
  subscriptions, never `ipcRenderer`, channel names, native paths, PIDs, command lines or arbitrary
  invocation.
- The native host owns device/backend state, the audio callback, engine clock, active voices and
  volatile diagnostics. It never owns the canonical project or unsaved user content.
- `ProjectSession` remains the only musical-content authority. A cached render plan in the
  supervisor is a bounded volatile restart projection, not a second project model.
- The engine acknowledges the project revision it actually activated. A stale acknowledgement,
  meter, diagnostic, save result or recovery result cannot replace newer state.
- Desired audio settings and active device facts remain separate. The UI reports a device or mode
  as active only after a host event confirms it.

### Dependency direction

```text
shared application + ProjectSession
              |
              v
       ApplicationRuntime
              |
              v
Desktop renderer adapter -> preload bridge -> Electron main coordinators
                                                |                 |
                                                v                 v
                                      native persistence   EngineHostSupervisor
                                                                  |
                                                                  v
                                                        Rust native host
                                                                  |
                                                                  v
                                                        shared audio backend
```

- Shared application and feature code do not import Electron, Node, native paths or Stage 5 main
  modules.
- Electron main may compose shared neutral contracts and project-format validation, but it may not
  mutate musical content independently of a renderer-provided validated revision.
- Native persistence and engine supervision remain separate main-process modules with focused
  interfaces and tests.
- The Rust native host composes the existing `protocol`, `core`, `dsp` and `synth` crates. Platform
  audio dependencies do not enter those crates.
- No audio samples cross Electron IPC. Only bounded control commands and coalesced events do.

## Exact prototype and UI preservation contract

This section is a release gate, not a preference.

### Immutable visual authority

- `docs/tiempio_ux_prototype.html` remains the exact application-owned visual authority at the
  recorded SHA-256
  `C1A69E43635C7A41791A9179F5D1B0A176FEBDEB9E1F76A2BC2B109047F4990A`.
- The 14 retained Light/Dark captures and their manifest remain unchanged.
- The prototype `.app-window` and everything inside it remain in scope: title bar, rail, all seven
  screen compositions, panels, editors, controls, popovers and defined states.
- The documentation harness stays out of production. Yinkie remains read-only and is not a visual
  authority.

Any intended change to the reference file, its hash, reference captures or a visible
application-owned region requires a separate explicit user decision. Stage 5 cannot approve such a
change for itself.

### Forbidden Stage 5 UI changes

Stage 5 must not:

- add, remove, reorder or resize an application-owned visible region;
- replace the restored state-specific compositions with a generic Desktop shell;
- alter typography, tokens, colors, spacing, density, borders, radii, shadows, icons or motion;
- introduce a new settings screen, device panel, debug console, engine log view, banner, toast,
  modal, popover or status widget not already defined by the prototype merely because the runtime
  needs diagnostics;
- use an unthemed native HTML select, popup or scrollbar inside the application;
- add Desktop-only branches inside shared feature components;
- expose raw device names, paths, PIDs, protocol text or technical errors in the creative UI;
- make a visually enabled control claim save or audio success before its command and runtime state
  are real;
- change CSS or shared primitives as incidental cleanup.

### Permitted runtime-driven visual changes

The implementation may only:

- switch an existing control between its already approved disabled, enabled, active and error
  states when the central command-availability model says so;
- implement or populate the prototype-defined audio chip/popover with localized, user-meaningful
  health state while retaining its exact reference geometry and styling; if the popover is absent
  from the current production component, completing that already approved prototype element is
  allowed, but generalizing or redesigning it is not;
- use the existing title-bar controls with the current Windows custom chrome and macOS native
  traffic-light exception;
- open operating-system-owned file dialogs outside the application interior;
- update accessible names, live-region semantics and non-color signals without introducing an
  unexplained visible redesign.

If a required error or recovery path cannot fit an existing prototype-owned surface, it is recorded
as a design conflict and paused for user review. It is not solved by adding an unapproved component.

### Visual acceptance during runtime work

- Every implementation stage runs the prototype hash/manifest contract.
- Any change under `packages/application`, `packages/design-system`, shared styles or Desktop chrome
  triggers the complete seven-state Light/Dark visual matrix, not only the screen directly touched.
- Deterministic unavailable-runtime fixtures remain available so Stage 5 cannot erase the approved
  pre-audio and disabled states.
- Runtime-available Desktop fixtures additionally cover the existing Home, Sound Chooser and Piano
  Roll compositions, audio popover, focus-visible state and a device-failure state without changing
  their geometry.
- Canonical landmark geometry retains the existing one-CSS-pixel tolerance and screenshot mismatch
  remains at or below the restoration plan's `0.25%` limit, with no coherent application-owned diff
  region.
- Windows custom chrome is application-owned and receives no mask. Only OS-owned macOS chrome and
  operating-system dialogs may be excluded from application screenshot comparison.
- Compact, standard, ultrawide and constrained-height states remain usable in Light and Dark. EN,
  RU and ES status text must not change the Russian reference geometry baseline or make controls
  unreachable.

## Versioned Desktop runtime and IPC contract

### Contract evolution

Stage 5 changes the Desktop bridge from window-only scaffolding into projects, settings, lifecycle
and engine capabilities. It therefore treats the bridge shape as a versioned public contract:

- bump `applicationRuntimeVersion` when the required bridge shape changes;
- reject a main/preload/renderer version mismatch before creating runtime clients;
- represent capability absence explicitly rather than installing throwing placeholders;
- keep `resources` unavailable until bounded native audio import is implemented in its own stage;
- define Save, Save As and Save Copy semantics explicitly; do not overload Web
  `download-requested` semantics to claim a Desktop persistence acknowledgement;
- return opaque handles and neutral snapshots only; no error detail may contain a native path.

Live native audio also changes the set of honestly supported engine capabilities. Stage A must
record whether this is a compatible capability-only extension or a protocol-version change. Because
the Stage 4 parser uses closed capability sets, an extension that an older peer would reject must
advance `engineProtocolVersion`; it must not silently widen protocol version 1. Generated TypeScript
and Rust bindings, fixtures and handshake tests move together.

### Closed IPC surface

- Channel identities live in one main/preload-owned closed registry and are never exported to the
  renderer.
- Every invocation validates the sender against the current owned `webContents`, expected target
  URL/origin, bridge version, exact payload shape, identifier syntax and byte ceiling.
- Event subscriptions return cleanup functions, are scoped to one renderer generation and are
  removed on reload, navigation or destruction.
- Navigation, new windows, permission prompts and unexpected renderer origins are denied.
- Project bytes, settings and engine messages have separate channels and separate limits; no
  arbitrary method/channel escape hatch exists.
- Transport and meter events are coalesced before renderer delivery. Slow renderer consumers cannot
  backpressure the audio callback or grow an unbounded event queue.
- Errors crossing preload contain stable application codes, retryability and redacted neutral
  details. Logs never contain project content, project names, paths or session tokens.

## Native project persistence and recovery

### Project registry and opaque handles

- Electron main maintains one process-wide registry keyed by canonical file identity and indexed by
  unpredictable opaque handles.
- One canonical source has one active authority. Opening an already registered file focuses/reuses
  that record instead of creating a competing snapshot.
- Untitled projects receive a handle without a path. Their first persist operation performs Save As.
- The renderer cannot choose a raw path or forge a handle. Handles are validated for ownership and
  lifecycle on every call.
- Registry state records the last loaded fingerprint, last persisted revision, compatibility state,
  current bounded archive metadata and recovery identity, but not a second editable project model.

### Physical `.tiempio` container

- Stage 5 implements the physical ZIP adapter for the Stage 3 logical archive contract.
- Central-directory metadata is checked before decompression: path syntax, normalized duplicates,
  entry count, compressed/uncompressed sizes, ratio, supported compression method and total size.
- Directory traversal, absolute paths, drive-prefixed paths, links, device files, encrypted entries,
  duplicate normalized paths and data beyond declared limits fail closed.
- Inflation is streamed or incrementally bounded; declared sizes are not trusted and the renderer
  never receives the entire physical archive.
- The initial renderer snapshot contains only the bounded project manifest needed by
  `ProjectSession`. Main retains validated opaque archive entries required for lossless rewrite.
- Unknown future project versions open read-only with original bytes preserved. They cannot be
  destructively normalized or saved as if supported.

The inherited ceilings remain authoritative unless a separately reviewed format revision changes
them: 512 entries, 16 MiB per entry, 4 MiB manifest, 32 MiB total decompressed data, 240-character
archive paths and compression ratio no greater than 200.

### Fingerprint-guarded atomic persistence

- A fingerprint is derived from the observed on-disk source, not from a renderer claim.
- Save revalidates the source fingerprint immediately before replacement. External modification,
  deletion, read-only state and destination collision map to distinct stable results.
- A newer project revision arriving while an older revision is writing remains dirty. Only the
  exact persisted revision can be acknowledged.
- Writes use an exclusively created unique sibling temporary file, bounded serialization, file
  flush, close, final conflict check and platform-reviewed atomic replacement.
- Success is reported only after replacement durability reaches the supported platform boundary.
  Failure leaves the previous project and valid recovery intact.
- Temporary files are task-owned, cleaned on every handled exit and recognized safely after a crash;
  unrelated sibling files are never deleted.
- Save As cannot overwrite an open source or unrelated destination without an explicit, validated
  user choice from the native dialog.

### Recovery and settings

- Recovery is stored under Electron application data, never beside the project.
- One checksummed latest snapshot per project/untitled recovery identity is written atomically and
  remains independent of explicit Save.
- A restored recovery opens dirty and still requires explicit persistence.
- A successful save clears recovery only when it covers the same or an older revision and the clear
  itself completes safely.
- Close waits for the latest bounded recovery barrier. A failed or timed-out barrier defers close
  through the existing lifecycle contract rather than discarding unsaved content.
- Stage 5 adds only the bounded settings snapshot already defined by the runtime contract. Desired
  theme/audio preferences are validated and atomically written; active device truth still comes
  from the engine.

## Native engine host and shared audio

### Host separation

The native host has three execution domains:

1. a bounded protocol I/O domain that reads and writes framed messages;
2. a non-real-time control domain that validates commands, prepares plans, discovers devices and
   publishes bounded changes;
3. the device callback, which renders the existing `EngineKernel` without allocation, blocking,
   filesystem access, logging, JSON parsing or unbounded work.

Cross-domain communication uses preallocated bounded queues or an audited preallocated exchange.
Queue saturation produces a stable diagnostic and controlled fallback. It never blocks the audio
callback or silently drops a state-changing command that the application believes was accepted.

### Audio backend decisions

- The platform-audio dependency is selected in Stage A through a small audited comparison, pinned
  exactly and isolated in `native-host`; it does not leak into shared engine crates or application
  contracts.
- Windows uses the normal shared-output mode for Stage 5. Exclusive/low-latency ownership is out of
  scope and must not appear enabled in UI or capabilities.
- The host negotiates an actual supported stereo floating-point or safely converted output
  configuration within the protocol sample-rate/block ceilings.
- Backend and format conversion reuse preallocated buffers and the production `render_block` path.
  They do not fork or approximate the Bass DSP.
- Unsupported channel layouts, sample formats or buffer sizes fail with a structured diagnostic;
  they do not emit undefined data.
- Start is acknowledged only after the stream is active. Stop, device loss, restart and shutdown
  release all audition voices and leave defined silence.
- Device enumeration exposes stable opaque device IDs and user-appropriate labels only through
  typed events. Platform handles never cross the host boundary.

### Protocol command execution

- The host requires one compatible handshake before all other commands and advertises only the
  capabilities it truly supplies.
- `configure-audio`, `start-audio`, `stop-audio` and `refresh-devices` become available only when
  the negotiated native-audio capability is present.
- Render-plan preparation remains outside the callback; activation and acknowledgement remain at an
  audio-block boundary.
- Play, stop, seek, loop, note audition and diagnostics drive the existing kernel and retain Stage 4
  sequence/revision rules.
- Unknown, stale, malformed, oversized or unsupported commands preserve the last valid plan and
  active project authority.
- Transport/meter/device/health events have a bounded cadence. Fatal protocol corruption terminates
  the session and produces silence before process exit.

## Engine supervision and process lifecycle

### Launch and identity

- Electron main resolves the engine binary from an explicit development or packaged
  platform/architecture location and verifies that the resolved target remains inside the approved
  application resource root.
- It launches exactly one child directly with `shell: false`, hidden on Windows, closed inherited
  handles except the required pipes and no user-controlled arguments.
- Each launch receives an unpredictable one-use task token through a non-logged child-only channel.
  The token is verified during startup and is never persisted, rendered or included in diagnostics.
- The supervisor records exact PID, creation identity, resolved executable, parent relation and task
  token. PID alone is never sufficient for cleanup.
- Duplicate launch requests share the same in-flight connection or fail deterministically; they do
  not create parallel hosts.

### Framing, startup and heartbeats

- Parent-to-child and child-to-parent control bodies use the Stage 4 four-byte unsigned big-endian
  length prefix and strict bounded JSON body.
- Standard output carries protocol frames only. Standard error is a bounded, redacted diagnostic
  stream and cannot become an unbounded memory sink.
- Oversized declared lengths are rejected before body allocation. Truncated, trailing, invalid
  UTF-8, over-deep or out-of-order messages fail closed.
- Startup has explicit spawn, token, ready, handshake and first-capabilities deadlines. Progress is
  observable without exposing technical data in the UI.
- Heartbeats detect a hung host independently of visual meter traffic. A missing heartbeat marks the
  engine unavailable, releases renderer subscriptions and enters bounded cleanup.

### Shutdown, crash and restart

- Graceful shutdown sends the typed shutdown command, stops audio, closes protocol pipes and waits
  within a bounded deadline.
- Timeout or crash triggers exact verified task-owned process-tree cleanup. The implementation never
  kills by executable name and never touches a process whose ownership cannot be proven.
- Every success, failure, timeout, renderer reload and application-exit path clears listeners,
  timers, queued requests, identity records and task-owned handles.
- One controlled automatic restart may be attempted after a recoverable crash. Repeated failure
  stops the loop. Stage 5 does not invent a restart button: until an approved prototype-owned action
  exists, the next explicit reconnect or application restart is the recovery path. If in-session
  manual retry becomes required, implementation pauses for user review of that visible state.
- The supervisor retains only the newest bounded validated render-plan projection and revision
  needed to restore volatile engine state. After restart it reconnects, reloads that projection and
  waits for acknowledgement before resuming sound.
- Restart cannot acknowledge Save, mutate `ProjectSession` or erase recovery.

## Initial operational ceilings and deadlines

Stage A records these as shared constants or narrows them after measured evidence; no implementation
may silently make them unbounded:

| Resource | Initial ceiling |
| --- | ---: |
| Renderer project manifest transfer | 4 MiB plus fixed envelope overhead |
| Physical project entries | 512 |
| Physical project decompressed bytes | 32 MiB |
| Engine frame body | 262,144 bytes |
| Engine protocol payload | 196,608 bytes |
| Engine startup and compatible handshake | 10 seconds total |
| Heartbeat interval | 1 second |
| Missed heartbeat failure threshold | 5 seconds |
| Graceful engine shutdown | 3 seconds |
| Verified forced-cleanup confirmation | 3 seconds |
| Recovery/close barrier | 10 seconds |
| Renderer transport snapshots | at most 30 per second |
| Renderer meter snapshots | at most 30 per second |
| Retained native-host stderr | 64 KiB ring buffer |
| Automatic restart | one attempt per failure episode |

Audio callback deadlines derive from the negotiated sample rate and device buffer, not from a fixed
wall-clock assertion. Deadline measurements are recorded as baselines; hardware scheduling variance
does not turn a unit test into a flaky performance gate.

## Stage A dependency decision record — 2026-08-10

- Native audio uses exactly `cpal 0.17.3` with default features disabled. CPAL is Apache-2.0
  licensed, exposes WASAPI as its Windows backend and remains isolated in the Rust `native-host`
  crate. ASIO, JACK, Web Audio and optional real-time-priority features are not enabled.
- Native callback exchange uses exactly `rtrb 0.3.4` with default features disabled. Its bounded
  wait-free SPSC queues are isolated in `native-host`; allocation happens before stream start and
  full queues fail explicitly without blocking the callback. It is dual MIT/Apache-2.0 licensed.
- Bootstrap token acknowledgement uses exactly `sha2 0.11.0` with default features disabled. The
  RustCrypto implementation is dual MIT/Apache-2.0 licensed, is confined to native-host startup and
  is never called from the realtime callback.
- Physical project compression uses exactly `fflate 0.8.3` in Electron main. It is MIT licensed,
  has no runtime dependencies and provides bounded streaming ZIP/DEFLATE primitives. It is not
  imported by the renderer, Web target or shared application.
- The Rust `zip` crate was not selected because physical project ownership belongs to Electron main
  and routing persistence through another child process would add authority and lifecycle surface
  without product benefit.
- Both versions are pinned in the repository manifests and lockfiles. A future update requires the
  same license, security, size, callback/streaming and cross-target review.

Primary references:

- `https://github.com/RustAudio/cpal`;
- `https://github.com/mgeier/rtrb`;
- `https://docs.rs/sha2/0.11.0/sha2/`;
- `https://www.npmjs.com/package/fflate`.

## Delivery stages

The plan commit lives on `feature/skeleton-desktop-runtime`. Each implementation stage uses its own
branch from the updated integration head, runs focused checks, receives atomic English commits and
is reviewed before fast-forward merge back into the task integration branch. Implementation stages
remain sequential even where code dependencies would permit overlap.

### Stage A — Versioned contracts, dependency decisions and lifecycle entry points

**Branch:** `feature/desktop-contracts-lifecycle`.

- Freeze the Desktop main/preload/renderer DTOs, closed IPC registry, error redaction and event
  subscription model.
- Refine project operations so Save, Save As, Save Copy, compatibility and revision acknowledgement
  are unambiguous.
- Version the application runtime bridge and, if required by closed capability evolution, the engine
  protocol.
- Add native live-audio capability/diagnostic codes and deterministic generated TypeScript/Rust
  bindings without weakening Stage 4 validation.
- Select and pin the minimal physical-archive and native-audio dependencies after license, security,
  callback and packaging review.
- Promote the reserved `build:engine`, `package:check` and `check:audio` workflows through the
  existing lifecycle owner. Every stage gets a direct `shell: false` launch, timeout, heartbeat,
  signal handling, single-run lock and exact cleanup.
- Add fake-process and policy fixtures before any real child-process, package or device workflow is
  run.
- Record final ceilings, deadlines, supported Stage 5 platforms and explicit unsupported modes.

**UI invariant:** no application layout, style or reference asset changes. Capability tests use
neutral fixtures only.

**Stage exit:** cross-process contracts and lifecycle entry points are deterministic, generated
bindings match and all future Stage 5 heavy commands have one safe owner.

**Implementation record — 2026-08-10:** complete. Runtime bridge version 2, the closed Desktop IPC
registry, bounded/redacted boundary validators, native-host bootstrap contract, engine protocol
version 2 heartbeat/audio-health vocabulary and generated TypeScript/Rust bindings are committed as
one contract surface. `cpal 0.17.3` and `fflate 0.8.3` are exactly pinned and locked. The lifecycle
catalog now owns native-host build/staging, controlled audio self-test and unpacked package checks;
its timeout and ownership policies are covered by tests. `npm run check:quick` passed all 19 stages,
including the locked prototype/UI policy, and the post-run lifecycle audit found no remaining task
process, lock or quarantine.

### Stage B — Native project registry, physical archive, settings and recovery

**Branch:** `feature/desktop-native-persistence`.

- Implement canonical source identity and unpredictable opaque project handles in Electron main.
- Add native Open, Save As and Save Copy dialogs without exposing paths through preload.
- Implement bounded physical ZIP read/write around the Stage 3 logical archive and compatibility
  behavior.
- Add fingerprint-conflict detection, unique sibling temporary writes, flush, atomic replacement and
  deterministic temporary-file cleanup.
- Implement revision-bound persist results, save-race handling and lossless preservation of retained
  validated entries.
- Implement application-data recovery and settings stores with atomic replacement and bounded close
  barriers.
- Add fault injection for every open/write/flush/conflict/replace/recovery/cleanup boundary.

**UI invariant:** system dialogs are the only new visible objects. The application interior and
current command availability remain unchanged until the existing coordinator is genuinely wired.

**Stage exit:** runtime-level tests create, open, persist, conflict, recover and reopen a minimal
project without renderer path authority or data loss.

**Implementation record — 2026-08-10:** complete. Electron main now owns canonical source identity,
256-bit opaque handles, native Open/Save destinations, a bounded ZIP central-directory preflight,
streaming inflate with size/CRC checks, lossless retained entries and exact read-only copying of
unsupported future projects. Saves use fingerprint revalidation, exclusive sibling temporary
files, flush, atomic replacement and handled-exit cleanup. Per-project serialization keeps revision
N/N+1 outcomes truthful; recovery and settings use checksummed/bounded atomic stores, and close can
wait on the latest recovery barrier for at most 10 seconds. Fault injection covers open, read,
write, flush, conflict, replace, recovery and cleanup boundaries. `npm run check:quick` passed all
19 stages, including the locked prototype/UI policy, and the post-run lifecycle audit was clean.

### Stage C — Rust native host and shared-output adapter

**Branch:** `feature/native-shared-audio-host`.

- Implement the framed native-host protocol loop, handshake, capabilities, command dispatcher and
  bounded event writer.
- Add the isolated shared-output backend adapter and supported configuration negotiation.
- Compose the existing Bass voice bank and `EngineKernel` into the device callback.
- Add bounded control-to-audio publication, block-boundary plan activation, audition lifecycle and
  diagnostics without callback allocation or locking.
- Implement configure/start/stop/refresh-device behavior and truthful device/health events.
- Add a deterministic controlled/null backend for integration tests and a real Windows Shared Audio
  adapter for acceptance.
- Cover device loss, unsupported format, callback-size variation, queue saturation, non-finite
  containment, shutdown and protocol corruption.

**UI invariant:** the host has no UI and emits no user-visible copy; it reports stable codes and
neutral facts for localization by the existing application surface.

**Stage exit:** the standalone supervised test harness can handshake, load a real Bass plan, start
shared output, audition, stop and shut down while retaining Stage 4 deterministic and real-time
invariants.

**Implementation record — 2026-08-10:** complete. The standalone Rust host now owns strict framed
stdin/stdout protocol I/O, a native-host session profile, truthful capabilities, typed device and
health events, shared-output configuration negotiation and F32/I16/U16 conversion. Windows uses
CPAL's normal WASAPI shared path; opaque stable device IDs keep backend handles private. The device
callback owns the production `EngineKernel` and `Deep` Bass pool, uses preallocated scratch space
and bounded wait-free `rtrb` exchanges, reclaims retired plans on the control thread and emits
bounded observations through a non-realtime writer. Controlled null-backend coverage performs a
real framed handshake, plan activation, audition, heartbeat, stop and shutdown; allocation
instrumentation reports zero callback allocations/deallocations. `npm run check:rust`, release
`npm run check:audio` and `npm run check:quick` pass, and the post-run lifecycle audit is clean. No
React, CSS, design token, geometry or prototype-reference file changed.

### Stage D — EngineHostSupervisor and typed Desktop bridge

**Branch:** `feature/desktop-engine-supervision`.

- Implement packaging-aware binary resolution, one-use token creation and direct hidden child
  launch.
- Implement exact process identity, framed pipe transport, bounded stderr capture, startup phases,
  heartbeats and request correlation.
- Implement graceful shutdown, verified exact-tree fallback cleanup, crash classification,
  one-attempt restart and latest-plan reload.
- Adapt the supervisor to the main-owned engine IPC handlers and preload-owned `EngineRuntime`.
- Validate sender identity, payloads, limits and renderer-generation subscriptions.
- Coalesce transport/meter events outside the audio process and prevent renderer backpressure.
- Add fake-child tests for missing binary, wrong token/version, partial frames, oversized frames,
  early exit, hang, pipe error, renderer reload, PID reuse, foreign descendant and cleanup failure.

**UI invariant:** supervisor states map only to existing runtime availability and audio-status
states. No raw host state or debug presentation is added.

**Stage exit:** renderer-facing engine operations use only typed neutral methods; every supervisor
exit path leaves no verified task-owned child, timer, subscription or pipe.

**Implementation record — 2026-08-10:** Electron main now resolves the native executable only from
the approved development or packaged platform/architecture root, launches one hidden direct child
with a one-use environment token and verifies its SHA-256 bootstrap acknowledgement before engine
traffic. `EngineHostSupervisor` owns strict framed pipes, monotonic rewritten command/event
sequences, bounded writes and stderr retention, heartbeat failure detection, health projection,
30 Hz transport/meter coalescing, serialized graceful shutdown and exact retained-child-handle
fallback cleanup. One automatic restart re-handshakes and reloads the newest validated render plan,
waiting for its project-revision acknowledgement before returning to ready. Main-owned IPC validates
the exact renderer, origin, main frame, runtime version, generation and payload; preload exposes only
the typed neutral `EngineRuntime`, revalidates every result/event and returns cleanup functions.
Fake-child coverage exercises missing binaries, wrong token/version, partial and oversized framing,
early exit, heartbeat hang, pipe failure, renderer reload, PID reuse, a foreign same-PID process and
cleanup failure. `npm test`, `npm run check:rust` and the 19-step `npm run check:quick` pass; the
locked prototype and complete light/dark reference matrix remain unchanged. No React, CSS, design
token, geometry or prototype-reference file changed.

### Stage E — Desktop runtime composition and existing-command integration

**Branch:** `feature/desktop-runtime-integration`.

- Compose available projects, settings, engine, lifecycle and native-window capability groups in
  `createDesktopRuntime` after a compatible bridge handshake.
- Keep resources and deferred operations explicitly unavailable.
- Integrate one `EngineClient` outside React Strict Mode duplication and bind it to the existing
  command registry and project revision coordinator.
- Route current keyboard audition, load-plan, play, stop, seek and loop requests through the typed
  engine runtime.
- Release all held audition notes on key-up, blur, visibility loss, navigation, renderer teardown,
  engine failure and application close.
- Compile and publish only the newest project render plan; ignore stale acknowledgements and reload
  the latest projection after a supervised restart.
- Map host diagnostics into the existing localized audio chip/popover and command availability.
- Connect runtime-level persistence operations without inventing Stage 7 tutorial or completion UI.
- Add single-instance second-launch routing and bounded close coordination around recovery and
  engine shutdown.

**UI invariant:** use the exact restored components and their approved states. No composition,
style, CSS-token or geometry changes are accepted. If enabling a real command exposes a missing
visual state, stop for user review instead of designing it inside Stage 5.

**Stage exit:** a production Desktop renderer can reach real engine and persistence adapters through
the existing application architecture while all seven prototype states remain visually unchanged.

### Stage F — Packaging, hardware smoke and acceptance evidence

**Branch:** `feature/desktop-runtime-acceptance`.

- Build the native host through the lifecycle owner for the intended platform/architecture and place
  it in one explicit packaged resource location outside `app.asar`.
- Add integrity and package-content checks that reject a missing, wrong-architecture, duplicate,
  source-tree or development-relative engine binary.
- Preserve Electron sandbox, CSP, denied navigation/window/permission behavior and production fuses.
- Exercise packaged open/save/reopen/recovery/conflict and engine crash/restart behavior.
- Run a Windows Shared Audio smoke while an independent audio source remains active; record device,
  negotiated configuration, first-audible latency, callback timing, underruns and recovery result
  without recording private device or project data.
- Run the full prototype contract and seven-state Light/Dark matrix plus runtime-available Desktop
  scenarios at standard, compact, ultrawide and constrained-height sizes.
- Review Desktop/Web/shared bundle attribution so native code, Node APIs and platform dependencies
  do not enter Web or shared product graphs.
- Record `docs/evidence/STAGE-5-DESKTOP-RUNTIME.md` with automated results, package manifest, visual
  review, hardware limitations and residual risks.
- Audit the combined diff against this plan, Stage 3/4 contracts, the architecture and the exact
  prototype before acceptance.

**UI invariant:** no application-owned screenshot mask or unapproved coherent diff is permitted.

**Stage exit:** all Stage 5 definition-of-done items have reproducible evidence and the task branch
is clean, audited and ready for explicit review without merging to `main`, pushing or opening a pull
request.

## Edge cases and failure modes

### Visual and interaction integrity

- Runtime integration accidentally restores the pre-prototype generic shell or moves controls into
  a Desktop-only layout.
- An available engine changes audio-chip dimensions, typography or popover placement.
- Longer localized health/device copy wraps differently and shifts canonical geometry.
- A new error path adds an unapproved banner, modal, toast or debug panel.
- Native Windows menu/chrome or macOS traffic-light spacing overlaps the approved title bar.
- Strict Mode or renderer reload duplicates listeners, engine clients, notes or visible state.
- A shared control change fixes one runtime state while regressing another of the 14 reference
  images.

### Engine and process lifecycle

- Binary missing, corrupt, wrong architecture, unsigned for a production distribution gate or
  resolved outside the package resource root.
- Spawn succeeds but token, ready, handshake or capability negotiation fails or times out.
- Partial, coalesced, oversized, malformed, non-UTF-8 or replayed frames.
- Child stdout/stderr backpressure, event storm, hung heartbeat or shutdown deadlock.
- PID reuse, child-created descendants, renderer reload, Electron crash or application close during
  restart.
- Ownership cannot be proven during cleanup; the implementation must not kill the ambiguous process.
- Automatic restart loop or stale cached plan activation.
- Device absent, busy, removed, changed or returning an unsupported format/buffer size.
- Callback deadline miss, queue saturation, voice leak, stuck note, non-finite output or audible
  discontinuity during plan/configuration changes.

### Persistence and durability

- Corrupt/truncated ZIP, central-directory inconsistency, duplicate normalized path, traversal,
  link, excessive ratio/count/size or future project version.
- Two paths resolve to one canonical source, or a file changes identity through link/case handling.
- External modification, deletion, read-only source or Save As destination collision.
- Project edit while save/recovery is in flight; out-of-order completion must not clear newer dirty
  state.
- Crash before/after temporary-file flush or atomic replacement.
- Recovery newer than the saved project, corrupt recovery or failed recovery cleanup after save.
- Close requested while native dialog, save, recovery write or engine shutdown is pending.
- IPC snapshot exceeds limits or a forged opaque handle targets another registry record.

### Security, privacy and target separation

- Unexpected sender, navigation or renderer generation invokes a valid channel.
- Error details, logs, crash output or evidence include a project name, path, content,
  device-private identifier or task token.
- An archive dependency extracts before validating limits.
- Engine or ZIP dependencies leak into the Web/shared initial bundle.
- Packaged source/build material or a second native-host copy enters `app.asar`.
- Development URL handling weakens packaged origin validation.

## Verification strategy

### Focused automated checks

- Contract tests for runtime/protocol version mismatch, exact payload validation, capability truth,
  error redaction and unsubscribe behavior.
- IPC tests for sender ownership, navigation/reload invalidation, byte ceilings and closed channel
  coverage.
- Project-registry, canonicalization, archive corpus, fingerprint, atomic-save, revision-race,
  recovery and fault-injection tests.
- Rust protocol/host tests for every command, event, malformed frame, configuration and device
  transition.
- Callback allocation/lock harness and Stage 4 golden render regression.
- Supervisor fake-process tests for success, failure, timeout, interruption, PID reuse, foreign
  descendants and cleanup failure.
- Target-boundary, CSP, dependency, package-content, bundle and chunk-topology policies.
- Existing application, command, project, design-system and localization suites.

### Integration and packaged checks

- Main/preload/renderer contract integration without raw IPC leakage.
- Controlled/null-backend host process smoke with real framed transport and restart.
- Physical project open/save/reopen/recovery/conflict smoke from a packaged application.
- Packaged engine-resolution and architecture manifest inspection.
- Real Windows Shared Audio coexistence, device-loss/reopen and non-silent Bass evidence on the
  acceptance host.
- Startup, first-audible, render-plan preparation, callback deadline, meter cadence, memory and
  package-size baselines.

### Visual and accessibility regression

- Prototype and reference-manifest hash validation before every visual comparison.
- All seven states in Light and Dark at canonical size.
- Compact, ultrawide and constrained-height composition families.
- Existing disabled/offline fixtures plus available, starting, active, device-lost, failed and
  restart audio states in the existing audio treatment.
- Windows custom title bar and macOS platform-owned chrome boundary.
- Keyboard traversal, focus restoration, stuck-note prevention, reduced motion, high contrast,
  non-color signals, shared dropdowns and semantic scrollbars.
- EN/RU/ES overflow review without changing the Russian visual baseline.

### Resource-safe execution

Every dependency installation, Rust build, production build, package, audio smoke and combined
validation runs sequentially through the repository lifecycle owner. Before a potentially
resource-intensive workflow starts, the user is warned. Each stage has a bounded timeout and
heartbeat; the owner propagates interruption and removes only its exactly verified task-owned
process tree, lock and quarantine on every exit path.

Immediately after every commit, and before another check, branch, commit or merge, run the exact
lifecycle audit. If any owned process or lock remains, stop all new work, clean only the verified
owned tree, confirm removal and report the incident. If ownership cannot be proven, do not kill the
process and pause for user direction.

## Definition of done

### Desktop runtime and security

- The packaged application has one single-instance Electron main, one current-window foundation and
  one version-compatible preload bridge.
- Renderer sandboxing, context isolation, CSP and navigation/window/permission denial remain intact.
- Renderer sees no native paths, channel names, process identities, raw device handles or arbitrary
  IPC.
- Runtime capabilities report only implemented operations and retain explicit unavailability for
  deferred scope.

### Audio and engine lifecycle

- One supervised Rust native host opens Windows Shared Audio and renders the real `Deep` Bass DSP
  outside the renderer.
- Handshake, framing, capabilities, revision acknowledgements, commands and events remain bounded
  and versioned.
- The device callback preserves no-allocation/no-blocking/no-I/O invariants and safe output on
  overload or invalid state.
- Missing/busy/lost output, startup failure, crash, hang and restart produce truthful structured
  diagnostics and no silent-success state.
- Engine failure cannot lose or mutate the latest project revision; controlled restart restores only
  the newest acknowledged render-plan projection.
- Shared Audio coexistence has retained Windows acceptance evidence.

### Durability

- A minimal physical `.tiempio` project round-trips without loss through opaque handles.
- Open, Save, Save As, conflict, failure and recovery results are revision-bound and truthful.
- Save is fingerprint-guarded and atomically replaces the destination without discarding valid
  recovery on failure.
- Recovery is checksummed, bounded, stored under application data and survives engine failure.
- Close cannot silently discard a pending newer recovery revision.

### Prototype and UI preservation

- The prototype HTML hash and all 14 reference image hashes remain unchanged.
- All seven application states still match the approved Light/Dark compositions and responsive
  hierarchy under the restoration criteria.
- Stage 5 adds no new application-owned visual surface and performs no unapproved restyling,
  rearrangement or geometry change.
- Real runtime state uses only existing approved control/status states, localized semantics and
  non-color signals.
- Windows custom chrome, shared dropdowns, popovers, scrollbars, focus and disabled/active/error
  states keep one application-owned treatment.
- Any platform-owned exception or user-approved deviation is narrow, documented and supported by
  retained evidence; no application-owned region is masked.

### Engineering acceptance

- Stage 3 project-format/recovery tests and Stage 4 protocol/DSP golden evidence remain green.
- Desktop and Web continue to mount the same shared application, and Web/shared graphs contain no
  Electron, Node, native backend or filesystem dependency.
- Native binary packaging is explicit, architecture-correct and independently inspectable outside
  `app.asar`.
- Required workflows are lifecycle-owned, sequential, bounded and observable.
- `docs/evidence/STAGE-5-DESKTOP-RUNTIME.md` maps every exit criterion to automated or retained
  evidence and records residual hardware/platform limits honestly.
- The final branch contains only Stage 5 work, focused atomic commits, no unrelated user changes, no
  lifecycle lock, no cleanup quarantine and no task-owned process.
- The branch is ready for user review but is not merged into `main`, pushed or submitted as a pull
  request without explicit authorization.
