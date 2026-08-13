# Stage 7A — context-preserving brick creation

## Status and priority

**Status:** user-approved AS-TO-BE bug-fix direction and implementation plan, 2026-08-13.

**Priority:** first implementation gate after Stage 6 acceptance. It must complete before the
focus-safe audition gate, Stage 9 recording architecture or any Stage 10 linked-bricks work.

This gate fixes a loss-of-context and premature-project-mutation defect in `Add layer`. It is not a
Stage 7 composition redesign, but Stage 7 must build on its contextual creation session rather than
restoring the current global first-layer route.

Relevant visual references:

- [first empty layer light](../evidence/prototype-visual-reference/light/02-first-layer.png) and
  [dark](../evidence/prototype-visual-reference/dark/02-first-layer.png) remain valid only for a
  genuinely empty project;
- [Piano Roll light](../evidence/prototype-visual-reference/light/04-piano-roll.png) and
  [dark](../evidence/prototype-visual-reference/dark/04-piano-roll.png) establish the persistent
  existing-layer column;
- [Sound Chooser light](../evidence/prototype-visual-reference/light/03-sound-chooser.png) and
  [dark](../evidence/prototype-visual-reference/dark/03-sound-chooser.png) remain authority for
  audition and sound selection, but their project-shell integration must preserve existing bricks.

The supplied defect screenshots are diagnostic evidence, not approval to show an empty project
while existing bricks still exist. A compact `Add brick` card inside the real brick list requires a
retained light/dark prototype delta before visual acceptance.

## Reported defect

Current sequence:

1. open a project that already contains several bricks;
2. press `Add layer`;
3. Tiempio replaces the current editor with `С чего начнём?` and renders a left panel that says
   there are zero layers;
4. every existing brick disappears from view even though it still exists in the project;
5. after choosing a role, the user is sent into sound selection and cannot select an existing brick
   to return to their work;
6. the project creates a new canonical layer before the user confirms a sound.

The experience looks like destructive data loss and traps the user inside an unfinished workflow.
The absence of a visible escape is a critical trust failure even when project bytes remain intact.

## Confirmed implementation cause

The defect is caused by three coupled boundaries:

- every editor `onAddLayer` executes the global `studio.first-layer` view command;
- `FirstLayerView` is a complete replacement surface with a hard-coded `0` count and its own empty
  layer list;
- `useFirstLayerActions.chooseLayer` dispatches `layer.add`, selects the new canonical layer and may
  place drum content immediately, before `Use sound` or an equivalent final confirmation;
- Sound Chooser preset and macro handlers then mutate that provisional canonical layer directly.

The correction cannot be a cosmetic copy of existing rows into `FirstLayerView`. Creation needs a
contextual application session and a real commit boundary.

## Product decision

There are two related but distinct entry states:

### Genuinely empty project

When `project.layers.length === 0`, the full central `С чего начнём?` onboarding surface is truthful.
The empty left list may show zero because no brick exists. Choosing a role starts a creation draft;
it still does not add a canonical layer until the final sound/kit confirmation.

### Existing project

When at least one brick exists, `Add brick` never navigates to the empty-project surface.

- The existing brick list remains mounted, visible and scrollable.
- A compact creation card is inserted in the brick-list zone, adjacent to the `Add brick` action.
- The current selected brick and its upper editor remain visible initially.
- Choosing a role may open the Sound Chooser in the central workspace, but the real brick column and
  every existing row remain present.
- Existing rows remain enabled at every creation step.
- The song dock and canonical composition remain intact; creation presentation does not clear,
  replace or fake the project projection.

This is a non-modal project workflow. The user never has to finish adding a brick to regain access
to existing music.

## AS-TO-BE interaction

### Opening the creation card

Pressing the left-column `Add brick` action:

1. creates or focuses one transient `LayerCreationDraft`;
2. expands an inline card inside the same shared `ScrollSurface` as the existing brick rows;
3. keeps the current brick selected and the current editor unchanged;
4. moves keyboard focus to the card heading or first role without moving the list unexpectedly;
5. announces `Adding a brick. Existing bricks remain available.` to assistive technology.

The baseline allows one creation draft per project session. Pressing `Add brick` again focuses the
existing draft instead of producing several ambiguous incomplete rows.

The card contains:

- a clear `New brick` heading and transient/draft treatment;
- role choices such as Rhythm, Bass and Chords/Melody; the later Stage 12 personal-audio phase
  activates `Мой звук` and the separately design-approved `Запись` role in this same card rather
  than introducing another creation shell;
- an explicit Close/Cancel control;
- concise current progress after a role or sound has been chosen;
- no fake Solo/Mute controls, song instances or persistent mix state.

It may grow within the layer column and participate in its application-owned vertical scrolling,
but it cannot cover, remove or disable all existing rows. At constrained height the selected draft
may be scrolled into view while the rest of the list remains reachable.

The canonical brick count does not include the draft. A project with six bricks continues to say
`6 bricks`; an adjacent accessible status may add `1 new brick draft`. It must never show `0` merely
because creation is active.

