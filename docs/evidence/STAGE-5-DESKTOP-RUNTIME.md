# Stage 5 Desktop runtime evidence

## Acceptance boundary

Stage 5 implements the secure Electron runtime, physical project persistence, supervised Rust
engine host, shared-output adapter, existing-command integration and architecture-bound packaging.
This evidence distinguishes reproducible automated results from acceptance that still requires a
real Windows audio device or interactive packaged application.

The prototype remains the visual authority. The original Stage 5 delivery changed no stylesheet,
design token, typography, spacing, application geometry, reference PNG or
`docs/tiempio_ux_prototype.html`. The 2026-08-11 acceptance remediation adds only two reviewed
truthfulness exceptions: a semantic space between preset name and description, and engine-driven
Play/Pause plus playhead positions. Reference assets remain locked and unchanged.

## Implementation map

| Delivery stage              | Branch                                 | Commit               | Result                                                                          |
| --------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| A — contracts and lifecycle | `feature/desktop-contracts-lifecycle`  | `02af779`            | Current runtime/protocol, closed IPC and lifecycle-owned workflows              |
| B — native persistence      | `feature/desktop-native-persistence`   | `823cd90`            | Opaque handles, bounded ZIP, atomic/fingerprint saves, recovery and settings    |
| C — native shared audio     | `feature/native-shared-audio-host`     | `f8e8144`            | Framed Rust host, CPAL shared output, Deep Bass callback and controlled backend |
| D — engine supervision      | `feature/desktop-engine-supervision`   | `3219215`            | Verified child ownership, restart, coalescing and typed preload bridge          |
| E — runtime integration     | `feature/desktop-runtime-integration`  | `3f8ca71`            | One controller, project/engine coordination and truthful existing UI states     |
| F — packaging and evidence  | `feature/desktop-runtime-verification` | This evidence commit | Exact native resources, fuses, target separation and acceptance record          |
| Acceptance — physical keys  | `fix/layout-independent-audition`      | `7eacff6`            | Physical-code audition across layouts with safe held-key release                |
| Acceptance — shared output  | `fix/shared-output-recovery`           | `d91f95a`            | Mix-format negotiation, default-device following and bounded reopen             |
| Acceptance — transport      | `fix/truthful-transport-ui`            | `d4eee19`            | Engine-owned Play/Pause and tick-derived editor playheads                       |
| Acceptance — verification   | `fix/phase-5-acceptance-verification`  | `f2ec922`            | Initially unavailable output and offline latest-plan regression coverage        |

## Reproducible automated evidence

### Runtime, persistence and supervision

- Compiled unit/contract suite: 103 passing tests.
- Policy suite: 86 passing tests after adding package-integrity coverage.
- Persistence tests exercise physical create/open/save/reopen, Save As/Copy, external fingerprint
  conflict, strict current-only rejection, recovery, settings and injected write failures in
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
| Bytes      | `966656`                                                                  |
| SHA-256    | `sha256:0495680B54F74FA2F6D2F94DB3E7FF5CFB053E96026986278ED9F6906DA84724` |

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
| Desktop renderer |         458198 |        491520 |
| Web              |         427878 |        458752 |

Desktop renderer attribution reported 373215 initial bytes and 35551 deferred bytes. Web reported
342774 initial bytes and 35539 deferred bytes. The Web graph contains the neutral
`ApplicationController` contract, but contains neither `EngineClient` nor the concrete
`ApplicationRuntimeController`; Electron, native backend and filesystem tokens remain forbidden.

### Prototype and UI preservation

- Prototype SHA-256 remains
  `C1A69E43635C7A41791A9179F5D1B0A176FEBDEB9E1F76A2BC2B109047F4990A`.
- All 14 retained Light/Dark reference hashes remain locked by policy.
- On 2026-08-11 the user approved one narrow production-only legibility exception: sound-preset
  names and their descriptions now contain one semantic word space. The prototype HTML and retained
  reference PNGs intentionally remain unchanged and still show the previously joined labels. No
  mask, typography, control geometry or broader spacing treatment is changed by this exception.
