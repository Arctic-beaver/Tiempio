# Stage 7B — focus-safe Sound Chooser audition

## Status and authority

**Status:** user-approved bug-fix direction and implementation plan, 2026-08-13.

This is the second mandatory gate after Stage 6 acceptance, following
[`STAGE-7A-CONTEXTUAL-BRICK-CREATION.md`](STAGE-7A-CONTEXTUAL-BRICK-CREATION.md), and before
Stage 9 performance-recording work or Stage 10 linked-bricks composition. It fixes the shared
keyboard-intent and slider-gesture foundations that both later features depend on. Draft Sound
Chooser audition created by the preceding gate uses the same focus-safe routing.

The visual authority remains:

- [Sound Chooser light](../evidence/prototype-visual-reference/light/03-sound-chooser.png);
- [Sound Chooser dark](../evidence/prototype-visual-reference/dark/03-sound-chooser.png);
- the keyboard and scale treatment shown in the same references.

The user-supplied red-box screenshots document the defect but are not new visual baselines. The fix
must preserve the approved Sound Chooser geometry and use the application design system for focus
appearance.

## Reported defect

Current sequence:

1. open Sound Chooser and move any `Fine tuning` range slider;
2. leave focus on that slider;
3. press one of the mapped performance keys `A S D F G H J`;
4. the slider receives a browser-blue focus outline, but the selected sound does not play;
5. audition works only after the user clicks back into the central surface.

This breaks the primary purpose of Fine Tuning: change a semantic macro and immediately hear the
result. It also teaches an invisible focus rule that would make the future recording keyboard feel
unreliable.

## Confirmed implementation cause

The failure is not an audio-engine problem.

- Sound Chooser already mounts the performance keyboard with document-level capture.
- The shared performance-input filter currently treats every HTML `input` as text editing.
  `input[type="range"]` is therefore rejected together with text fields, even though mapped letter
  codes do not edit a native range.
- The shared `SemanticSlider` invokes its commit handler on every `keyup`. Releasing an unrelated
  musical key while a slider is focused can therefore finish a slider gesture and trigger cleanup
  even though the slider value did not change.
- The visible blue rectangle is the unthemed browser focus treatment. Focus itself is necessary for
  accessibility; only its inconsistent presentation and input routing are wrong.

The correction belongs in shared input intent and shared slider semantics, not in a Sound Chooser
click-to-refocus workaround.

## AS-TO-BE interaction contract

### Audition scope

While Sound Chooser is the active application surface, physical performance keys audition the
currently selected sound from any non-text, non-modal control in that surface. Moving focus back to
the center is never required.

For a focused Fine Tuning slider:

- `KeyA`, `KeyS`, `KeyD`, `KeyF`, `KeyG`, `KeyH` and `KeyJ` start the mapped note;
- the matching physical-key release stops that exact held note even if focus moved meanwhile;
- the note uses the latest selected sound and latest accepted Fine Tuning values;
- pressing or releasing a musical key does not move the slider, commit it again or steal focus;
- several held performance keys remain valid as a chord;
- ordinary repeat, modifier and composition guards still prevent duplicate or accidental notes.

The screen remains audition-only. No event played before `Use sound` creates a source note or a
recording pass.

### Native slider ownership

A focused range slider retains its expected native and accessible controls:

- Arrow keys adjust by the configured step;
- Home and End move to the minimum and maximum;
- Page Up and Page Down retain the platform/browser range behavior when supported;
- Tab and Shift+Tab move focus normally;
- assistive technology continues to see a labelled range with current value and bounds.

Those range-editing keys do not play notes. Only accepted physical performance codes are routed to
audition. The policy is based on `KeyboardEvent.code`, so a changed character layout does not make
the physical performance surface drift.

### Controls that still suppress audition

Musical keys are not global application hotkeys. Audition remains blocked while the active target
is:

- a text, search, number, email, password or other character-editing input;
- a `textarea`, editable combobox or `contenteditable` surface;
- a shortcut-remapping capture control;
- an open modal/dialog that does not explicitly own the performance surface;
- an IME composition sequence;
- a control whose documented key contract explicitly reserves the same physical code.

The decision uses semantic target capability and active-surface ownership, not `tagName === INPUT`.
New input types must fail closed until classified.

### Focus appearance

Focus remains on the Fine Tuning slider and remains visible. The design system replaces the
browser-blue outline with the same semantic `focus-visible` treatment used by other application
controls:

- token-derived color, offset and contrast in both light and dark themes;
- no outline merely from pointer interaction when `:focus-visible` does not apply;
- a clear indicator for keyboard navigation and high-contrast modes;
- no component-local hard-coded blue and no removal of focus without an equivalent indicator.

### Fine Tuning preview and commit

Fine Tuning keeps the established preview/commit model:

- pointer movement publishes bounded ephemeral sound preview values;
- an actual pointer gesture commits once on its terminal boundary;
- a native slider keyboard adjustment previews and commits once for that adjustment sequence;
- blur is a fallback commit only when an uncommitted value exists;
- an unrelated musical `keyup` never commits a slider;
- pointer-up followed by blur never produces two project commands;
- cancel restores the last committed value and engine plan.