After role selection the expanded role card may collapse into one clearly transient draft row such
as `New Bass · choosing sound`. Activating that row restores Sound Chooser; its Cancel affordance
remains available without entering the chooser again.

### Moving between the draft and existing bricks

At every step, selecting an existing brick immediately opens its normal editor. The draft is
suspended, not committed, and its audition voices are released. The draft card remains visible with
an explicit `Continue` action so the user can resume without losing choices.

The user can therefore alternate freely:

`Add brick -> choose Bass -> audition Deep -> open existing Drums -> continue new Bass -> Use sound`

No step treats an unfinished draft as the selected canonical layer. Keyboard shortcuts and layer
actions apply to the actually selected existing brick unless focus is inside the draft or its Sound
Chooser.

### Back, Escape and Cancel

- Back from Sound Chooser returns to the role step inside the same inline draft; it does not open a
  fake zero-layer screen.
- Escape closes the current transient picker/popover first, then returns one draft step when that is
  unambiguous.
- Explicit Cancel discards the entire draft and returns focus to the `Add brick` action or the
  previously selected brick.
- Selecting another existing brick does not cancel the draft; it suspends it.
- Closing/switching the project may discard the non-canonical draft after releasing audition. It
  must not create a dirty project or a save prompt solely for that draft.

Cancel before final confirmation creates no Undo entry because no project mutation occurred.

### Commit boundary

`Use sound` for a melodic/synth brick, `Use kit` for drums or the equivalent final action is the
only baseline commit boundary.

At commit Tiempio performs one validated application transaction/history group:

1. allocate canonical layer/source IDs and event IDs only for explicitly chosen content;
2. add the layer with chosen role and name;
3. attach the selected reproducible instrument/kit, semantic macros and performance mapping;
4. create no authored synth notes or kit-only drum events; copy a named drum pattern only when the
   user explicitly selected that content;
5. select the committed brick and open its correct editor;
6. close the draft only after the project transaction and required engine plan are accepted.

One Undo removes the complete newly added brick and any explicitly selected pattern material created
by that commit.
Redo restores it. A failed command, validation error or engine-plan rejection leaves the draft
available with an actionable message and does not expose a half-created canonical layer.

## Draft state and ownership

The application owns one bounded session object conceptually shaped as:

```text
LayerCreationDraft
  draftId
  projectId
  originSourceLayerId?
  step: choosing-role | choosing-sound | choosing-performance | ready
  role?
  displayName?
  presetOrKitId?
  semanticMacros?
  performanceMapping?
  suspended
```

It is presentation/workflow state, not `ProjectDocument` state:

- it does not change project revision, dirty state, recovery or Undo/Redo;
- it is not serialized in `.tiempio` or compiled into the project render plan;
- `draftId` is namespaced separately and cannot masquerade as a canonical `LayerId`;
- canonical opaque IDs are allocated only during final commit;
- switching existing source selection does not rewrite or discard the draft;
- project replacement invalidates the draft by exact `projectId` ownership.

A `LayerCreationCoordinator` owns the state machine, focus return, audition lifetime and final atomic
command group. React views project it; they do not independently create layers from role-button
clicks.

## Draft audition and Sound Chooser integration

Sound Chooser supports two explicit targets:

- `existing-source` edits a named canonical brick under ordinary project preview/commit rules;
- `creation-draft` edits only `LayerCreationDraft` values and auditions a bounded transient patch.

The draft target never calls canonical `layer.character.select`, `layer.macro.commit` or
`layer.performance.set`. Audition is keyed by draft ID and resolved patch; it stops on draft
suspension, cancel, existing-brick selection, view teardown, blur or project switch.

The persistent brick column is shell geometry and cannot be replaced by Sound Chooser's instrument
family navigation. On wide viewports, the chooser's Bass/Lead/Pad/Pluck/Texture categories may be a
secondary internal column beside its sound stage. At compact widths they become a shared themed
drawer/dropdown within Sound Chooser. In neither case may they impersonate, cover or remove the
project's brick list. This responsive composition is part of the required prototype delta.

Fine Tuning values remain resumable inside the draft. The following focus-safe audition gate applies
unchanged, but it must route events to the active draft audition target rather than a nonexistent
canonical layer.

Drums follow the same ownership rule. Role selection may establish kit defaults in the draft, but
no canonical rhythm source exists until final confirmation. `Use kit` alone commits an empty drum
source; only an explicitly selected named pattern commits visible editable drum events. The final
Stage 11 factory separation and expanded catalog are specified in
[`STAGE-11-STARTER-CONTENT.md`](STAGE-11-STARTER-CONTENT.md).

## Responsive and accessible behavior

- Desktop and tablet landscape show the inline card in the persistent brick column.
- Tablet portrait and phone show the same real list and card inside the labelled Layers drawer or
  sheet; opening it never navigates to a zero-layer page.
