# Stage 7B focus-safe audition evidence

## Result

**Recorded:** 2026-08-14  
**Integration branch:** `feature/stage-7`  
**Implementation branch:** `fix/sound-chooser-focus-audition`  
**Status:** complete and accepted for integration into Stage 7.

Fine Tuning range controls and physical audition now compose without refocusing the Sound Chooser.
Mapped physical codes pass through a focused range, native range-adjustment keys remain owned by the
browser, unrelated musical key releases cannot commit the slider, and note-off follows the exact
source accepted at note-on.

## Architecture and implementation

- The performance-input boundary now owns a pure semantic target classifier with explicit
  `text-editing`, `range-adjustment`, `action-control`, `performance-surface` and
  `modal-or-capture` results. Unknown input types fail closed; text/combobox/contenteditable,
  capture and modal targets block audition unless a modal explicitly delegates performance input.
- Keydown routes only a mapped physical `KeyboardEvent.code` and prevents default only after the
  performance session accepts it. Keyup releases the source captured at note-on without rechecking
  the current focus target, so focus movement cannot strand a voice.
- `SemanticSliderGesture` is the shared bounded pointer/keyboard state machine. It tracks the
  committed value, preview value, dirty state and active gesture; pointer, adjustment-key and blur
  boundaries converge on one idempotent commit. Musical keyup is not a terminal boundary.
- Escape and pointer cancellation restore the committed value. Every existing slider consumer was
  audited and now clears or restores its local preview, including Sound Chooser, Sound Sculpt,
  Drums density/swing, Context gain and metronome volume.
- Fine Tuning preview is compiled only at the engine wire-plan boundary. The canonical project and
  history remain unchanged during movement; rapid variants coalesce through the existing plan
  drain. A performance note waits behind the latest accepted plan send.
- Pending note-on owns a cancellable audition record. A key released while its plan is still pending
  cancels the note; a release racing an accepted note-on sends the matching note-off afterward.
- Ordinary macro publication no longer calls broad `releaseAll()`. Preset, pitch mapping, sound
  ownership, window/visibility loss, engine failure and lifecycle boundaries retain explicit
  release behavior.
- The previously referenced but undefined shared `--ti-focus-ring` token is now defined. Ranges use
  it in light and dark themes and expose an explicit forced-colors outline without removing focus.

## Automated gates

All resource-intensive commands ran sequentially through the repository lifecycle owner. Every run
was followed by an exact process/lock audit.

| Gate | Result |
| --- | --- |
| `npm test` | PASS: 213 compiled contract/unit tests and 96 repository-policy tests |
| `npm run lint` | PASS |
| `npm run typecheck:web` | PASS |
| `npm run check:visual-a11y` | PASS: shared UI policy, Web typecheck, production Web build and CSP |

Focused coverage proves semantic target classification, unknown-input fail-closed behavior, range
versus text ownership, explicit modal delegation, independent chords/repeat guards, focus-independent
keyup release, pointer/keyboard/blur deduplication, no-op and cancel behavior, preview patch
compilation, pending-plan note cancellation and held-note survival across an ordinary macro commit.
The existing Desktop audio integration continues to route real physical and pointer note-on/off
through the native host.

## Production Web acceptance

The production artifact was served at `http://127.0.0.1:4173` and exercised in the Codex in-app
Chromium surface.

- All four Fine Tuning controls remained labelled native ranges. A focused range retained focus and
  its value while `KeyA` was pressed; no Undo entry appeared from the musical key.
- Computed focus presentation used the application token rather than a user-agent outline:
  `rgb(121, 185, 255) 0 0 0 2.56px` in dark and
  `rgb(41, 111, 187) 0 0 0 2.56px` in light, with the native outline disabled only because the
  equivalent token ring was present.
- Dark, light and 1000 x 500 constrained-height presentations kept the four Fine Tuning ranges
  visible, readable and operable. The production console warning/error capture was empty.
- The local Web preview had no usable audio engine, so no perceptual listening claim is made. The
  deterministic runtime test supplies the plan ordering, updated patch and exact note-on/off
  evidence; human speaker monitoring remains a release-environment activity.

## Resource ownership

The production preview ran through the bounded `preview:web` lifecycle owner. As in the Stage 7A
acceptance run, terminating the outer execution cell left its recorded owner/Vite/esbuild tree
alive. PID, creation time, command line and parent chain were matched to the lock before exactly
those three task-owned processes were stopped. The orphaned lock was removed only after their
absence was confirmed, and `npm run lifecycle:audit` then reported no recorded process, lock or
quarantine.

## Definition of done

Stage 7B is accepted when mapped audition works through a focused range, native range keys retain
ownership, one dirty gesture creates at most one commit, text/modal/capture contexts remain
protected, macro preview reaches the next note without a stale-plan race, source-owned release is
lossless, and accessible themed focus survives Desktop/Web styling. The implementation, automated
gates and production-browser evidence above satisfy those criteria.
