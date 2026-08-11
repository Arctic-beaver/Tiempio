# Stage 5 manual-acceptance remediation

## Status and integration boundary

This plan remediates the non-note defects found during the 2026-08-11 packaged Windows acceptance
session. The task integration branch is `fix/phase-5-manual-acceptance`, based on the accepted Stage 5
head plus the user-approved sound-preset label spacing commit.

Stage 6 remains gated. This task does not merge to `main`, push, open a pull request, create a
worktree or modify `.github/workflows`.

## Agreed scope

The task delivers:

- computer-keyboard Bass audition by physical key position in every input layout;
- Windows shared-output negotiation that works with the default compatible endpoint rather than
  requiring one exact requested format;
- bounded automatic recovery when the default output disappears, returns or changes between laptop
  speakers, wired headphones and Bluetooth;
- truthful audio status during reconnection;
- engine-owned Play/Pause presentation and playhead position;
- the already accepted semantic space between sound-preset names and descriptions;
- focused regression coverage, combined validation, a rebuilt unpacked package and updated evidence.

## Explicitly deferred note UX

Note creation, placement, selection, deletion, transposition, editing, ghost-note suggestions,
decorative preview-note replacement and the relationship between visible and audible project notes
are excluded. The user requested a separate product/UX design pass before any implementation in
that area.

The implementation must not change note data, note commands, note hit targets, preview-note
fixtures, the selected-note panel or ghost-note behavior. The only permitted Piano Roll change is
binding the existing playhead to the engine transport clock. Existing note findings remain open and
must not be reported as fixed by this branch.

Scenario 6 recovery UI remains `BLOCKED / NOT ACTIVE` until credible note editing and user-visible
project recovery exist. Stage 5 persistence contracts and automated tests remain intact, but this
task does not invent a Save/recovery presentation.

## Sources and architecture boundaries

- `docs/architecture/TIEMPIO_ARCHITECTURE.md` remains authoritative: the engine owns the real-time
  clock and active device facts, and the callback performs no allocation, blocking or I/O.
- `docs/project-plan/STAGE-5-DESKTOP-RUNTIME.md` remains authoritative for the secure renderer,
  preload, main-process and native-host boundaries.
- `ProjectSession` remains the musical-content authority. This remediation does not mutate its note
  model.
- `ApplicationRuntimeController` translates physical browser input and consumes coalesced engine
  events. It does not invent playback state or audio readiness.
- The native host owns desired audio configuration, active negotiated configuration, endpoint
  recovery and callback lifecycle. Electron supervision continues to own only the host process.
- Desired output and active output remain distinct. Readiness is published only after the new stream
  has produced a callback.
- Recovery remains on the host control thread. Only one negotiation/start attempt can exist at a
  time, each attempt is time-bounded and later attempts use capped backoff driven by existing
  heartbeat commands.

## Expected behavior

### Layout-independent audition

- Physical `A`, `S`, `D`, `F`, `G`, `H`, `J`, `K`, `L` positions produce the same pitches regardless
  of the active language or characters reported by `KeyboardEvent.key`.
- Note release uses the same physical identifier and survives a layout change while the key is held.
- Repeat, modified shortcuts, editable controls, blur, page hide, visibility loss, engine loss and
  disposal cannot leave a held audition voice.

### Shared-output negotiation and recovery

- The host follows the current Windows default shared-output endpoint.
- The endpoint's guaranteed shared/mix configuration is preferred when the exact 48 kHz, stereo,
  512-frame request is unsupported. The engine uses the actually negotiated sample rate.
- Mono and multichannel physical endpoints receive a bounded stereo-to-device mapping without
  changing the logical stereo engine contract.
- When a stream fails, the old handle, real-time queues and voices are released. The latest render
  plan and desired-running intent are retained.
- Health becomes unavailable/reconnecting truthfully, then returns to ready only after a callback on
  the new endpoint.
- If no compatible endpoint exists, the host stays alive, answers heartbeats and retries with capped
  backoff. It does not busy-loop or require an application restart.
- Explicit `stop-audio` cancels recovery and prevents an automatic reopen.

### Transport presentation

- The transport control shows Play while stopped and Pause while the engine reports playback.
- Accessible label, tooltip and pressed state match the same engine snapshot.
- Piano Roll and Arrangement playheads derive their position from the engine tick and the current
  project loop/visible span. Position is clamped and loop wrap is represented.
