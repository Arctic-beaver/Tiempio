# Stage 14 — responsive, tablet and mobile product adaptation

## Status and placement

**Status:** approved planning baseline; implementation has not started.

Stage 14 begins after Stage 13 export. It is the application-wide adaptation pass over every real
screen delivered by Stages 7–13 and exits before Stage 15 acceptance. Earlier stages still implement
their local constrained-layout safety; Stage 14 must not be used as permission to ship overlapping,
unreachable or mouse-only controls temporarily.

The purpose is not to shrink the desktop pixels. Tiempio keeps one semantic application and one
project model while presenting its tools according to available space, pointer capability, keyboard
presence, safe areas and orientation.

## Product outcome

Desktop windowed mode, desktop fullscreen, landscape/portrait tablet and phone Web layouts are
usable for the complete supported path:

- Home, project open/recovery and first brick creation;
- Sound Chooser, Fine Tuning and keyboard/touch audition;
- note/drum/audio-phrase editing and recording;
- linked-brick preview and lower song composition;
- starter example, personal audio import/capture and Export;
- settings, diagnostics and recovery actions.

Phone presentation may serialize secondary panels instead of displaying everything at once, but it
cannot replace supported controls with dead mockups or hide the only route back to them.

## Responsive model

The implementation uses measured semantic layout states rather than device-name checks:

```text
wideWorkspace
standardWorkspace
compactWorkspace
tabletWorkspace
phoneWorkspace
```

Transitions derive from available container geometry plus input/safe-area capabilities, not one
global `window.innerWidth` fork. Component-local container queries may refine layout without
duplicating project/editor logic. Breakpoint values are frozen only after screenshots and
interaction evidence establish the minimum usable editor widths.

Presentation state — drawer visibility, inspector disclosure, panel sizes, scroll positions and
orientation-specific choices — remains outside canonical project/Undo state. Per-brick semantic
time/pitch/zoom anchors survive every layout transition.

## Application shell and collision policy

The top transport has a documented priority and overflow model. It must specifically fix the
reported constrained-window defect where Undo/Redo overlaps the transport/tool panel.

1. Play/Stop, Record when relevant, current position and truthful audio status remain directly
   reachable.
2. Tempo/key/meter retain understandable values but may compact to labelled popovers.
3. Undo/Redo move into the same themed overflow/command surface when inline room is insufficient;
   they never float over, clip or become obscured by transport content.
4. Octave actions are contextual named commands (`Октава ниже/выше · 12 полутонов`), not unexplained
   global `−8va/+8va` glyphs consuming scarce header space.
5. Desktop window controls, safe-area insets and browser chrome never reduce a target below its
   minimum hit area.

The outer application rail collapses to an icon rail, drawer or phone navigation bar while
preserving Home, Add/Create, project files, Export, Settings and later Import semantics. Navigation
order, names, selected state and accessible labels do not change between presentations.

## Workspace composition by layout

### Wide and standard desktop

- layers remain a left column;
- the central editor owns the largest flexible area;
- the musical-context inspector can collapse to its labelled edge rail;
- the lower song dock expands/collapses independently;
- transport and status use their full reviewed labels where space permits.

### Compact desktop and tablet

- the real layers remain reachable in a collapsible rail/drawer without replacing the active editor;
- the musical-context inspector opens as an overlay drawer;
- the lower song keeps a bounded resizable dock or landscape sheet;
- Add-brick draft, selected source and suspended creation choices remain visible/recoverable;
- touch and pen gestures never depend on hover.

### Phone

- one primary creative surface is visible at a time: source editor, song timeline, sound chooser,
  recorder or supporting sheet;
- layers and source selection live in a persistent named drawer/sheet route;
- the song is a full-width horizontal timeline screen or sheet, not a miniature unreadable dock;
- inspector content is a secondary sheet; essential note commands stay in the editor toolbar;
- transport remains pinned outside the scrolling canvas without covering notes/waveforms;
- browser keyboard appearance, dynamic viewport height, rotation and safe areas cannot strand Stop,
  Record, Cancel, `Use sound`, `Use recording` or Export cancellation.

## Editor and scroll behavior

- Piano roll keeps independent horizontal time and vertical pitch scrolling, sticky aligned axes and
  truthful off-screen-note indicators above/below.
- Drum grid, waveform editor and song timeline keep horizontal navigation and visible position
  context at every zoom.
- Every visible scrollable surface uses the application-owned semantic scrollbar treatment on
  platforms that show scrollbars; touch panning remains native-feeling and does not create a local
  one-off scrollbar skin.
- Wheel/trackpad, touch drag, pen, keyboard and assistive technology expose equivalent navigation.
- Full-line playheads/cursors remain draggable left/right with an adequate invisible hit target;
  seek never starts playback implicitly.
