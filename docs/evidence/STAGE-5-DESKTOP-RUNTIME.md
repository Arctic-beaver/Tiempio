# Stage 5 Desktop runtime evidence

## Acceptance boundary

Stage 5 implements the secure Electron runtime, physical project persistence, supervised Rust
engine host, shared-output adapter, existing-command integration and architecture-bound packaging.
This evidence distinguishes reproducible automated results from acceptance that still requires a
real Windows audio device or interactive packaged application.

The prototype remains the visual authority. Stage 5 changed no stylesheet, design token, typography,
spacing, application geometry, reference PNG or `docs/tiempio_ux_prototype.html`. Runtime state uses
only the existing command availability and audio-status treatments.

## Implementation map

| Delivery stage              | Branch                                 | Commit               | Result                                                                          |
| --------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| A — contracts and lifecycle | `feature/desktop-contracts-lifecycle`  | `02af779`            | Runtime v2, protocol v2, closed IPC and lifecycle-owned workflows               |
| B — native persistence      | `feature/desktop-native-persistence`   | `823cd90`            | Opaque handles, bounded ZIP, atomic/fingerprint saves, recovery and settings    |
| C — native shared audio     | `feature/native-shared-audio-host`     | `f8e8144`            | Framed Rust host, CPAL shared output, Deep Bass callback and controlled backend |
| D — engine supervision      | `feature/desktop-engine-supervision`   | `3219215`            | Verified child ownership, restart, coalescing and typed preload bridge          |
| E — runtime integration     | `feature/desktop-runtime-integration`  | `3f8ca71`            | One controller, project/engine coordination and truthful existing UI states     |
| F — packaging and evidence  | `feature/desktop-runtime-verification` | This evidence commit | Exact native resources, fuses, target separation and acceptance record          |

## Reproducible automated evidence

### Runtime, persistence and supervision

- Compiled unit/contract suite: 100 passing tests.
- Policy suite: 86 passing tests after adding package-integrity coverage.
- Persistence tests exercise physical create/open/save/reopen, Save As/Copy, external fingerprint
  conflict, unsupported-version preservation, recovery, settings and injected write failures in
  isolated temporary directories without exposing paths to the renderer.
- Supervisor tests exercise handshake/token/version failures, framing limits, heartbeat hang, crash,
  one restart, newest-plan restore, renderer generation changes, PID reuse and cleanup refusal.
- Controller tests cover load-plan projection, transport, seek/loop, stale acknowledgement rejection,
  restart restore and keyboard audition release on key-up/blur/close.
- `npm run check:audio` passed the release build, architecture-bound staging and the framed
  controlled null-audio self-test. Callback allocation instrumentation from Stage 4 remains green.

### Package and security

`npm run package:check` passed all 11 lifecycle-owned steps on Windows x64. Electron Builder produced
the unpacked application, applied the fuse profile and placed the native host outside `app.asar` at
`resources/native/win32-x64/`.

The staged and packaged manifest values matched exactly:

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| Target     | `win32-x64`                                                               |
| Executable | `tiempio-engine-native-host.exe`                                          |
| Bytes      | `955392`                                                                  |
| SHA-256    | `sha256:30E01D3A35872081488216D7EE8DB4DE7C823A3FE9B47C511083810B413AF467` |

Package policy requires exactly the executable/manifest pair, validates PE/ELF/Mach-O architecture,
size, target and SHA-256, rejects duplicate/source/development-relative content and finds exactly one
packaged `resources/app.asar`. Runtime resolution repeats the exact-entry, size, target,
architecture and hash checks before spawn.

The locked production fuse profile disables RunAsNode, Node options and CLI inspect arguments;
enables cookie encryption and embedded ASAR integrity validation; and permits application code only
from ASAR. Existing sandbox, context isolation, CSP, navigation, new-window and permission policies
remain part of `check:quick`.

### Target and bundle separation

| Bundle           | Measured bytes | Ceiling bytes |
| ---------------- | -------------: | ------------: |
| Desktop main     |         171555 |        196608 |
| Desktop preload  |          46584 |         57344 |
| Desktop renderer |         457244 |        491520 |
| Web              |         426940 |        458752 |

Desktop renderer attribution reported 372853 initial bytes and 34917 deferred bytes. Web reported
342428 initial bytes and 34905 deferred bytes. The Web graph contains the neutral
`ApplicationController` contract, but contains neither `EngineClient` nor the concrete
`ApplicationRuntimeController`; Electron, native backend and filesystem tokens remain forbidden.

### Prototype and UI preservation

- Prototype SHA-256 remains
  `C1A69E43635C7A41791A9179F5D1B0A176FEBDEB9E1F76A2BC2B109047F4990A`.
- All 14 retained Light/Dark reference hashes remain locked by policy.
- Production browser smoke covered Home, first-layer creation, sound chooser, the shared settings
  dropdown and unavailable-Web audio state at 1280×720, 1024×640 and 1600×900.
- Both Light and Dark presentation rendered with the application-owned dropdown and existing
  disabled/audio-status states. No browser console warning or error was observed.
- At 1024×640 the fixed prototype-preserving chooser composition clips the bottom of the keyboard
  preview while its primary action and physical-key audition remain available. Stage 5 deliberately
  made no geometry or overflow change; this inherited constrained-height behavior remains a UI
  follow-up only if the prototype authority is explicitly revised.

## Manual acceptance gates not claimed

The following results cannot be established honestly by the controlled backend or package-content
inspection and were not fabricated:

- real Windows Shared Audio coexistence while an independent browser/player source remains audible;
- private-device-free capture of negotiated hardware configuration, first-audible latency, callback
  timing, underruns and device-loss/reopen recovery;
- subjective confirmation of non-silent Deep Bass output on physical speakers/headphones;
- interactive launch of the unpacked/package application through native Open, Save As, reopen,
  conflict and recovery dialogs.

The implementation and automated contracts for those paths are present, but Stage 5 is accepted only
at the automated boundary until a user-observed Windows hardware and packaged-GUI session records
these gates.

## Residual risks and deferred scope

- The current application controller publishes synthesizer layers only. Stage 4 drum layers remain
  unsupported by the native render-plan projection and their visible commands stay unavailable;
  production drum audio belongs to later scope.
- The manifest detects corruption and wrong packaging but is not a distribution signature. Code
  signing/notarization and installer trust remain release-stage work.
- WASAPI device availability and timing vary by driver and host and still require the manual gate
  above.
- Full beginner-facing persistence presentation remains Stage 7; Stage 5 exposes the secure runtime
  and native dialogs without inventing a new application-owned surface.

## Final lifecycle state

All heavy workflows ran sequentially through the fail-fast lifecycle owner with bounded timeouts and
heartbeats. During the browser smoke, terminating the preview session left an orphaned task-owned
lock after the recorded lifecycle-runner, Vite and esbuild PIDs had already exited. Their exact
identities were checked, only that verified lock was removed, and the subsequent lifecycle audit was
clean. No task-owned process, lock or cleanup quarantine is retained.