- Loss of engine/device availability clears the playing state. UI state is never toggled locally.
- Audio reconnect does not silently claim that playback continued; the user can start again after
  readiness returns.

## Implementation stages and branch sequence

### Stage A — contract and acceptance record

Planning record on the required task integration branch: `fix/phase-5-manual-acceptance`.

- Record the reduced scope, manual failures, prototype exceptions and deferred note UX.
- Add focused failing regression cases before behavior changes where practical.
- Keep the existing label-spacing commit in the integration history.

### Stage B — physical audition keys

Branch: `fix/layout-independent-audition`.

- Replace localized character lookup with a typed physical-code map.
- Key held-state and audition identifiers use `KeyboardEvent.code`.
- Extend controller tests for Latin, Cyrillic, Spanish/IME-like key values, layout change during a
  hold, modifiers, repeat and global release paths.

### Stage C — resilient shared output

Branch: `fix/shared-output-recovery`.

- Make backend negotiation prefer a compatible default shared configuration and support physical
  channel counts independently of the stereo engine.
- Add desired-running/configuration state, single-attempt recovery and capped retry scheduling to
  the host controller.
- Clear stale endpoint configuration on failure and renegotiate the current default endpoint.
- Add deterministic fake-backend tests for initial unavailability, format fallback, device loss,
  default change, failed reopen, successful later reopen, latest-plan retention and explicit stop.
- Preserve callback allocation/locking guarantees and bounded protocol output.
- Present the existing audio chip as localized reconnecting while the host reports `starting` or the
  supervisor reports `restarting`.

### Stage D — truthful transport UI

Branch: `fix/truthful-transport-ui`.

- Bind the shared transport button to `ApplicationControllerSnapshot.playing`.
- Bind editor playheads to `ApplicationControllerSnapshot.tick` through a pure, clamped position
  projection.
- Apply the same transport treatment to every equivalent transport and visible playhead surface.
- Add pure projection/controller tests and update visual/accessibility coverage.
- Do not change any note interaction or content.

### Stage E — combined evidence and packaging

Branch: `fix/phase-5-acceptance-verification`.

- Merge completed stages sequentially into the integration branch.
- Run focused checks after each stage, then combined checks and packaging once.
- Update Stage 5 evidence with automated results, the precise unresolved note-UX boundary and the
  hardware checks that still require the user.
- Leave a clean integration branch ready for review, without merging Phase 5 or Phase 6 to `main`.

## Implementation record

| Stage | Branch | Commit | Outcome |
| --- | --- | --- | --- |
| Plan | `fix/phase-5-manual-acceptance` | `e23644d` | Agreed scope, architecture, edge cases, verification and definition of done |
| Physical keys | `fix/layout-independent-audition` | `7eacff6` | `KeyboardEvent.code` mapping with layout-change, IME, modifier and release coverage |
| Shared output | `fix/shared-output-recovery` | `d91f95a` | Compatible mix-format negotiation, default-device following and bounded recovery |
| Transport | `fix/truthful-transport-ui` | `d4eee19` | Engine-owned Play/Pause and tick-derived Piano Roll/Arrangement playheads |
| Verification | `fix/phase-5-acceptance-verification` | `f2ec922` | Initial-no-device and offline-latest-plan recovery coverage |

The earlier `d24cba8` commit supplies the user-approved semantic space between each sound-preset
name and description. No note interaction was changed by any remediation commit.

## Edge cases, failures and compatibility risks

- A layout changes between keydown and keyup, or the reported character is empty/non-Latin.
- AltGr reports `ctrlKey` and `altKey`; it must not trigger an audition.
- A key is held while the window blurs, audio disappears or the controller is disposed.
- The default endpoint is absent, invalidated during negotiation, invalidated during stream start or
  changes again during recovery.
- A laptop, USB or Bluetooth endpoint exposes 44.1 kHz, mono or multichannel mix format and rejects a
  fixed 512-frame request.
- A callback never starts, reports an error immediately or later exceeds the engine's bounded frame
  capacity.
- Heartbeats continue during unavailable audio; a recovery attempt must not become a host-process
  hang or supervisor restart loop.
