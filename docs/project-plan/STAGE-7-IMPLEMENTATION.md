# Stage 7 implementation plan

## Status and scope

**Status:** implemented and verified on `feature/stage-7`, 2026-08-14; ready for the explicitly
authorized merge into `main`.

This document records the implementation-specific architecture audit and execution sequence. Product
behavior and acceptance authority remain in:

- [`STAGE-7A-CONTEXTUAL-BRICK-CREATION.md`](STAGE-7A-CONTEXTUAL-BRICK-CREATION.md);
- [`STAGE-7B-FOCUS-SAFE-AUDITION.md`](STAGE-7B-FOCUS-SAFE-AUDITION.md).

Combined implementation and verification evidence is recorded in
[`../evidence/STAGE-7.md`](../evidence/STAGE-7.md).

Stage 7A completes and is verified before Stage 7B begins. No recording, source/instance model,
linked-brick scheduling, starter-catalog expansion or repository-hosted automation is in scope.

## Architecture audit

The current implementation confirms the defects described by the approved plans:

1. `studio.first-layer` is both truthful empty-project onboarding and the add-to-existing route.
   `WorkflowSurface` consequently replaces the editor and the canonical layer column.
2. `useFirstLayerActions` allocates a canonical ID and dispatches `layer.add` immediately. Drums add
   a clip and pattern before the user has confirmed a kit.
3. `ProjectSession` history groups collapse Undo history, but each command still publishes a visible
   project revision. There is no all-or-nothing preparation/commit boundary for a complete brick.
4. Sound Chooser reads and writes only the selected canonical layer. Its audition layer must exist in
   the active engine render plan, so a draft cannot currently audition without polluting the project.
5. `EditorLayerList` owns repeated list markup without the shared `ScrollSurface`; workflow screens
   own unrelated sidebars. The persistent project column needs one reusable projection.
6. The performance target filter blocks every `INPUT`; the held-source session itself already owns
   note-off by physical source. `SemanticSlider` commits on every keyup and does not track dirty
   gestures. These are shared infrastructure defects, not Sound Chooser-local defects.

The implementation will correct these boundaries instead of adding click-to-refocus handlers,
copying fake rows into onboarding or creating provisional project layers.

## Stage 7A implementation stages

1. **Atomic project transaction foundation**
    - add an immutable prepared transaction to `ProjectSession`;
    - reduce and validate every command against a private candidate document;
    - commit only when the base session/revision still matches;
    - publish the candidate once, create one Undo entry and expose no partial state on rejection.
2. **Creation workflow ownership**
    - add a branded, bounded `LayerCreationDraft` and `LayerCreationCoordinator`;
    - keep one draft per exact project ID, with open/focus, role, sound, performance, suspend,
      resume, back, cancel, failure and commit states;
    - keep draft state outside `ProjectDocument`, persistence, recovery and history.
3. **Transient audition target**
    - let the application runtime publish one bounded draft instrument as an event-free transient
      engine-plan layer;
    - rebuild it from the selected preset/macros without changing the project revision;
    - release draft-owned notes and remove the transient layer on suspend, cancel, project switch,
      blur and teardown;
    - pre-activate the final candidate render plan before committing the prepared project transaction.
4. **Context-preserving UI**
    - guard the full first-layer screen by a true zero-layer project;
    - route add actions to `creation.open-or-focus`;
    - render the real layer list and inline draft card in one shared themed scroll surface;
    - keep the selected editor and song dock until role selection, then render Sound Chooser beside
      the same persistent project column;
    - selecting a real row suspends the draft, while Continue restores its chooser state.
5. **Creation commits**
    - synth commit adds the selected role, preset, macros and performance as one transaction;
    - kit-only drum commit creates an empty rhythm layer; pattern events exist only after an explicit
      named-pattern choice;
    - one Undo removes the entire committed brick and Redo restores it;
    - stale revision, ceiling, validation and engine rejection retain an actionable draft.
6. **Accessibility, responsive layout and evidence**
    - predictable focus entry/return, live status, labelled draft region and non-color state;
    - persistent desktop column and compact Layers drawer projection;
    - light/dark/constrained-height prototype delta and targeted Desktop/Web regression evidence.

## Stage 7B implementation stages

1. Add a pure semantic focus-target classifier with fail-closed editable/modal/capture behavior.
2. Route mapped physical codes through range and action controls while preserving each control's
   reserved native keys, IME and modifier behavior.
3. Preserve source-owned keyup release even when focus moves after note-on.
4. Refactor `SemanticSlider` around one dirty pointer/keyboard gesture and an idempotent terminal
   commit path; blur remains a fallback only for pending changes.
5. Remove broad performance release from ordinary macro commits and keep release only for actual
   sound, mapping or ownership replacement.
6. Apply token-derived shared range `focus-visible` styling and audit every slider consumer.
7. Add classifier, held-note, slider gesture, Sound Chooser and target integration regressions.

## Failure and compatibility risks

- A prepared transaction can become stale while engine activation is pending; it must fail without
  replacing newer project state, then immediately restore the canonical engine plan.
- A transient draft plan must not affect project revision acknowledgements, recovery or transport
  scheduling and must never survive project replacement.
- React Strict Mode may mount/unmount effects twice; coordinator ownership and cleanup must be
  idempotent.
- Maximum layer/event limits must reject during preparation, before engine or project mutation.
- A real layer deleted while remembered as the draft origin changes focus return to the surviving
  Add action without invalidating the draft.
- Existing-source Sound Chooser behavior must continue using ordinary project preview/commit rules.
- Range input types not explicitly classified remain blocked from performance routing.
- Pointer-up, key terminal and blur may arrive in different orders; slider commit must remain once.
- Desktop and Web use the same application/runtime code and cannot receive divergent draft or input
  policies.

## Verification strategy

Checks are run sequentially through `scripts/lifecycle-runner.mjs`, which is the repository's
single-lock fail-fast owner with bounded stage timeouts, heartbeats, signal propagation and exact
task-owned process cleanup.

1. Run focused Node tests for project transactions, creation coordinator, render-plan augmentation,
   input classification/session ownership and slider gesture state.
2. Run focused application/runtime tests for draft non-mutation, suspend/resume/cancel, atomic
   commit/failure and latest-patch audition.
3. Run `npm run check:quick`, then the relevant Desktop/Web and visual-accessibility workflows.
4. Perform the manual six-to-seven-brick scenario in light/dark and constrained-height layouts when
   an interactive target is available; retain explicit evidence or record any environment limit.
5. Review the final diff against both approved verification matrices and all edge cases above.

Before and after every workflow and after every commit, run `npm run lifecycle:audit`. Heavy checks
never overlap. If the machine becomes noticeably slow, stop only verified task-owned processes,
confirm lock cleanup and schedule the approved one-hour continuation.

## Definition of done

- All Stage 7A and Stage 7B exit criteria pass without provisional canonical state.
- Draft creation is resumable, cancelable, non-dirty and engine-audible through a transient target.
- Final creation is one atomic Undo/Redo unit and a failed activation exposes no committed brick.
- Existing layers, selected editor and song dock remain truthful and reachable throughout creation.
- Focus-safe audition and native slider editing compose without refocusing or duplicate commits.
- Shared UI treatments pass light, dark, compact, keyboard and assistive-technology checks.
- Desktop and Web targeted tests plus final sequential validation pass.
- Stage branches are merged into `feature/stage-7`, the combined result is audited, and only then is
  `feature/stage-7` merged into `main` in the primary working directory.
- `main` is clean and no task-owned process, lifecycle lock or continuation automation remains.
