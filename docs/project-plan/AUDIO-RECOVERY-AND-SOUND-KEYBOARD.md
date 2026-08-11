# Audio recovery and Sound Chooser keyboard remediation

## Status and integration boundary

This plan records the four defects and interaction changes reported from the packaged Windows
application on 2026-08-11:

1. connecting wired headphones caused audio to remain on `Connecting audio`; after restarting with
   and without the headphones, audio remained unavailable;
2. the Sound Chooser's bottom keyboard drifted from the approved first prototype into a large card
   with oversized keys, legend, rotation and octave controls inside the keyboard surface.
3. `Use sound` incorrectly opens a separate, oversized Song Palette screen; scale and octave should
   instead be configured for each selected pitched instrument inside the Sound Chooser dock, while
   `Use sound` should continue directly to the editor as it did originally;
4. the central transport capsule containing play/pause, tempo, swing and meter is visually too tall.

The task integration branch is `feature/note-editor-acceptance`. Implementation uses sequential
stage branches and does not merge to `main`, push, create a pull request, create another worktree or
modify `.github/workflows`.

Read-only inspection of the reported running package found the Electron main, renderer, GPU and
network processes, but no `tiempio-engine-native-host.exe`. The UI still showed `Connecting audio`.
This proves a stale lifecycle presentation: `EngineHostSupervisor.connect()` publishes `starting`
before launch, but its launch-failure path returns an error without publishing terminal `failed`
health. The current automatic host restart also restores the handshake and latest render plan only;
it does not replay the requested audio configuration, desired running state or metronome settings.

The keyboard UI target is the retained light prototype reference
`docs/evidence/prototype-visual-reference/light/03-sound-chooser.png`: a quiet keyboard strip at the
bottom of Sound Chooser. The restored strip contains only the seven real compact palette keys; it
does not recreate the prototype's unused blank filler keys.

The inline setup uses a two-view content switcher in the same dock rather than a modal or another
route. This follows the Carbon content-switcher guidance for mutually exclusive related content and
the WAI-ARIA Tabs pattern for an accessible vertical side control:

- <https://carbondesignsystem.com/components/content-switcher/usage/>
- <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>

## Expected behavior

### Audio lifecycle

- A native-host launch failure leaves `starting` within the bounded startup deadline and publishes
  a terminal unavailable state with an actionable retry.
- A native-host crash or forced heartbeat recovery replays the latest accepted handshake, audio
  configuration, render plan, metronome state and desired audio-running intent in safe order.
- Windows default-output transitions receive a bounded grace period appropriate for device
  teardown and WASAPI renegotiation without weakening exact owned-process cleanup.
- Retrying audio does not reload the project, duplicate runtime subscriptions, create more than one
  native host or lose the latest project revision.
- UI never presents `Connecting audio` indefinitely after the host has exited or startup failed.
- Held notes, previews, playback presentation and meter state clear while audio is unavailable.

### Sound Chooser keyboard and per-instrument mapping

- Sound Chooser uses a low, edge-to-edge keyboard strip visually aligned with the original
  prototype rather than the standard bordered performance card.
- The strip renders exactly seven real compact palette keys with no blank filler keys.
- A small vertical two-button switcher beside the dock swaps between `Keys` and `Scale` views in the
  same footprint; it never opens a modal or navigates to a separate setup route.
- The `Scale` view exposes a compact root-note selector, Major/Minor mode control and bounded octave
  control. The `Keys` view remains the visual subject and previews the resulting seven mappings.
- Scale/root and octave are selected and persisted for every pitched instrument, whenever its sound
  is selected, so its physical keys keep a stable, explicit meaning.
- `Use sound` commits the sound and its mapping as one undoable user intent and navigates directly
  to the next editor screen; it does not visit Song Palette setup.
- Pitch, physical-key and tonic/held semantics remain truthful and accessible.
- Existing full performance surfaces continue using the standard/full performance treatment.
- Light, Dark, forced-colors, narrow width and constrained height retain usable focus and pointer
  targets without document overflow.

### Compact transport capsule