- Multiple heartbeat commands arrive while a retry is in progress. The single host control thread
  and retry deadline must prevent concurrent attempts.
- The latest render plan changes while audio is unavailable. Reopen must prepare only the newest
  retained plan at the new sample rate.
- A transport snapshot from an older project revision cannot move the current UI.
- Loop length is invalid or tick is outside the visible range; the playhead remains finite and
  clamped.
- Dynamic Play/Pause and reconnecting labels can differ from locked prototype pixels. These are
  narrow user-requested truthfulness exceptions and must be documented without changing layout,
  typography or control geometry.
- Existing saved projects, protocol framing, Web target boundaries and controlled null-audio checks
  must remain compatible.

## Verification strategy

All resource-intensive workflows run sequentially through the repository lifecycle owner. Every
stage has bounded timeouts, heartbeat output, signal handling, exact task-owned cleanup and a
single-run lock. The required post-commit lifecycle audit runs before any following check, branch,
commit or merge.

Focused verification:

- compiled TypeScript controller/projection tests;
- Rust native-host backend, controller and callback tests;
- protocol/contract validation where health behavior changes;
- target-boundary, formatting and diff checks;
- full application Light/Dark visual/accessibility matrix for transport/audio-chip changes.

Combined verification, in order:

1. `npm run check:audio`;
2. `npm run check:visual-a11y`;
3. `npm run check:quick`;
4. `npm run package:check`.

Completed on 2026-08-11:

- `npm run check:audio` — passed release build, staging and controlled self-test;
- `npm run check:visual-a11y` — passed all four stages;
- `npm run check:quick` — passed all 19 stages, including 103 compiled tests, 86 policy tests and 14
  native-host tests;
- `npm run package:check` — passed all 11 stages and rebuilt the verified Windows x64 unpacked
  package;
- `npm run check:bundle-size` and `npm run check:chunk-topology` — passed on the final artifacts.

The unpacked application must be closed before package replacement. Final manual acceptance uses
the rebuilt package and covers launch/single instance, EN/RU/ES physical keys, laptop speakers at
launch, wired unplug/replug with speaker fallback, Bluetooth default selection, Yandex Music
coexistence, Play/Pause truth and moving/wrapping playheads. Note and recovery scenarios remain
explicitly outside this run.

## Definition of done

- The same physical audition keys work independently of input language and release safely.
- A valid default laptop, wired or Bluetooth output can open using its compatible shared format.
- Device loss/default change recovers without restarting Tiempio, with no busy loop, stale endpoint
  or stuck voice.
- Audio readiness and reconnection status are truthful and localized.
- Play/Pause and playhead positions follow current, revision-valid engine snapshots.
- No note creation/editing/selection behavior was changed or claimed.
- The approved preset-description space is present and its prototype exception remains documented.
- Focused, audio, visual/accessibility, quick and package checks pass under lifecycle ownership.
- Manual hardware outcomes are recorded honestly; unresolved hardware or note-UX gates remain open.
- The integration branch is clean, contains focused English commits, has no task-owned process,
  lifecycle lock or quarantine, and is not merged to `main`.

## Completion audit

The implementation and automated definition of done are complete. Physical-key behavior,
compatible-device negotiation, unavailable-at-start recovery, active default-device changes,
stream-loss recovery, capped retry, explicit-stop cancellation and transport projection all have
passing automated coverage. The final unpacked executable is available at
`artifacts/packages/win-unpacked/Tiempio.exe`.

Manual Windows hardware acceptance is deliberately still pending against that rebuilt package. It
must confirm laptop-speaker startup, wired unplug/replug fallback, Bluetooth default selection,
coexistence with an independent player, layout-independent physical keys, and visible Play/Pause
plus moving/wrapping playheads. This pending hardware observation is not reported as an automated
failure and is not replaced by fabricated evidence.

A manual output-device picker is a separate product decision. Automatic following of the Windows
default output is implemented here. An application-owned output override may be designed later;
input selection is deferred until Tiempio has a real recording/input workflow, so the current UI
does not expose a non-functional selector.

All note UX findings and Scenario 6 remain `BLOCKED / NOT ACTIVE` by explicit user decision. Stage 6
therefore remains gated until the separate note UX work and the remaining manual hardware checks are
accepted.