- The same acceptance session approved a second narrow truthfulness exception: the transport icon
  now changes between Play and Pause from the engine snapshot, and the Piano Roll/Arrangement
  playheads use the engine tick instead of fixed prototype percentages. Layout, control geometry and
  note visuals remain unchanged.
- Production browser smoke covered Home, first-layer creation, sound chooser, the shared settings
  dropdown and unavailable-Web audio state at 1280×720, 1024×640 and 1600×900.
- Both Light and Dark presentation rendered with the application-owned dropdown and existing
  disabled/audio-status states. No browser console warning or error was observed.
- At 1024×640 the fixed prototype-preserving chooser composition clips the bottom of the keyboard
  preview while its primary action and physical-key audition remain available. Stage 5 deliberately
  made no geometry or overflow change; this inherited constrained-height behavior remains a UI
  follow-up only if the prototype authority is explicitly revised.

## Manual acceptance gates not claimed

The 2026-08-11 user session established these physical observations on the pre-remediation package:

- the unpacked app launched and a second click did not create another window;
- Yandex Music and Tiempio were audible together through wired headphones;
- physical audition worked in an English layout;
- unplugging wired headphones left audio unavailable instead of falling back to speakers;
- Cyrillic input did not trigger the same physical audition keys;
- Play did not expose a Pause state and the editor playhead did not move;
- note/ghost interactions were confusing, and the user first deferred that UX before approving the
  separate note-editor interaction plan.

The first three observations are accepted evidence. The latter observations created the remediation
and note-editor plans. The rebuilt package now requires a focused manual rerun; controlled tests and
package inspection cannot honestly establish these remaining hardware/interactive results:

- the same physical A–L positions in Russian, Spanish or another non-Latin layout;
- audio through laptop speakers when Tiempio starts without headphones;
- wired-headphone unplug fallback to speakers and replug return without restarting Tiempio;
- Bluetooth selection as the Windows default while the previous endpoint still exists;
- continued coexistence with Yandex Music after those endpoint changes;
- visible Play/Pause state and moving/wrapping Piano Roll and Arrangement playheads.

The implementation and automated contracts for those paths are present, but remediation is accepted
only at the automated boundary until a user-observed Windows hardware and packaged-GUI session
records these gates. Note interaction was subsequently activated and implemented under
`STAGE-9A-NOTE-EDITOR-INTERACTIONS.md`; its retained evidence is recorded separately.

## Residual risks and deferred scope

- The current application controller publishes synthesizer layers only. Stage 4 drum layers remain
  unsupported by the native render-plan projection and their visible commands stay unavailable;
  production drum audio belongs to later scope.
- The manifest detects corruption and wrong packaging but is not a distribution signature. Code
  signing/notarization and installer trust remain release-stage work.
- WASAPI device availability and timing vary by driver and host and still require the manual gate
  above.
- Tiempio follows the Windows default output automatically. A manual application-owned output picker
  is deferred product UX; an input picker is intentionally absent until a recording/input workflow
  exists.
- Canonical note creation, placement, selection, deletion, movement, duration and strength editing
  are implemented under `STAGE-9A-NOTE-EDITOR-INTERACTIONS.md`. Generative ghost suggestions, multi-note
  selection and recording live A-L audition into timed notes remain deferred product scope.
- Full beginner-facing persistence presentation remains Stage 7; Stage 5 exposes the secure runtime
  and native dialogs without inventing a new application-owned surface.

## Final lifecycle state

All heavy workflows ran sequentially through the fail-fast lifecycle owner with bounded timeouts and
heartbeats. During the browser smoke, terminating the preview session left an orphaned task-owned
lock after the recorded lifecycle-runner, Vite and esbuild PIDs had already exited. Their exact
identities were checked, only that verified lock was removed, and the subsequent lifecycle audit was
clean. No task-owned process, lock or cleanup quarantine is retained.

For the 2026-08-11 remediation, `check:audio`, `check:visual-a11y`, `check:quick`,
`package:check`, `check:bundle-size` and `check:chunk-topology` all passed sequentially through the
same lifecycle owner. The final package is
`artifacts/packages/win-unpacked/Tiempio.exe`; its packaged native manifest exactly matches the
staged `win32-x64` manifest above. No slowdown or excessive-resource incident occurred.