- The central transport capsule is visibly shorter and uses tighter internal spacing while retaining
  the existing controls and hierarchy.
- Play/pause, previous/next and other interactive targets remain comfortably clickable and
  keyboard-focusable; visual compactness must not come from shrinking hit areas below the shared
  control-size floor.
- Tempo, swing and meter labels remain readable without wrapping at the supported desktop width.

## Architecture boundaries to preserve

- `ApplicationRuntimeController` remains the renderer-facing owner of engine readiness and retry.
- `EngineHostSupervisor` owns only the exact child it launched and keeps bounded startup,
  heartbeat, shutdown and cleanup deadlines.
- Desired runtime state retained for restart is bounded and contains no raw audio or project file
  authority.
- The native host remains the owner of device negotiation, audio recovery and audio-clock state.
- Shared application code does not import Desktop main/preload or native filesystem APIs.
- Performance input still uses one source-counted session and releases all sources before octave,
  rotation or engine-state changes.
- The restored strip reuses the shared performance component rather than introducing a second
  keyboard implementation.
- Per-instrument mapping is persisted on pitched layer sources and migrated from older projects with
  deterministic defaults; transport-wide key data remains readable for backward compatibility.
- Sound selection plus mapping is one domain command, so undo/redo cannot leave the instrument and
  its keyboard meaning out of sync.
- The compact transport continues using shared shell and design-system tokens rather than a
  page-local style override.

## Implementation stages

### Stage A — resilient audio lifecycle

Branch: `fix/audio-host-recovery`.

- Publish terminal failed health when bootstrap/spawn/handshake startup fails.
- Retain and replay bounded accepted runtime intent after an automatic native-host restart:
  configure audio, latest render plan, metronome enabled/volume and start audio.
- Keep replay ordering deterministic and clear retained intent on renderer disconnect.
- Use a device-transition-safe but bounded heartbeat failure window.
- Add an application-owned `retryAudio()` path that disconnects a stale client session, removes old
  listeners, reconnects once and reinitializes the latest project state.
- Make the unavailable audio chip an explicit retry action and expose a localized truthful state.
- Add supervisor and application-controller regression tests for launch failure, restart replay,
  retry, duplicate-listener prevention and current-project preservation.

### Stage B — inline per-instrument scale setup and prototype keyboard

Branch: `fix/sound-chooser-keyboard-strip`.

- Extend the pitched-layer project model with a persisted root/mode and octave mapping, including
  migration, validation, fixtures and serialization coverage.
- Add one atomic sound-and-mapping command and retain the legacy character-selection command for
  compatible history/project replay.
- Add a shared compact-strip presentation to `PerformanceKeyboard` while preserving its input
  architecture and source-counted release behavior.
- Restore the prototype's narrow white-key proportions, restrained held state and bottom-aligned
  labels for exactly seven keys.
- Add an accessible vertical `Keys` / `Scale` switcher to the side of the same lower dock, with
  Arrow Up/Down navigation and linked tab panels.
- Build the compact inline root-note, Major/Minor and octave controls; update the seven-key preview
  immediately and release active notes before remapping.
- Make `Use sound` save the chosen sound and mapping, then navigate directly to the editor without
  the separate Song Palette onboarding screen.
- Use the selected layer's persisted mapping in the editor/performance input path.
- Add domain, migration, action, keyboard and accessibility coverage for per-instrument persistence,
  direct navigation, seven real keys, focus behavior and the absence of filler keys.

### Stage C — compact transport capsule

Branch: `fix/compact-transport-bar`.

- Reduce the central transport capsule's visual height and internal vertical padding.
- Tighten separators, icon circles and text layout without removing information or reducing the
  effective target size below the shared interaction floor.
- Verify focus rings, hover/pressed/disabled states, localization widths, Light/Dark themes and the
  supported minimum desktop width.
- Add or update shell layout policy coverage for the compact dimensions.

### Stage D — integrated acceptance and package

Branch: `fix/audio-keyboard-acceptance`.

- Merge the completed stages sequentially into the task integration branch.
- Run focused TypeScript tests after each TypeScript stage and focused native checks after audio
  changes.
