# Stage 9A — note-editor interaction and brick navigation

## Status and delivery boundary

This document records the user-approved product and UX direction for credible note editing after
the Stage 5 packaged-app acceptance session. Planning is approved and implementation is active.

The task integration branch is `feature/note-editor-interactions`, based on the completed
`fix/phase-5-manual-acceptance` integration branch. Implementation is a large task and must use one
sequential stage branch per implementation stage. It must not merge to `main`, push, open a pull
request, create another worktree or modify `.github/workflows` without explicit authorization.

Stage 6 remains gated until this plan is implemented and its automated and manual acceptance gates
pass. The completed non-note remediation stays intact and must not be rewritten as part of this
work.

New product ideas required before Stage 6 are retained in
`PRE-PHASE-6-PRODUCT-DISCOVERY.md`. Discussion entries do not authorize implementation; approved
entries extend the Stage 6 gate and require their own implementation and packaged acceptance.

### Implementation status — 2026-08-11

- Stage A is complete and merged into the task integration history at `6eedf87` (`Add note command
history controls`). It added atomic note updates and first-note clip creation, physical scoped
  shortcuts, application Undo/Redo and explicit history groups for a held key. Validation passed
  108 contract tests and 86 repository-policy tests.
- Stage B is complete and merged into the task integration history at `9d8f36d` (`Implement direct
note manipulation`). The Piano Roll now renders only canonical project notes, expands its pitch
  range rather than hiding valid notes, has a truthful empty state, and supports exact double-click
  add/remove, center movement, duration resizing and focus-only four-point affordances. Validation
  passed 112 contract tests and 86 repository-policy tests.
- Stage C is complete and merged into the task integration history at `4cb3fd0` (`Add expressive
  note keyboard editing`). It added symmetric velocity editing, meter-derived bar/beat/grid
  presentation, physical-key note commands and held-key history coalescing. Validation passed 117
  contract tests and 86 repository-policy tests.
- Stage D is complete and merged into the task integration history at `1cad5af` (`Add customizable
  keyboard shortcuts`). It adds a themed settings dialog, grouped keycap bindings, physical-key
  capture, multiple bindings, explicit conflict replacement, reserved-combination rejection,
  per-command and global reset, legacy settings migration and persisted overrides. Validation
  passed 123 contract tests, 86 repository-policy tests, Web typecheck and lint.
- Stage E is active on `feature/note-editor-acceptance`. Integrated interaction smoke has covered
  canonical-note truth, exact double-click add/remove, body movement, short-note duration resizing,
  strength editing, focus cleanup, Undo/Redo and shortcut conflict/reserved-key presentation. The
  complete `check:quick` workflow passes with 124 contract tests and 86 repository-policy tests.
  Final packaging and packaged manual acceptance remain mandatory before this plan can be called
  complete.
- Live A-L audition remains existing functionality. Recording a played performance into timed Piano
  Roll notes is now approved as the separate
  [`STAGE-9B-PERFORMANCE-RECORDING.md`](STAGE-9B-PERFORMANCE-RECORDING.md) stage; that later
  authority owns count-in, engine-clock timing, overdub, pressure and automatic grouped commit.

## Product goals

- Show only notes that exist in the project and are relevant to what the user hears.
- Make the main operations discoverable through direct manipulation without requiring music-theory
  knowledge.
- Preserve precise, efficient keyboard editing for experienced users.
- Make every project mutation genuinely undoable and redoable.
- Keep note selection and resize affordances visually quiet so they do not obscure pitch, timing,
  duration or strength.
- Use one application-owned, remappable shortcut system that behaves consistently across keyboard
  layouts and supported platforms.
- Make bars and meter useful for structure and snapping while allowing a beginner to ignore them.

## Explicit non-goals for the first implementation

- Generative composition, automatic phrase generation or an unexplained permanent ghost note.
- Multi-note selection, marquee selection and bulk transforms. The command model must not prevent
  them later, but the first delivery has one primary selected note.
- Detailed MIDI-controller configuration, aftertouch, expression curves or per-device velocity
  calibration.
- Multiple simultaneous meter regions or mid-project meter changes. The first delivery uses one
  project-wide meter.
- A complete notation editor or score view.

## Expected behavior

### Truthful initial and empty states

- The Piano Roll renders canonical project notes through `ProjectSession`; decorative preview notes
  must not masquerade as editable content or audible output.
