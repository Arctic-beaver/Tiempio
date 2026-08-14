# Note editor interaction evidence

## Acceptance boundary

This evidence covers the user-approved canonical Piano Roll editing plan implemented on
`feature/note-editor-interactions`. It records automated and Web interaction evidence separately
from the remaining packaged Windows acceptance. It does not claim generative ghost suggestions,
multi-note editing or recording the live A-L audition performance into timed notes.

## Implementation map

| Stage                     | Branch                                    | Commit               | Result                                                                                                           |
| ------------------------- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A - commands and history  | `feature/note-editor-command-history`     | `6eedf87`            | Atomic note commands, bounded Undo/Redo, history grouping and physical shortcut contracts                        |
| B - direct manipulation   | `feature/note-editor-direct-manipulation` | `9d8f36d`            | Canonical projection, truthful empty state, exact add/remove, movement, duration and four-point focus affordance |
| C - expression and keys   | `feature/note-editor-expression-and-keys` | `4cb3fd0`            | Symmetric velocity, meter hierarchy, layout-independent keyboard editing and repeat coalescing                   |
| D - shortcut settings     | `feature/keyboard-shortcut-settings`      | `1cad5af`            | Themed remapping UI, conflict/reserved handling, reset and current persistence                                   |
| E - integrated acceptance | `feature/note-editor-acceptance`          | This evidence commit | Short-note hit-zone disambiguation, deferred Settings chunk, final validation and acceptance record              |

## Reproducible automated evidence

The complete lifecycle-owned `npm run check:quick` workflow passed all 19 stages on 2026-08-11:

- formatting, lint, import boundaries, UI-foundation, CSP and package-content policies passed;
- 124 compiled contract tests passed, including note geometry, keyboard editing, command registry,
  physical-key capture, current-only shortcut persistence and bounded ProjectSession history;
- 86 repository-policy tests passed;
- Node and Web typechecks passed;
- Rust format, workspace check, Clippy and all workspace tests passed.

The short-note geometry regression test proves that overlapping 24-by-24 pointer targets resolve to
the nearest visible edge. This preserves generous hit areas without allowing the top/bottom strength
zones to make the left/right duration points unreachable.

Settings are loaded as a deferred feature chunk. The application continues to use the shared
design-system scrollbar and semantic theme treatments. The full-output bundle ceilings were changed
only for the approved feature growth: Web is 475136 bytes and Desktop renderer is 507904 bytes.
The latest Web measurement was 463857 bytes with 357549 initial and 49904 deferred bytes. The latest
Desktop measurement before packaging was 493641 bytes with 387990 initial and 49920 deferred bytes.

## Interactive Web evidence

The production Web build was exercised in the in-app browser at the integrated Stage E revision:

- the Piano Roll rendered only the two canonical project notes and no clickable ghost suggestion;
- double-clicking empty grid space changed the note count from two to three exactly once, and
  double-clicking that note returned it from three to two exactly once;
- dragging the note body changed both its snapped beat and chromatic pitch without creating a note;
- dragging a short note's right point changed duration, and dragging its top point changed strength
  from 96 to 117 while retaining symmetric thickness semantics;
- Arrow Right moved the selected note by one grid step; Ctrl+Z restored the previous beat and
  Ctrl+Shift+Z reapplied it;
- clicking empty grid space hid every one of the four selection points immediately;
- the Settings dialog rendered in Light and Dark themes with grouped keycap controls and shared
  scrollbars; a conflicting Ctrl+2 binding exposed explicit Replace/Cancel, and Ctrl+W was rejected
  as operating-system-reserved;
- no browser console warning or error was observed during the completed smoke path.

## Packaged manual acceptance still required

Automated and browser evidence cannot replace the following Windows packaged checks:

1. Repeat add/remove, body move, both duration edges and both strength points with a real mouse or
   trackpad, including very short and very quiet notes.
2. Repeat keyboard editing and Undo/Redo in English, Russian and another non-Latin/IME layout.
3. Remap and replace one shortcut, restart the packaged application and confirm persistence.
4. Confirm bars, beats, grid and the quiet 4/4 meter remain understandable at the user's display
   scale and window size.
5. Recheck laptop-speaker startup, wired unplug/replug fallback, Bluetooth default switching,
   coexistence with Yandex Music and truthful Play/Pause/playhead behavior.

Phase 6 remains gated until these packaged observations are accepted and no mandatory defect or
definition-of-done item remains.

## Lifecycle record

All resource-intensive commands ran sequentially through the repository lifecycle owner. Two
interactive preview interruptions left stale preview locks only after the exact recorded owner,
Vite and esbuild processes had already exited. Their recorded identities were checked, only the
verified task-owned lock files were removed, and subsequent audits passed with no lock, survivor or
cleanup quarantine. Failed validation and packaging attempts also exited cleanly under the owner.