- Pinch/zoom is added only when it can coexist with browser accessibility zoom and one-finger panning;
  otherwise explicit zoom controls remain the truthful path.
- Switching layout, orientation, source or drawer state restores semantic time/pitch/zoom anchors,
  not stale pixels.

## Touch, keyboard and accessibility

- Primary transport, recording, disclosure and destructive actions have at least a 44×44 CSS-pixel
  touch target unless platform evidence approves a larger shared token.
- Dense note/drum cells may be visually smaller, but selection/drag handles receive adequate
  tolerance without stealing adjacent events.
- Pointer capture, cancellation, lost capture and multi-touch identity are handled explicitly.
- No action requires right-click, hover, precision mouse wheel or a hardware keyboard.
- Hardware keyboard shortcuts remain scoped when present; the software keyboard and text fields do
  not trigger musical keys or global commands accidentally.
- Screen-reader reading order follows the visible semantic surface, hidden drawers are inert, focus
  returns to the disclosure trigger and Escape/Back behavior is consistent.
- 200% zoom, increased text size, reduced motion, high contrast and light/dark themes remain usable.

## Personal-audio and recorder adaptation

Stage 12 retains its mandatory user design approval. Stage 14 implements only the already approved
recorder semantics and may not redesign them silently.

- input permission and device recovery remain named user actions;
- meter, waveform, elapsed time and Record/Stop never fall below usable size;
- phone orientation/keyboard changes cannot stop capture or lose the take;
- monitoring/headphone warnings are readable without blocking Stop;
- review/trim/retry/discard/`Use recording` remain distinguishable and reachable;
- large take waveform/peaks are virtualized/segmented within measured memory and long-task budgets.

## Architecture and implementation order

**Integration branch:** `feature/responsive-mobile`, created from the completed Stage 13 integration
branch.

1. `feature/responsive-contracts` — semantic layout capabilities, design-system tokens, shared
   responsive primitives, safe-area/dynamic-viewport tests and no project-state leakage;
2. `fix/transport-header-collisions` — priority/overflow model, Undo overlap regression and named
   octave actions;
3. `feature/adaptive-shell-navigation` — outer rail/drawer/bar, layers, inspector and song surface;
4. `feature/adaptive-source-editors` — piano/drum/waveform scrolling, axes, ghosts, playheads and
   per-brick anchor restoration;
5. `feature/adaptive-creation-and-recording` — chooser, Add draft, keyboard, personal audio and the
   approved recorder on tablet/phone;
6. `feature/adaptive-export-settings` — Export, project/recovery, settings and diagnostics;
7. `feature/responsive-mobile-acceptance` — target/device matrix, visual/accessibility/performance
   evidence and removal of obsolete breakpoint hacks.

Branches integrate sequentially. Resource-intensive browser/device/package validation runs through
the repository lifecycle owner with one lock, bounded stage timeouts, heartbeats, signal handling
and exact task-owned cleanup.

## Verification matrix

Automated and retained evidence includes:

- container/layout-state transition and presentation-state non-persistence tests;
- header priority/overflow tests proving no collision at every supported minimum width and 200% zoom;
- focus/inert/reading-order tests for rail, layers drawer, inspector and song surface;
- semantic viewport restoration across width, height, orientation and dynamic keyboard changes;
- pointer/touch drag, cancellation, full playhead hit area and no implicit playback;
- themed scrollbars, constrained-height overflow and no unreachable last item;
- screenshot baselines for light/dark wide, standard, compact, tablet portrait/landscape and phone;
- real touch/pen checks where available plus representative iOS/Android browser checks or explicitly
  documented unsupported boundaries;
- screen reader, keyboard-only, software keyboard, increased text, high contrast and reduced motion;
- memory, long-task, render-plan, waveform virtualization and audio-underrun budgets during resize,
  drawer transitions, recording and song playback.

## Definition of done

- Undo/Redo and every other header control never overlap the transport in the smallest supported
  window or at 200% zoom.
- The complete supported path is usable on desktop windowed/fullscreen, tablet and phone without a
  mouse-only or hover-only dependency.
- Layers, song, inspector and application navigation remain reachable, named and state-preserving
  in every presentation.
- Editors keep truthful two-axis/one-axis navigation, off-screen indicators, draggable playheads and
  per-brick semantic anchors.
- Record/Stop/Cancel/Use and failure recovery remain reachable during dynamic viewport, orientation
  and permission/device changes.
- Light/dark, scrollbars, dropdowns, focus, hover/active/disabled and motion use the shared design
  system; no component ships an unexplained local responsive skin.
- Layout state never dirties the project, enters Undo, alters playback/recording or changes exported
  audio.
- Stage 15 can audit one finite supported screen/device matrix with explicit residual limits rather
  than discovering unowned responsive work.