- Production `Новый трек` and `Начать со звука` factories create zero authored notes. Complete
  musical examples belong only to the explicit `Начать с примера` flow defined in
  [`STAGE-11-STARTER-CONTENT.md`](STAGE-11-STARTER-CONTENT.md); no example/fixture note may
  leak into an empty source above, below or beyond the initial viewport.
- If the active layer or clip has no notes, the grid stays honestly empty and shows one concise,
  dismissible instruction such as `Double-click the grid to add a note`.
- No suggestion is clickable until suggestion semantics, provenance, placement and acceptance are
  separately designed. A later suggestion must remain visually and semantically distinct from a
  real project note, accept at most once at its displayed pitch/time/duration and become stale when
  the underlying project revision changes.
- Stage 7 may project a canonical note that is vertically outside the viewport into a non-editable
  top/bottom navigation indicator. That edge ghost is governed by
  [`STAGE-10-LINKED-BRICKS-AND-SONG.md`](STAGE-10-LINKED-BRICKS-AND-SONG.md#two-dimensional-source-canvas-and-per-brick-viewport-memory),
  represents existing saved content only and is not the decorative or generative ghost rejected by
  this first implementation.

### Selection and restrained resize affordances

- One click selects a note. Clicking empty grid space clears the selection.
- Selection must not use the rejected heavy black-and-white double frame or large capsule handles.
- A selected note has no enclosing selection border, outline, box or connecting frame. Its original
  fill, thickness, natural edge and readable shape remain unchanged.
- Selection and resizing are indicated by exactly four separate softly glowing points centered on
  the note's top, bottom, left and right edges. No line connects the points.
- The points use a predominantly white, softly diffused glow with only a slight warm accent tint;
  they must remain visible in both Light and Dark themes without becoming hard white boxes.
- The left and right points operate duration; the top and bottom points operate strength. Each point
  becomes slightly brighter only when its hit area is hovered, dragged or keyboard-focused.
- The four points exist only while the note owns active editor focus. Moving focus to the grid,
  another note or another control clears that visual selection immediately, with no residual marks
  or glow.
- Visible points can stay small, but every transparent pointer hit area is at least 24 by 24 pixels,
  centered on its point and extending at least 12 pixels outside the visible note contour. The side
  zones may span the note's full visual height; the top and bottom zones may be wider than their
  point. The body retains a separate central move hit area, and resize zones take pointer priority,
  so moving, duration resizing and strength resizing do not compete for the same gesture.
- Pointer cursors communicate the active operation: move over the body, east-west resize at the
  ends and north-south resize over the strength affordances.
- Keyboard focus uses the same four points; it does not add a separate focus frame around the note.

### Add, remove and select

- Double-clicking empty grid space creates exactly one note at the snapped pitch and time under the
  pointer.
- A newly created note uses the most recently chosen duration where available and a medium default
  strength of 80 otherwise. Both values are immediately editable.
- Double-clicking an existing note removes exactly that note. `Delete` and `Backspace` provide an
  accessible keyboard equivalent for the selected note.
- The event sequence for a double-click must not also create, duplicate or move another note.
- Every add or removal is one undoable project command and selects the affected/restored note when
  that selection remains meaningful.

### Move

- Dragging the central body moves a note in time and pitch. The pointer remains anchored to the
  grabbed location, avoiding a jump when the drag starts.
- Horizontal movement snaps to the visible grid. Holding the fine-move modifier temporarily uses a
  smaller subdivision without silently changing the global grid.
- Vertical movement is chromatic by semitone. The note cannot leave the supported pitch or clip
  range.
- Clicking without crossing the drag threshold selects without creating a history entry.
- A complete pointer drag from press to release is one undo step, not one step per pointer-move
  event.

### Duration

- Dragging either end changes the note duration. Dragging the left end also moves the start so the
  opposite end remains fixed; dragging the right end keeps the start fixed.
- Duration snaps to the grid or the temporary fine subdivision and never becomes zero or negative.
- Duration cannot extend outside the editable clip boundary in the first implementation.
- The final pointer release commits one history entry. Cancelling the drag restores the original
  duration without adding history.

### Strength and velocity

- Note thickness represents note-on velocity/strength in the MIDI range 1-127. A medium value is
  medium thickness, a gentle value is thin and a strong value is thicker.
- Thickness expands or contracts symmetrically around the pitch-row center, so changing strength
  never appears to change pitch.
- Dragging either the top or bottom strength affordance changes the same strength value. Motion
  toward the note center reduces it; motion away increases it.
- Visual thickness is bounded so the note remains legible and does not collide with neighboring
  pitch rows. A larger invisible hit area keeps very quiet notes selectable.
- The selected-note detail shows the numeric strength value for precision. `-` and `+` provide
  keyboard adjustment.
- Ordinary computer keys and direct pointer-created notes in this stage use the configured/default
  medium strength. Stage 9B recording may supply touch/pen pressure, and a future MIDI adapter may
  supply real note-on velocity through the same canonical value.

### Bars, beats, grid and meter

- The ruler shows numbered bars. Bar boundaries are more visible than beat lines; beat lines are
  more visible than grid subdivisions.
- The project-wide meter appears as a quiet control near tempo and key, initially `4/4`, with a
  plain-language explanation such as `4 beats in each bar`.
- Meter determines bar boundaries, beat accents, bar-sized movement, loop/copy ranges and relevant
  snapping calculations. A user who does not know meter can leave the default unchanged.
- Meter and grid resolution are different concepts. Changing grid density must not silently change
  meter, tempo or note duration.

### Keyboard editing defaults

- Arrow left/right: move by one current grid step.
- Arrow up/down: move by one semitone.
- `Alt` + arrow left/right: fine horizontal move.
- `Shift` + arrow left/right: move by one beat.
- `Ctrl`/`Cmd` + arrow left/right: move by one bar according to the current meter.
- `Shift` + arrow up/down: move by one octave, clamped to the supported pitch range.
- `[` and `]`: shorten or lengthen by one grid step; the fine modifier uses the smaller subdivision.
- `-` and `+`: decrease or increase strength.
- `Delete` or `Backspace`: remove the selected note.
- Letter-key modifiers such as `L` or `O` are not defaults because `A-L` already belongs to live
  audition and letter modifiers are layout-sensitive and harder to discover.
- A held key repeat is coalesced into one history gesture ending on key release. Separate key
  presses remain separate undo steps.

### Undo and redo

- `Ctrl+Z` on Windows/Linux and `Cmd+Z` on macOS undo the latest project mutation.
- `Ctrl+Shift+Z` or `Cmd+Shift+Z` redo it. `Ctrl+Y` is an additional Windows-compatible Redo
  binding, not a different command.
- Add, remove, a complete move, a complete duration resize, a complete strength resize and a
  coalesced keyboard move are each exactly one history entry.
- Selection, focus, audition, playback, playhead movement, scrolling and zooming are not project
  history entries.
- A new edit after Undo clears the Redo branch. Undo/Redo buttons, accessible labels and tooltips
  follow `canUndo`, `canRedo` and the user's current bindings.
- Undo and Redo restore canonical project content first. Selection follows the affected note only
  when its stable identity still exists; otherwise selection clears safely.

### Legible history and octave actions — approved follow-up

The current Piano Roll top bar combines standard history arrows with hard-coded disabled `−8va`
and `+8va` text buttons. The symbols currently mean:

- curved left arrow — Undo;
- curved right arrow — Redo;
- `−8va` — move a selected note one octave lower;
- `+8va` — move a selected note one octave higher.

`8va` is notation terminology, not beginner-facing product language. A permanently disabled glyph
also implies functionality without explaining its target or unavailability. This follow-up is
mandatory in Stage 9B-5 and retained by Stage 10C:

- Undo and Redo remain a visually separated history group, never an undifferentiated run beside
  pitch-editing actions;
- each arrow has an immediate visible tooltip on hover/focus: `Отменить` / `Повторить`, plus the
  active shortcut and, when known, the affected action;
- a disabled history action explains `Нечего отменять` or `Нечего повторять`; disabled opacity is
  not its only explanation;
- the global top bar removes bare `−8va` and `+8va` glyphs;
- with one note selected, a persistent contextual action strip or labelled overflow offers fully written
  `Октава ниже` and `Октава выше` actions, optionally paired with a clear vertical arrow icon;
- the tooltip explains `Переместить выбранную ноту на 12 полутонов ниже/выше` and shows any current
  shortcut;
- with no selected note, these note-scoped actions are absent rather than permanently disabled in
  the global toolbar;
- at the pitch-domain boundary an action may remain visible in selected-note context but is disabled
  with the exact reason `Нота уже в нижней/верхней границе диапазона`;
- a future whole-brick transpose is a separately named action such as `Весь кирпичик: октава ниже`.
  The same control must never silently change from selected-note to whole-source scope.

Each octave action dispatches one bounded canonical note-pitch command, retains stable selection and
creates exactly one Undo entry. It is not an audition-octave change: changing the playable keyboard
octave remains a separately labelled performance control.

On compact screens, the history group remains reachable and contextual octave actions may move into
the persistent selected-note action strip or labelled overflow menu. The optional musical-context
inspector may repeat those actions, but it cannot be their only host because the user may collapse
it. The labels, scope and disabled reason must
survive mouse, touch, keyboard, screen reader, light/dark and 200% zoom presentation.

### Collapsible musical-context inspector — approved follow-up

The right-hand Piano Roll panel shown in the approved
[light](../evidence/prototype-visual-reference/light/04-piano-roll.png) and
[dark](../evidence/prototype-visual-reference/dark/04-piano-roll.png) references contains useful but
secondary information: key/scale name, scale notes, selected-note details and editing guidance.
It helps during the first hours with Tiempio, but it must not permanently consume source-canvas
width after the user understands the editor.

The panel becomes a **musical-context inspector** with explicit progressive disclosure:

- one shared application-owned disclosure control uses the same triangle/chevron language as the
  lower song dock in the approved [linked-bricks UI](../evidence/song-composition-visual-reference/light/06-linked-bricks-song.png);
- the two controls remain clearly labelled and independent: collapsing `Музыкальный контекст`
  never collapses `Песня`, and opening the song never reopens the inspector;
- on a wide desktop, the expanded inspector remains a right column; collapse replaces it with a
  narrow persistent edge rail containing the triangle and an accessible concise label/icon, and
  the released width is actually returned to the note canvas;
- the rail cannot disappear completely: the reopen affordance remains visible without hover and
  has a touch-safe hit target;
- in a constrained tablet layout the inspector is a right drawer/sheet closed by default; on a
  phone it may become a bottom sheet. Opening either overlays the canvas instead of compressing it
  below its usable minimum;
- responsive presentation is selected from measured editor-container space, not from one captured
  screenshot width. Desktop/Web, application zoom and future tablet shells use the same semantic
  component and commands;
- selecting a note, starting playback/recording or switching bricks never forces the inspector
  open. A non-blocking badge may announce changed context, but the user's collapsed choice wins;
- scale colouring, note selection, off-screen-note indicators and every editing command continue
  to work while the inspector is collapsed. Essential actions such as `Октава ниже/выше` stay in
  the persistent selected-note action strip or labelled overflow rather than becoming unreachable;
- collapse/expand changes only presentation. It preserves the selected note, manual playhead,
  per-brick musical time/pitch anchors, zoom, playback and an active recording pass, and it creates
  no project revision, render-plan publication or Undo entry;
- after the column width changes, layout remeasures around the same semantic time/pitch anchor;
  raw `scrollLeft` adjustment is only a transient consequence, never the authority;
- the wide-layout preference is a bounded target-local user setting, not per-brick state and not
  `.tiempio` data. It survives source switches and restart; compact drawer/sheet openness is
  transient and defaults closed without overwriting the stored desktop preference;
- the command registry exposes `Открыть/свернуть музыкальный контекст` and may assign a remappable
  shortcut. The control supplies `aria-expanded`, `aria-controls`, a truthful localized name and
  the same action to pointer, touch, keyboard and assistive technology;
- if focus is inside the inspector when it collapses, focus returns to the disclosure control.
  Hidden content is unmounted or inert, never left in the tab order. Reopening keeps focus on the
  control until the user deliberately enters the panel;
- motion is brief and layout-safe; `prefers-reduced-motion` removes the width/slide animation.
  Light/dark, high contrast and the shared themed scrollbar remain consistent.

This follow-up belongs to Stage 9B-5 because recording, long horizontal phrases and touch editing need
the recovered canvas area before Stage 7 composes the final upper editor with the lower song dock.
Stage 10 reuses the shared disclosure primitive and proves independent panel state; Stage 15 retains
the responsive and accessibility evidence.

### Shortcut settings

- Application Settings contains a shared `Keyboard shortcuts` page grouped into General,
  Transport and Note editing sections.
- Each binding is displayed as separate keycap-like pieces inside one clickable binding control,
  for example `Ctrl` + `Shift` + `Z`.
- Activating a binding enters an explicit `Press new shortcut` capture state. `Escape` cancels.
- One command can have multiple bindings. Users can remove a binding, reset one command or reset
  all commands to platform defaults.
- Conflicts are never overwritten silently. The UI names the conflicting command and offers
  explicit Replace and Cancel actions.
- Reserved operating-system combinations are rejected with a concise explanation.
- Global commands require safe modifiers where appropriate. Editor-specific unmodified keys are
  active only while the Piano Roll owns keyboard focus and must not collide with `A-L` audition.
- Bindings store physical `KeyboardEvent.code` identifiers for layout independence while labels are
  rendered in platform-friendly form (`Ctrl` versus `Cmd`). User shortcut preferences are
  application settings, not project-file content.

## Architecture boundaries

- `ProjectSession` remains the sole authority for canonical note mutations and bounded Undo/Redo
  history. Components never mutate project note arrays directly.
- The application command layer owns semantic commands such as add note, remove note, move note,
  resize duration, change strength, Undo and Redo.
- Pointer interaction keeps only an ephemeral preview/origin locally during a gesture. The completed
  gesture dispatches one canonical command; cancellation dispatches none.
- Stable note identity and current project revision are checked before applying a gesture result, so
  a stale interaction cannot modify a replaced project.
- Piano Roll projection derives visible note geometry, bar/beat lines and selection metadata from
  canonical project state plus local view state.
- The shared command registry evolves from one hard-coded `event.key` shortcut per command to
  scoped binding profiles using physical codes, multiple bindings, conflict validation and
  platform-aware display labels.
- Desktop and Web use the same application command and shortcut model. Platform adapters may persist
  personal shortcut settings, but renderer/shared code must not import Electron or Node APIs.
- Engine render plans continue to derive from committed project revisions. Pointer previews do not
  become audible canonical edits until their gesture commits.

## Implementation stages and branch sequence

### Stage A - command, history and shortcut contracts

Branch: `feature/note-editor-command-history`.

- Define semantic note-edit commands and stable note targeting.
- Wire application-level Undo/Redo commands to the existing `ProjectSession` history.
- Add gesture coalescing boundaries for pointer drags and held-key movement.
- Evolve shortcut bindings to physical codes, scopes and multiple platform defaults without yet
  shipping the settings page.
- Add focused command/history/shortcut conflict tests.

### Stage B - truthful note projection and direct manipulation

Branch: `feature/note-editor-direct-manipulation`.

- Remove decorative preview notes and the unexplained fixed ghost interaction.
- Render canonical project notes and an honest empty state.
- Implement selection, double-click add/remove, center drag movement and separate duration handles.
- Use restrained selection and resize affordances with large invisible hit areas.
- Cover click-versus-drag thresholds, bounds, snapping, cancellation and stale revisions.

### Stage C - strength, meter and keyboard editing

Branch: `feature/note-editor-expression-and-keys`.

- Implement symmetric thickness/velocity presentation and strength dragging.
- Add the quiet project-meter control and hierarchical bar/beat/grid rendering.
- Implement keyboard movement, duration, strength and deletion commands with repeat coalescing.
- Preserve audition focus/release behavior and layout independence.

### Stage D - shortcut settings

Branch: `feature/keyboard-shortcut-settings`.

- Add the shared application-owned settings surface and keycap binding controls.
- Add capture, multiple bindings, conflict replacement/cancellation, reserved-combination rules and
  per-command/all-default reset.
- Persist personal bindings outside project files and render platform-appropriate labels.
- Audit all application shortcuts, equivalent controls, focus scopes and Light/Dark treatments.

### Stage E - integrated verification and acceptance

Branch: `feature/note-editor-acceptance`.

- Merge completed stages sequentially back into `feature/note-editor-interactions`.
- Add/update documentation and retained evidence without claiming any deferred suggestion or
  multi-selection behavior.
- Run focused checks after each stage, then the final sequential lifecycle-owned validation and
  packaging workflow once.
- Perform packaged manual acceptance for note truth, every pointer gesture, keyboard editing,
  Undo/Redo, shortcut remapping and restart persistence.

## Edge cases, failures and compatibility risks

- A double-click produces both click and pointer events; it must create or remove only once.
- A drag crosses from the body into an edge hit area or leaves the window before release.
- Pointer capture is lost, the app blurs or the project revision changes during a gesture.
- A very short or very quiet note still needs usable move and resize hit targets.
- Notes overlap in pitch/time; hit testing, selection and z-order must remain deterministic.
- Moving/resizing reaches beat, bar, clip or pitch boundaries under normal and fine snapping.
- Keyboard auto-repeat, a stuck modifier, AltGr, IME composition or a layout change occurs while an
  editor command is active.
- An editor shortcut conflicts with audition, transport, text input or an operating-system command.
- Undo is requested during playback or after selection has moved to another layer.
- A new edit follows several Undo operations and must invalidate only the abandoned Redo branch.
- Meter changes make existing note positions non-integral. Existing musical time is preserved;
  notes are not silently moved to the new grid.
- Large projects must not rerender the entire application on every pointer move. Gesture preview and
  final canonical commit must stay bounded without bypassing project history.
- The restrained visual selection must remain perceivable in Light and Dark themes, Windows high
  contrast/forced colors and keyboard-only focus.
- Existing project-file compatibility, engine-plan determinism, Desktop/Web boundaries, audio
  recovery and truthful transport behavior must not regress.

## Verification strategy

Focused automated verification:

- project-session command, Undo/Redo branching, capacity and stable-identity tests;
- shortcut matching, scopes, layout independence, multiple bindings, conflict and persistence
  tests;
- pure geometry tests for pitch/time projection, snapping, bars, duration and strength thickness;
- component interaction tests for click, double-click, drag threshold, pointer capture/loss,
  cancellation, keyboard repeat coalescing and accessible alternatives;
- controller/engine-plan tests proving that one completed gesture produces one current project
  revision and the expected audible note data;
- visual/accessibility fixtures for idle, hover, selected, resizing, very short, very quiet, empty,
  Undo/Redo disabled and shortcut-conflict states in Light and Dark themes.

Manual packaged acceptance:

1. Add, select and remove notes without decorative content or duplicates.
2. Move a note from its center and resize each duration edge without a positional jump.
3. Adjust strength from either subtle handle and confirm symmetric thickness plus audible velocity.
4. Edit with keyboard defaults in English, Russian and another non-Latin/IME layout.
5. Undo and Redo every gesture, including a held keyboard move, and verify new edits clear Redo.
6. Remap a shortcut, resolve a conflict, restart Tiempio and confirm the personal binding persists.
7. Confirm meter/bar/beat/grid hierarchy is understandable but visually unobtrusive.
8. Recheck audio-device recovery, live audition, transport truth and Desktop/Web project parity.

All resource-intensive checks must run sequentially through the repository lifecycle owner with its
single-run lock, bounded stage timeouts, heartbeat, signal handling and exact task-owned cleanup.
After every commit, run `npm run lifecycle:audit` before any next check, commit, branch or merge.

## Definition of done

- Every visible editable note is canonical project content and corresponds to the audible plan.
- Add/remove/move/duration/strength interactions are bounded, deterministic and accessible.
- The selected-note visual uses only four unconnected glowing edge points, with no selection frame,
  enclosing outline or oversized capsule handles.
- Bars, beats, grid and one project-wide meter render and snap consistently.
- Keyboard editing works across layouts, respects scope and does not collide with audition.
- Undo/Redo works for every project mutation with one human gesture per history entry.
- Undo/Redo are named and grouped history actions; bare `±8va` controls are absent, while selected
  notes expose real `Октава ниже/выше` commands with stable scope and one Undo step.
- The secondary musical-context inspector collapses to a persistent labelled rail on wide layouts
  and to a closed-by-default drawer/sheet on constrained layouts; all note actions remain reachable
  and toggling it changes no musical, history, playback or recording state.
- Shortcut bindings are discoverable, remappable, conflict-safe, resettable and persisted outside
  project files.
- Generative suggestion ghosts remain absent. Stage 7 off-screen-note indicators may appear only
  under their separate canonical-note navigation contract.
- Focused tests, visual/accessibility checks, combined quick/release checks and package verification
  pass under lifecycle ownership.
- Packaged manual acceptance passes and evidence records any platform limitation honestly.
- The integration branch is clean, contains atomic English commits, has no task-owned process,
  lifecycle lock or quarantine, and is ready for review without merging to `main`.