- Run the sequential lifecycle-owned quick, audio and package gates once on the combined result.
- Rebuild the Windows x64 unpacked package.
- Inspect the Sound Chooser in Light/Dark and constrained viewports.
- Retain an honest manual checklist for laptop speakers, wired headphones, unplug/replug, restart,
  independent-player coexistence and the retry action.

## Edge cases and compatibility risks

- The host can fail before bootstrap, during handshake, after the plan is accepted or while audio is
  already running.
- A second failure can arrive while the first exact-child cleanup or automatic restart is in
  progress; only one restart path may own the child.
- A renderer retry can race an automatic supervisor restart or application close.
- Retained start intent without retained configuration would create another endless recovery loop.
- Replaying `start-audio` before the current plan and metronome settings could produce stale or
  briefly incorrect output.
- A missing default output must remain retryable without an unbounded busy loop.
- WASAPI device teardown can exceed the old five-second heartbeat window during wired/Bluetooth
  changes; the new window remains explicit and bounded.
- Retry subscriptions can duplicate health/events unless the previous application-side listeners
  are removed first.
- Older project documents do not contain per-instrument mapping and must receive stable defaults
  without corrupting their transport-wide key or changing unrelated serialized data.
- Undo/redo during sound setup must restore sound and mapping together.
- Switching the dock view or changing root/mode/octave with held pointer, keyboard or MIDI input must
  release all sources and must not leave a stuck note.
- Non-pitched layers must not expose or require scale controls.
- Changing the shared keyboard styles globally could regress the palette dialog or full Q–P/A–L/Z–M
  surface; the strip must be an explicit variant.
- Seven narrow keys must remain pointer-usable at compact widths while preserving the original
  visual rhythm at normal desktop width.
- Moving visible controls must retain focus order, localized labels, Arrow Up/Down octave behavior
  and release-all semantics.
- A taller localized transport label must not restore the old capsule height or wrap into a second
  line; constrained width may reduce spacing but not hide essential controls.

## Verification strategy

- Supervisor tests prove startup failure publishes `failed`, restart replay order is exact, only one
  replacement host exists and cleanup remains exact.
- Application controller tests prove retry from both disconnected startup failure and stale ready
  sessions, with one listener set and the latest project render plan.
- Existing native-host recovery tests continue to cover initially unavailable output, device loss,
  default-device changes, capped retry and no stuck voices.
- Project-model and migration tests prove each pitched instrument round-trips its own root/mode and
  octave, with deterministic defaults for old projects and atomic undo/redo.
- Sound Chooser action tests prove `Use sound` commits the sound/mapping once and proceeds directly
  to the editor without the Song Palette route.
- Keyboard tests and UI policy checks prove exactly seven compact strip mappings, no filler keys,
  accessible same-space view switching and no regression in standard/full layouts.
- Shell policy and browser checks prove the transport is shorter while hit targets, focus states and
  localized labels remain usable.
- Browser interaction checks compare the restored Sound Chooser against the retained prototype in
  Light/Dark and constrained sizes.
- Final packaged manual checks exercise speaker startup, plug, unplug, restart and explicit retry on
  the user's real Windows audio devices.

## Definition of done

- `Connecting audio` cannot survive a terminal host launch/restart failure.
- A successful automatic restart or explicit retry restores audio against the latest project
  revision without restarting Tiempio.
- Default-output transitions remain bounded, truthful and free of orphaned native hosts.
- Every pitched instrument persists its own root/mode and octave, including migrated older projects.
- Sound Chooser again presents a simple seven-key bottom strip; its side switcher reveals inline
  scale/octave setup in the same dock, and `Use sound` proceeds directly to the editor.
- The central transport capsule is visibly shorter without losing controls, readable values or
  accessible pointer/keyboard targets.
- Other performance and shell surfaces do not visually regress.
- Focused, quick, audio and package checks pass under the lifecycle owner.
- The rebuilt Windows package is available for the user's speaker/headphone acceptance.
- The integration branch is clean and ready for review without merge to `main`, push or PR.