After a macro value is accepted, the next audition note must use it without a silent intermediate
state. A macro commit must not call broad performance `releaseAll()` merely because focus stays on
the slider. Operations that really replace pitch mapping or sound ownership may still release held
sources explicitly.

## Shared architecture

### Keyboard intent classifier

The performance-input package owns a pure target classifier and routing decision. The result must
distinguish at least:

- `text-editing` — performance routing prohibited;
- `range-adjustment` — native range keys reserved, mapped performance codes allowed;
- `action-control` — activation keys reserved, mapped performance codes allowed;
- `performance-surface` — mapped performance codes allowed;
- `modal-or-capture` — routing prohibited unless explicitly delegated.

The active performance surface registers its accepted physical codes and lifecycle. The document
listener calls `preventDefault()` only after a mapped code has been accepted as a performance
event. `keyup` ownership is tied to the source ID captured at note-on, not reevaluated only from the
current focused element.

This classifier is application-owned infrastructure. Sound Chooser uses it for audition; the
source editor later reuses it for live audition and recording without defining a second focus rule.

### SemanticSlider gesture state

The shared design-system slider tracks a bounded gesture state such as:

- committed value;
- current preview value;
- whether this pointer or keyboard gesture actually changed the value;
- whether its pending change has already been committed.

`onCommit` is emitted once only for a dirty gesture. Supported native range-editing keydowns may
mark the keyboard gesture dirty; arbitrary keyups may not. Pointer, blur and keyboard terminal
events converge on the same idempotent commit path.

This is a design-system correction and must be audited on every current `SemanticSlider` consumer,
not patched by adding a Sound Chooser-only event handler.

### Engine and render-plan hand-off

No new audio protocol is required for this bug, but the implementation must preserve these
invariants:

- preview and committed macro values are revision-bound;
- an accepted note-on resolves against the newest valid preview/committed patch;
- a pending render-plan acknowledgement cannot temporarily restore an older patch or suppress the
  immediate next note;
- stale preview acknowledgements cannot overwrite the committed macro;
- note-off always reaches the voice/source created by its note-on.

## Implementation stage

### Stage 7B — focus-safe Sound Chooser audition

**Suggested branch:** `fix/sound-chooser-focus-audition`.

1. Replace the blanket editable-target check with the shared semantic focus-target classifier.
2. Route mapped performance codes through a focused `range` while reserving native range-editing
   keys and all true text-entry/modal contexts.
3. Bind note release to accepted note-on ownership so focus changes cannot leave a held voice.
4. Make `SemanticSlider` commit only dirty slider gestures and deduplicate pointer/keyboard/blur
   terminal events.
5. Remove broad note release from ordinary Fine Tuning commits; keep explicit release for real
   sound/mapping replacement boundaries.
6. Apply the design-system `focus-visible` treatment to range controls and audit every current
   slider consumer in light, dark, constrained-height and high-contrast states.
7. Add focused unit, component and target integration tests before beginning recording work.

No Stage 7 source/instance schema, recording UI or song timeline belongs in this branch.

## Verification matrix

| Boundary | Required evidence |
| --- | --- |
| Target classification | Range differs from text input; unknown editable inputs fail closed |
| Musical key on range | `KeyA` note-on/off occurs exactly once while the focused slider value and focus remain unchanged |
| Slider key ownership | Arrows/Home/End adjust the range and commit once without audition |
| Gesture commit | Pointer-up plus blur deduplicates; unrelated `keyup` never commits |
| Updated sound | The first note after a Fine Tuning change uses the new macro value and is audible |
| Held-note lifecycle | Focus movement, blur, visibility loss and unmount release only owned held notes safely |
| Chords/repeat | Several physical keys remain independent; key repeat does not duplicate note-on |
| Protected editing | Text inputs, editable comboboxes, contenteditable, dialogs and IME block audition |
| Accessibility | Label/value/bounds, Tab order, screen reader, keyboard range edits and focus visibility survive |
| Themes/targets | No browser-blue component styling; approved token treatment works in Desktop/Web light and dark |
| Regression | Every existing `SemanticSlider` consumer retains preview, cancel and exactly-once commit semantics |

Manual acceptance begins with the reported reproduction: move each Fine Tuning slider, do not click
elsewhere, and immediately play `A S D F G H J`. Every key must sound the modified patch; no slider
may move or flash an unrelated state. Then adjust the same focused slider with arrows and verify
that it changes once and does not play a note.

Potentially resource-intensive builds and packaged checks run sequentially under the repository's
fail-fast lifecycle owner with one lock, bounded stage timeouts, progress heartbeats, signal
handling and exact task-owned process-tree cleanup.

## Exit criteria

- Fine Tuning and physical-key audition are composable without refocusing the page.
- A focused range gives mapped musical codes to the active performance surface and keeps its own
  native adjustment keys.
- Unrelated key release cannot commit a slider or release a valid note.
- One slider gesture creates at most one commit, and the next note audibly uses that value.
- Text entry, dialogs, shortcut capture, IME and lost-release safeguards remain intact.
- Focus is accessible and application-themed in light, dark and high-contrast presentation.
- Shared classifier and slider tests pass on Desktop and Web before any recording-stage branch is
  opened.