- Existing rows, draft progress and Cancel remain reachable at 200% zoom and constrained height.
- The card is a labelled region/form, not a modal dialog, and has predictable Tab/Shift+Tab order.
- Role selection, Continue, Back and Cancel have keyboard and screen-reader equivalents.
- Focus returns to a surviving control after cancel, commit or a source deleted elsewhere.
- The draft state is not conveyed only by coral color; text/icon/state labels identify it.
- Shared themed scrollbars, focus-visible treatment and touch targets apply to the entire list.

## Implementation — Stage 7A entry gate

**Suggested branch:** `fix/contextual-add-brick`.

1. Split empty-project onboarding from add-to-existing-project navigation. Guard the full
   `first-layer` surface by truthful zero-layer state.
2. Add the application-owned `LayerCreationCoordinator` and bounded draft model with one active
   draft per project session.
3. Replace editor/list `studio.first-layer` add handlers with `creation.open-or-focus`.
4. Project the contextual card inside the shared existing brick list while retaining selection,
   editor, song dock and all existing rows.
5. Make existing-row selection suspend/resume draft creation and release only draft audition.
6. Refactor role and Sound Chooser handlers so draft choices do not dispatch canonical project
   commands before final confirmation.
7. Commit synth/drum creation as one validated history group and keep the draft recoverable on
   failure.
8. Add Desktop/Web, responsive, focus, keyboard, screen-reader and visual regression coverage.

No V4 source-instance migration, recording protocol or Stage 10 song scheduling belongs in this
branch. The gate must work against the current project model while leaving a coordinator seam that
the V4 source commit can adapt later.

## Failure and edge cases

- Add is pressed with zero, one, many or the maximum supported number of layers.
- Add is pressed twice rapidly or from two visible controls.
- Existing source selection changes while a draft sound note is held.
- Back, Escape, Cancel, browser navigation, window blur or React Strict Mode occurs at every step.
- The selected existing source is deleted while the draft remembers it as origin.
- Project switch/reopen occurs with a suspended draft.
- Final commit conflicts with a newer project revision or reaches a layer/event ceiling.
- Engine is unavailable while the user chooses a valid sound.
- Project commit succeeds but render-plan activation is delayed or rejected.
- Undo immediately follows commit; Redo follows; a new draft starts afterward.
- Empty drums, empty synth roles and an explicitly selected drum pattern allocate only the IDs their
  committed content actually needs; audition events and provisional IDs never leak.
- Compact/phone Layers drawer closes while the draft is active and later reopens.

Every failure ends truthfully: existing bricks remain visible/reachable, no provisional canonical
layer remains, held audition voices release, and the user can cancel or retry.

## Verification matrix

| Boundary | Required evidence |
| --- | --- |
| Empty versus existing | Full `С чего начнём?` only at zero layers; existing Add uses inline card |
| Context retention | Existing rows, selected editor and song dock do not disappear or reset |
| Navigation | Any existing brick opens immediately; draft remains resumable; Back never shows fake zero |
| Project authority | Role/preset/macro/performance choices create no revision, dirty state, recovery or history |
| Audition | Draft patch sounds without canonical layer and releases on suspend/cancel/switch |
| Commit | Final confirmation creates one complete canonical brick in one Undo group |
| Failure | Revision/limit/engine failures expose no half-created layer and retain actionable draft |
| Identities | Draft IDs cannot enter project commands/render plan; canonical IDs allocate at commit |
| Focus/accessibility | Predictable entry/return, labelled draft, keyboard flow and live announcement |
| Responsive | Persistent list/card in desktop column and phone/tablet Layers drawer at constrained height |
| Regression | Existing-source Sound Chooser edits, first empty-project flow and layer selection still work |

Manual acceptance repeats the reported scenario with at least six existing bricks:

1. press Add and verify all six rows, their count, selected editor and song dock remain;
2. choose Bass and audition/edit a sound, then verify project revision and canonical layer count are
   unchanged;
3. select existing Drums and another existing melodic brick, confirming each opens immediately and
   the draft stays resumable;
4. resume the draft, use Back to the role card, choose Bass again and press `Use sound`;
5. verify exactly one seventh brick appears, then one Undo returns to the original six;
6. repeat and Cancel instead, verifying no project mutation, save prompt, stuck audition voice or
   zero-layer flash;
7. repeat in Desktop/Web light/dark plus constrained Layers drawer with keyboard and touch.

## Exit criteria

- Pressing Add in a non-empty project never renders a zero-layer panel or hides existing bricks.
- The creation card lives inside the real brick-list zone, and every existing brick remains
  selectable throughout role and sound choice.
- The user can suspend, resume or cancel creation without losing or mutating existing music.
- No canonical layer is created before `Use sound`, `Use kit` or equivalent final confirmation.
- Final confirmation creates one complete brick as one Undo/Redo unit; failure is atomic.
- Draft audition, macros and mappings remain transient and cannot pollute project/recovery/render
  state.
- Desktop, Web, compact, touch, keyboard and screen-reader acceptance passes before the next
  Stage 7B focus-safe audition gate begins.
