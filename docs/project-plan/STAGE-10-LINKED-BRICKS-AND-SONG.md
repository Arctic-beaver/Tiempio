# Stage 10 — linked bricks and song composition

## Status and authority

**Status:** user-approved AS-TO-BE product and architecture baseline, 2026-08-13.

This document is the semantic authority for composing a song from reusable musical bricks. The
executable visual authority is
[`docs/tiempio_ux_prototype.html`](../tiempio_ux_prototype.html), state `06 Структура`.

Approved UI witnesses:

| Reference | Purpose |
| --- | --- |
| [Light state 06](../evidence/song-composition-visual-reference/light/06-linked-bricks-song.png) | Full light-theme composition surface |
| [Dark state 06](../evidence/song-composition-visual-reference/dark/06-linked-bricks-song.png) | Full dark-theme composition surface |
| [Visual-reference contract](../evidence/song-composition-visual-reference/README.md) | Production/prototype boundary and visible invariants |

The screenshots include the outer documentation harness. Only the rounded application window and
its contents belong to the product UI. This decision replaces the previous full-screen arrangement
concept for state 06; it does not redesign the other prototype states.

Recording a melody from the laptop or on-screen keyboard is a separately approved prerequisite in
[`STAGE-9B-PERFORMANCE-RECORDING.md`](STAGE-9B-PERFORMANCE-RECORDING.md). That plan owns exact
playhead capture, count-in, overdub, pressure/velocity, automatic commit and linear source growth;
this document owns how the resulting source brick is reused in the song.

The starter example, honest empty Start-from-sound contract and expanded drum-pattern catalog are
owned by [`STAGE-11-STARTER-CONTENT.md`](STAGE-11-STARTER-CONTENT.md). That phase runs only
after the architecture in this document works end to end.

One-file personal audio and microphone/input recording are owned by
[`STAGE-12-PERSONAL-AUDIO.md`](STAGE-12-PERSONAL-AUDIO.md). That phase explicitly
distinguishes a note-triggered sample instrument from a continuous imported/recorded audio phrase.
Its separate recorder screen requires a user-approved design review before implementation.

The dedicated audio-export workspace and current-revision WAV mixdown are owned by
[`STAGE-13-AUDIO-EXPORT.md`](STAGE-13-AUDIO-EXPORT.md). Export follows both this architecture
and the starter-content/personal-audio gates.

## Decision summary

Tiempio has two persistent concepts, not two application modes:

1. the upper workspace creates and edits a reusable **brick**;
2. the collapsible lower dock composes a **song** from linked instances of those bricks.

There are two playback entry points because the two surfaces answer different questions:

- upper Play asks, “how do my source bricks sound together now?”;
- lower Play asks, “how does the arranged song sound on its timeline?”

The UI needs no Song/Live mode switch. The active control and the surface containing it make the
playback contract explicit.

## Product model

### Layer and brick

For the first implementation, one layer owns exactly one brick and acts as its stable source
identity. The layer row visible in the approved UI is therefore also the draggable brick. It owns:

- role and human-readable name;
- the selected instrument and reproducible sound character;
- MIDI notes, drum events or another editable source phrase;
- explicit material duration;
- an optional trailing pause inside the repeating cycle;
- song-mix properties such as gain, pan, export inclusion and future advanced mute/solo.

The upper editor changes this single source. It never opens or edits a copied set of notes from the
song timeline.

`brickCycleTicks = materialLengthTicks + tailRestTicks`

Silence deliberately authored between events remains part of the material. `tailRestTicks` is the
separately visible pause after the material and repeats at the end of every cycle.

### Song instance

A song instance is one placement of a source layer/brick in the lower timeline. It owns only
arrangement data:

- stable instance ID;
- source layer ID;
- start position in song ticks;
- arranged duration;
- source offset used by left-edge trimming and split continuity.

An ordinary duplicate creates another instance that points to the same source layer. It does not
copy notes, drum events or instrument state.

An explicitly requested independent variation duplicates the complete source layer with a new
layer ID, then creates an instance referring to the new source. The baseline does not silently
unlink an ordinary duplicate.

### Ownership matrix

| State | Authority | Saved in `.tiempio` | Changes project revision |
| --- | --- | --- | --- |
| Source notes/events, sound, material length and cycle pause | `ProjectSession`, source layer | Yes | Yes |
| Instance start, arranged duration and source offset | `ProjectSession`, song instance | Yes | Yes |
| Song mix/export properties | `ProjectSession`, source layer | Yes | Yes |
| Which brick is selected, dock open/closed, manual source playhead and per-brick time/pitch viewport and zoom | Presentation state keyed by source layer | No | No |
| Musical-context inspector preference and compact drawer/sheet openness | User presentation preference plus transient editor chrome | No | No |
| Speaker-enabled bricks and independent upper-preview cursors | Brick preview session | No | No |
| Song playhead, audio clock and active voices | Engine | No | No |

The beginner-facing speaker icon must not dispatch the existing persistent `layer.mute.set` command.
Persistent song mix state may remain available through a later named mixer action, but it is a
different concern.

## AS-TO-BE user flow

The approved surface is shown in the [light](../evidence/song-composition-visual-reference/light/06-linked-bricks-song.png)
and [dark](../evidence/song-composition-visual-reference/dark/06-linked-bricks-song.png) references.

1. The user selects a layer/brick in the left list.
2. The upper editor displays that source's notes or drum pattern and its optional cycle pause.
3. The speaker includes or excludes the brick from upper preview; the pencil opens its sound
   character editor.
4. The user drags the layer row into the matching song lane in the lower dock.
5. Tiempio creates a linked instance. Repeating the drag creates another linked instance.
6. Moving, trimming, splitting or loop-resizing changes only the selected instance.
7. Editing the source notes, rhythm, sound or cycle pause updates the sound of every linked
   instance without changing their positions or arranged durations.
8. Lower Play schedules the complete song from the authored instance positions.
9. The dock can collapse to its labelled header without losing the song or stopping source editing.

Adding another brick follows the mandatory contextual-creation contract in
[`STAGE-7A-CONTEXTUAL-BRICK-CREATION.md`](STAGE-7A-CONTEXTUAL-BRICK-CREATION.md). The role card
appears inside the persistent brick zone, existing bricks remain selectable and no new source
exists canonically until final sound/kit confirmation.

The selected-instance inspector may offer `Split instance`, `Remove pause from cycle` and `Edit
source phrase`. The latter two are visibly source-wide operations and must say that every linked
instance will change.

## Two-dimensional source canvas and per-brick viewport memory

The upper melodic source editor is a two-dimensional musical canvas. Time runs horizontally and
pitch runs vertically. A viewport is never expected to show the complete duration and the complete
pitch range at once.

### Vertical pitch navigation

- The user may scroll freely toward higher or lower pitches with a wheel/trackpad, the shared
  vertical scrollbar, touch pan and keyboard-accessible navigation.
- The pitch keyboard/ruler stays aligned with the grid while scrolling vertically; the time ruler
  stays aligned while scrolling horizontally.
- Horizontal and vertical movement are independent. A two-axis trackpad or touch gesture may pan
  both, but page-level scrolling must not steal an active source-canvas gesture.
- Scrolling, panning and zooming change presentation only. They never extend source material,
  transpose a note, dirty the project or create Undo history.
- Pitch space remains bounded by the versioned musical pitch domain, but the visible portion is not
  clamped to the currently authored notes or the instrument's recommended range.

The first opening of a brick chooses a useful default: center the authored cluster nearest the
playhead or the recommended instrument range. It may fit the authored span only while rows remain
legible; a very wide pitch span is never compressed merely to show every note at once. After the
user pans or zooms, Tiempio does not silently auto-fit again. Explicit commands such as `Fit notes`,
`Show active notes` or `Return to playhead` may change the viewport predictably.

### Off-screen canonical-note indicators

The user must not mistake an empty visible pitch band for an empty brick. When canonical notes at
the currently visible time lie above or below the visible pitch range, the editor shows an
off-screen indicator in the corresponding top or bottom edge band.

The baseline interaction is an **edge ghost**, not a second editable note:

- it is derived only from an existing canonical source note whose time interval intersects the
  horizontal viewport and whose pitch lies outside the vertical viewport;
- its horizontal position and length mirror the source note, while its vertical position is
  projected into the nearest edge band;
- a low-emphasis outline/soft fill, fade and directional mark distinguish it from a real note,
  selection, scale guidance and future generative suggestions;
- activating it scrolls the nearest indicated note or cluster into view; it does not add, select,
  move or duplicate a note by itself;
- dense overlapping indicators aggregate into a quiet cluster/count instead of becoming an opaque
  row of capsules;
- accessible text reports facts such as `3 notes above the visible range`, and keyboard users have
  an equivalent `Show higher notes` or `Show lower notes` action;
- no indicator appears when no canonical note exists in that direction and visible time range.

If no off-screen note intersects the current time viewport but the brick contains notes above or
below at another time, a separate compact pitch-axis summary may report that whole-brick fact. It
must not draw a time-aligned capsule at a false position. Activating the summary navigates to the
nearest matching note or invokes an explicit fit/show command.

Opacity, edge-band height, clustering, whole-brick summary versus a thin pitch-density overview and
motion require a user-reviewed prototype delta before Stage 10C UI acceptance. The approved
screenshots remain geometry authority, but they do not yet authorize a particular ghost appearance.
Reduced-motion and high-contrast states may replace fades with a static outline and explicit
arrow/count.

These indicators do not reverse the note editor's earlier ban on unexplained decorative ghost
notes. They are navigation projections of saved notes, never suggested musical content.

### Viewport ownership and restoration

Every source brick owns an independent presentation viewport keyed by its stable source layer ID.
The minimum semantic snapshot contains:

```text
SourceViewportState
  sourceLayerId
  manualPlayheadTick
  timeAnchorTick
  pitchAnchor
  horizontalZoom
  verticalZoom
  followPreference
```

The store uses musical anchors and zoom scales rather than raw `scrollLeft`/`scrollTop` pixels so a
resize, DPI change or responsive layout restores the same musical area. The renderer may keep pixel
offsets as a transient cache, but they are not the authority.

- Leaving a brick snapshots both the horizontal time position and vertical pitch position.
- Returning to that brick restores its own snapshot immediately after layout measurement, without
  first flashing another layer's position or running a new auto-fit.
- A bass brick may therefore reopen around low pitches while a lead brick reopens two octaves
  higher, and each may retain a different time and zoom position.
- Every linked song instance of the same brick opens the same source viewport because instances do
  not own copied source editors.
- An explicit independent variation receives a new viewport identity. Its initial viewport may be
  copied once for continuity, then changes independently.
- The selected source, viewport map, follow preference and edge-ghost expansion are presentation
  state. They never enter `.tiempio`, render plans, project revision or Undo/Redo.
- Restoration during the currently open project session is mandatory. Optional target-local
  restoration after reopening may use bounded application storage keyed by project and source IDs,
  but must degrade to the default viewport without changing project data.

If source deletion, pitch-domain changes or responsive resizing make an old anchor invalid, the
viewport clamps to the nearest valid semantic range. During recording, engine time remains
canonical: switching or scrolling may change what is visible but never changes capture position.

## Playback contracts

### Manual source playhead and engine preview cursors

The vertical line in a brick editor has two explicit authorities, never one global transport tick:

1. while that brick is not sounding in upper preview, it shows the brick's manually positioned
   source playhead from presentation state;
2. while that brick is enabled and sounding in upper preview, it shows the engine-acknowledged
   local preview cursor for that source layer.

The manual position is retained independently for every source brick and is the exact target used
by source-local actions such as Record. It does not dirty the project. The moving preview cursor is
transient engine state and exists only while that source is actively included in upper preview.

Disabling the brick speaker releases its preview voices and removes its moving cursor. Its static
manual playhead may remain visible and draggable, but it must not continue to advance. Re-enabling
the brick while preview is running creates a new engine cursor at source tick zero as specified
below; it never adopts another brick's phase or the global song position.

The lower song playhead remains a third, separate cursor on song time. A source editor must not
pretend that one upper line can represent song playback when several instances of the same source
may be active at different phases.

### Independent preview timing

`BrickPreviewSession` retains an engine cursor snapshot per enabled source layer. The minimum
snapshot is conceptually:

```text
BrickPreviewCursorSnapshot
  sourceLayerId
  previewGeneration
  running
  localTick
  cycleIteration
  engineFrame
  renderPlanRevision
  sequence
```

Every brick has its own start frame, local phase and cycle iteration. If Drums began first and Bass
or Melody was enabled later, their vertical lines may truthfully show entirely different positions.
The current baseline project tempo map still determines tick speed; independence means cursor phase
and start time, not an accidental second BPM authority.

The renderer interpolates each running cursor from its trusted engine frame and the negotiated
clock rate, then corrects against newer sequence/revision-bound snapshots. It never animates from a
single global `engine.tick`, React timers or the selected layer's local mount time. A stale snapshot
or snapshot from an earlier preview generation cannot restart a stopped/disabled line.

The cursor advances through authored material and the explicit cycle pause, then wraps at the exact
brick cycle boundary. A source edit that changes the cycle is revision-bound and normalizes the
next trusted cursor without moving another brick. If audio is unavailable, the line stays static
with the existing actionable audio state; the UI does not fake playback motion.

### Direct playhead manipulation

The line is a continuous source-time control, not a collection of beat-boundary buttons:

- the complete visible line from top to bottom is draggable, including its middle; the decorative
  top handle is not the only hit target;
- an invisible interaction width larger than the hairline supports mouse, pen and touch without
  visually thickening the line;
- pointer capture keeps the gesture alive when the pointer leaves the line or grid;
- horizontal movement maps continuously through the current scroll and zoom to a bounded integer
  source tick, in either direction;
- the line follows the pointer during the gesture and may auto-scroll the time viewport near its
  left or right edge;
- ordinary playhead placement does not snap to the edges of visible grid rectangles. Optional
  snapping applies only when the user explicitly enables or invokes it;
- clicking an empty ruler/grid position may place the manual playhead at that exact tick, while
  note bodies and resize affordances retain their own gesture priority;
- moving the playhead changes presentation only: no project revision, dirty state, render-plan
  publication or Undo entry is created;
- moving a stopped or speaker-disabled brick never starts playback, audition or recording.

If the selected brick is already running in upper preview, grabbing its moving line temporarily
suspends only that brick's preview voice/cursor for the baseline non-scrub gesture. On successful
release, the engine performs one source-local seek and resumes that brick only because it was
already running; all other brick cursors continue undisturbed. Cancel restores the original trusted
cursor and running state. Continuous audible scrubbing is a separate future feature and must not be
simulated by flooding the engine with seeks.

The control is keyboard and assistive-technology reachable. Its accessible value exposes musical
time, and Home/End plus fine/coarse Left/Right commands move the manual source tick without
colliding with note editing or performance keys. Pointer cancellation, blur, resize and unmount
either commit the last valid presentation tick once or restore the gesture origin; they cannot
leave a fake running cursor.

### Upper brick preview

The upper transport and layer speakers operate a transient brick-preview session:

- pressing upper Play starts every enabled brick at the beginning of its own cycle;
- a brick enabled while preview is already running starts immediately from its own beginning;
- disabling a brick releases only that brick's active preview voices;
- disabling and enabling it again always creates a new preview cursor at source tick zero;
- each enabled brick loops by its own cycle length and does not seek to another brick's phase;
- speaker state does not dirty the project and does not mute or move song instances.

### Lower song playback

Lower Play uses the engine-owned song transport:

- instances start only at their authored song positions;
- each instance reads the current content of its referenced source layer;
- changing upper speaker state has no effect on scheduled song instances;
- seek, stop and restart use song time rather than any upper-preview cursor;
- the song remains synchronized even when several instances reference cycles of different lengths.

Starting lower song playback stops upper brick preview before starting the song transport. Starting
upper preview stops song playback before creating preview cursors. This is audio-authority
exclusion, not a visible application mode.

## Looping, trimming, splitting and pauses

### Loop-resize

Dragging an instance's right edge changes `durationTicks`:

- a duration shorter than the remaining source cycle is a local trim;
- a longer duration repeats the source cycle immediately and gaplessly;
- the last repetition may be partial and ends exactly at the instance boundary;
- there is no time-stretch and no automatic bar-aligned gap;
- snapping is an optional placement aid, not part of playback semantics.

At instance-local tick `t`, source phase is:

`(sourceOffsetTicks + t) mod brickCycleTicks`

Events are audible during the material portion. The trailing pause is silent and then phase returns
to zero. A valid brick cycle is always greater than zero, including for an empty musical brick.

### Move, left trim and split

- Moving an instance changes only `startTick`.
- Trimming from the left changes `startTick`, `durationTicks` and `sourceOffsetTicks` so the audible
  source phase at the new boundary is preserved.
- Splitting at local tick `d` creates two linked instances. The right instance starts at
  `startTick + d` and uses `sourceOffsetTicks + d`; playback is unchanged at the moment of split.
- Source offsets remain stored as authored values. Playback normalizes them by the current cycle
  length, so later source-duration edits never require rewriting instance-local data.

### Source-duration edits

Changing material duration or the internal pause:

- updates the cycle used by every linked instance;
- keeps every instance's start and arranged duration unchanged;
- keeps every stored source offset unchanged;
- recalculates repeat markers and the final partial cycle;
- never pushes later instances along the song timeline implicitly.

Empty space between instances is an arrangement gap. It is unrelated to the pause authored inside a
brick and is not repeated by loop-resize.

## Layer controls and accessibility

The unexplained `S` and `M` letters are removed from the beginner-facing layer list. Their
conventional Solo/Mute meanings do not express the approved workflow.

- Speaker toggles inclusion in upper preview and has an accessible pressed state.
- Speaker-off has an explicit label such as `Include Harmony in brick preview`; it is not conveyed
  by color alone.
- Pencil opens sound-character editing for the source layer.
- Solo may return later as a named advanced action; it is not a primary icon in this baseline.
- Dragging has keyboard-accessible equivalents: add instance, move by grid step, resize, split and
  delete.
- Focus remains on a predictable control after collapsing the dock or deleting an instance.

The dock toggle, lower Play and selected-instance actions must remain reachable in light/dark
themes, constrained height, 200% zoom and keyboard-only navigation. All scrollable surfaces use the
shared application scrollbar treatment.

## Target project schema

The current schema combines source material and arrangement placement in `ProjectLayer.clips[]`.
That boundary cannot implement linked instances correctly and must change before the composition UI
is wired.

The target schema is conceptually:

```text
ProjectDocument
  layers[]
    id                         # stable brick/source identity
    role, name
    gain, pan, muted, solo, exportIncluded
    source                     # reproducible instrument or drum kit
    material
      kind: midi | drum
      materialLengthTicks
      tailRestTicks
      notes[] | pattern + events[]
  song
    instances[]
      id
      sourceLayerId
      startTick
      durationTicks
      sourceOffsetTicks
```

Names in code may differ after the Stage 9 domain review, but these ownership boundaries may not:
source musical data exists once, instances contain no copied musical events, and preview speaker
state is outside the saved project.

### Domain commands

Commands must express the ownership boundary directly:

- source commands edit notes/events, instrument character, material length or trailing pause;
- `song-instance.place`, `move`, `resize`, `split` and `delete` edit arrangement data only;
- `layer.duplicate-as-variation` creates a new source identity explicitly;
- upper-preview enable/disable and start/stop are engine/presentation commands, not project
  commands;
- song transport commands remain engine commands derived from the latest validated project
  revision.

Pointer drag may show a transient projection, but pointer release, keyboard step or cancel produces
at most one validated project command. Undoing a source edit restores the source once and all linked
projections follow automatically. Undoing an instance edit affects only that instance.

### Current-only source cutover

The source/instance boundary replaces the clip-owned shape atomically:

- a new empty layer owns one empty source brick and no song instance;
- adding authored material creates source events and an explicit instance;
- duplication stays linked unless the user explicitly creates a variation with new source identity;
- instrument, role, gain, pan, mute, solo and export state live on the current source layer;
- collision checks run before every commit;
- validation failure leaves the current archive unopened rather than saving a partial document;
- non-current project data is rejected and never converted on load.

## Render plan and engine boundary

The render plan must preserve the same separation instead of flattening repeated source events into
unbounded copied arrays.

The next render-plan version carries:

- a bounded source program per playable layer: resolved patch, material events and cycle length;
- bounded song instances referring to source layer IDs;
- song mix and transport data;
- stable project revision and version identifiers.

The engine song scheduler derives repeated events from each instance's start, duration and source
offset. It creates stable runtime voice/event identities from instance ID, source event ID and
iteration without allocating in the audio callback.

Brick preview uses the same compiled source programs but a separate keyed preview scheduler. Each
preview cursor has its own start frame and cycle phase. It must not emulate the required behavior by
seeking the shared song transport or by mutating the project render plan on every speaker click.

All lists and durations retain explicit ceilings. A plan exceeding layer, instance, source-event,
song-duration or per-block scheduling limits is rejected with a stable actionable diagnostic before
it reaches the real-time callback.

## Required edge cases and failure policy

- Empty material remains placeable and silent; its positive cycle comes from explicit material
  length and optional pause, not from the last event.
- A note or event outside material bounds is rejected at the command boundary.
- A zero/negative cycle or instance duration is rejected.
- A dangling source-layer reference is rejected on command and archive load.
- Overlapping instances are allowed and mix predictably within engine voice ceilings.
- A partial final cycle ends without changing tempo, pitch or source content.
- Deleting a source with instances asks to delete its placements too or cancels; it never leaves
  dangling instances.
- An explicit variation gets new source, note/event and instance IDs; an ordinary duplicate remains
  linked.
- A source cycle shortened below a stored offset remains valid because phase is normalized at
  playback without modifying that instance.
- A project edit while an older render plan compiles cannot activate the stale plan.
- Engine restart reloads the latest plan and clears transient preview cursors; it does not alter the
  song.
- Song start during preview and preview start during song playback release the previous authority's
  voices without stuck notes or double playback.
- Pointer cancellation, window blur and React remount cannot commit a partial drag twice.
- Opening Add in a non-empty composition cannot route to the empty-project surface, hide existing
  bricks or create a provisional canonical source before final confirmation.
- Selecting an existing brick while creation is active suspends only draft audition; source editor,
  song dock and draft progress remain truthful and independently recoverable.
- The current provisional source line reads one global transport tick or accepts only ruler-marker
  seeks; Stage 10 must replace that boundary rather than reuse it for per-brick preview.
- Enabling Drums, Bass and Melody at different wall-clock times produces independent source cursor
  phases; selecting another layer never copies or resets any running cursor.
- Disabling one speaker freezes/removes only that source's moving line and voices while other
  enabled cursors continue; re-enable starts that source from zero.
- Dragging the full-height line left/right follows the pointer continuously between grid boundaries,
  captures the pointer safely and never starts playback for an idle/disabled source.
- A drag during active preview seeks/resumes only the previously running source on release and never
  changes the song playhead or other brick phases.
- A brick with notes only above or below the current pitch viewport always exposes a truthful
  directional indicator for the visible time range.
- Dense off-screen notes aggregate without hiding the first/last visible pitch row or becoming
  editable duplicate notes.
- Switching rapidly among bass, lead and drums cannot leak one source's time/pitch/zoom viewport
  into another source or create a project revision.
- Resize, DPI, responsive-layout and 200% zoom changes restore semantic time/pitch anchors rather
  than stale pixel offsets.

## Implementation order

This is an architectural change, not a UI-only addition. Stage 6 finishes its Web runtime contract
without absorbing this scope. Stage 7 first makes creation and audition context-safe. Stage 8 then
freezes the reviewed perceptual catalog, patch model and macro mappings so new sources do not persist
provisional unpleasant sounds. Stage 9 establishes the source/instance boundary, open brick
canvas and performance recording. Stage 10 builds referenced scheduling, preview and song
composition on those authorities. Stages 11–14 add starter content, personal audio, export and
application-wide responsive adaptation; Stage 15 accepts the combined Desktop/Web product.

The current non-main task branch is the integration branch unless the user selects another base.
For this large change, each stage uses its own branch and is merged back only after its stage exit
criteria pass.

### Stages 7–9 prerequisites — creation, sound-quality freeze, domain and recording

**Detailed plan:**
[`STAGE-9B-PERFORMANCE-RECORDING.md`](STAGE-9B-PERFORMANCE-RECORDING.md).

Before that plan starts, contextual creation is completed under
[`STAGE-7A-CONTEXTUAL-BRICK-CREATION.md`](STAGE-7A-CONTEXTUAL-BRICK-CREATION.md), followed by
[`STAGE-7B-FOCUS-SAFE-AUDITION.md`](STAGE-7B-FOCUS-SAFE-AUDITION.md). Stage 10 reuses the coordinator and never restores global
empty-project Add navigation. The next gate is the complete SQ-A through SQ-F plan in
[`STAGE-8-PERCEPTUAL-SOUND-QUALITY.md`](STAGE-8-PERCEPTUAL-SOUND-QUALITY.md); only after its
catalog/patch freeze does the source-material branch begin.

- introduce current source material and song-instance types with opaque IDs and bounded validation;
- replace clip-owned persistence before enabling recording and regenerate archive/recovery fixtures;
- record laptop/touch performance into canonical source material with engine-clock timing;
- establish source commands, open-ended material range, grouped Undo and MIDI-ready velocity input;
- retain compatibility projections only where required before the Stage 10 song UI, never as a
  second saved authority.

**Exit:** `ProjectSession` stores source material once, stores placements separately, accepts only
current fixtures and records directly into the reusable source. No command copies source
events during ordinary placement.

### Stage 10A — render plan and scheduling

**Suggested branch:** `feature/linked-bricks-render-plan`.

- version shared TypeScript/Rust render-plan schemas;
- compile source programs and referenced song instances from one project revision;
- schedule gapless cycles, source offsets, partial final cycles and overlaps in Rust;
- enforce plan and real-time ceilings without callback allocation;
- run the same protocol fixtures against native and Web/WASM adapters.

**Exit:** deterministic offline and adapter tests prove that source edits affect every linked
instance while placement edits remain local.

### Stage 10B — brick preview runtime

**Suggested branch:** `feature/brick-preview-runtime`.

- add an application-owned `BrickPreviewSession` and engine commands keyed by source layer;
- implement generation/revision-bound per-source preview cursor snapshots and renderer
  interpolation rather than reusing global song `engine.tick`;
- implement independent preview cursors, source-local suspend/seek/resume and
  start-from-zero-on-enable behavior;
- make preview and song playback mutually exclusive audio authorities;
- keep speaker state transient and separate from persistent song mute/solo;
- cover stop, disable, re-enable, device recovery, blur and engine restart.

**Exit:** multiple unequal brick cycles preview with truthful independent lines, every late enable
starts from zero, disabling one stops only its line/voices, and no preview action changes the
project revision or song render plan.

### Stage 10C — shared composition UI

**Suggested branch:** `feature/song-composition-ui`.

- project the approved upper source editor and collapsible lower dock from real state;
- retain the shared inline Add-brick draft inside the real source list and adapt its atomic final
  commit to current source material without adding a second creation path;
- integrate the already implemented Record transport, live source notes and performance-keyboard
  dock without changing their Stage 9 semantics;
- replace `S`/`M` with the shared speaker and pencil controls;
- implement drag and keyboard placement, move, trim, split, loop-resize and selection inspector;
- show cycle pause, repeat boundaries, linked status and source-wide consequences clearly;
- implement synchronized two-axis source scrolling, edge indicators for vertically off-screen
  canonical notes and a presentation viewport store keyed by stable source layer ID;
- restore each brick's semantic time, pitch and zoom anchors when layer or linked-instance editing
  switches the active source;
- replace the marker-only/global-transport playhead with one full-height source-time control whose
  enlarged hit region supports continuous bidirectional pointer/touch drag, exact click placement,
  edge auto-scroll and keyboard-accessible tick movement without implicit playback;
- display the manual source playhead while idle/disabled and the selected source's own trusted
  engine cursor only while that source is running in upper preview;
- retain the named/grouped Undo/Redo contract and place real `Октава ниже/выше` actions only in
  selected-note context; do not restore bare disabled `±8va` glyphs to the global top bar;
- reuse one labelled triangle/chevron disclosure pattern for the right musical-context inspector
  and lower song dock while keeping their state independent. The collapsed inspector returns its
  width to the canvas, remains reopenable from a narrow rail and becomes an overlay drawer/sheet on
  constrained layouts; essential selected-note actions remain reachable outside it;
- share themed controls, dropdowns, focus behavior and scrollbars across Desktop and Web.

**Exit:** every enabled action in the approved light/dark UI has one real handler and the dock works
at constrained height and keyboard-only navigation. Bass/lead switching restores independent
source viewports, and an empty visible pitch band cannot hide the existence of notes above or below.
The line can be grabbed anywhere, follows the pointer between grid boundaries and never advances
from another brick's or the song's transport tick. History and pitch-transpose actions remain
visually separated, fully named and truthful about their scope and availability. The inspector and
song dock can be opened and collapsed in every combination without changing one another, playback,
recording or the current source viewport.

### Stage 10D — end-to-end integration and durability

**Suggested branch:** `feature/linked-bricks-integration`.

- connect source editors, song projections, render-plan publication and stale-revision protection;
- verify current-only save, reopen, recovery and undo/redo through both target runtimes;
- replace obsolete clip-placement demo state and remove compatibility shims no longer needed;
- add the complete first-hour path through creating a brick, placing it twice, editing it and playing
  the song;
- verify per-source viewport restoration through layer selection, `Edit source phrase`, linked
  instances, recording follow, target resize and project-session teardown.
- verify independent cursor phases, disabled-source stillness, stale-generation rejection and
  full-line seek gestures through rapid enable/disable/select/drag sequences.

**Exit:** packaged Desktop and production Web reopen the same linked composition with the same
sound, source content, instance positions and cycle behavior.

### Stage 11 — empty starts, example song and rhythm library

**Detailed plan:**
[`STAGE-11-STARTER-CONTENT.md`](STAGE-11-STARTER-CONTENT.md).

This phase starts only after Stage 10D exits. It removes production placeholder notes/events from
`Новый трек` and `Начать со звука`, adds a separate `Начать с примера` Home action backed by an
immutable bundled template and a fresh user-project copy, authors one original complete song using
real linked sources/instances, and expands the four retained drum patterns with six distinct
curated additions.

**Exit:** blank/sound-first projects are musically empty; the example is an independently editable,
saveable, rights-documented current project; and the ten-pattern library passes deterministic,
cross-target, listening and editability acceptance without catalog updates mutating saved work.

### Stage 12 — personal audio: `Мой звук` and `Запись`

**Detailed plan:**
[`STAGE-12-PERSONAL-AUDIO.md`](STAGE-12-PERSONAL-AUDIO.md).

After starter-content acceptance, make the existing `Мой звук` role real. A selected WAV becomes
either `Инструмент из звука` with empty MIDI material or `Аудиофраза` preserving a hummed/played
performance as fixed audio. Add a separate `Запись` role that captures microphone/audio input into
the same phrase model through a dedicated screen.

Before recorder implementation, discuss and approve that screen with the user and update the
repository prototype/UI witness. Record/Stop/retry/Use, count-in, monitoring, input/meter,
standalone versus in-context capture, take retention, shortcuts and responsive states are explicit
approval items rather than engineering defaults.

**Exit:** imported and captured audio create portable linked source bricks through one grouped
commit, retain no external path dependency, never invent MIDI notes, work in fixed-time song
instances and pass Desktop/Web permission, clock, audio, durability and cleanup evidence.

### Stage 13 — dedicated audio-export workspace and WAV mixdown

**Detailed plan:**
[`STAGE-13-AUDIO-EXPORT.md`](STAGE-13-AUDIO-EXPORT.md).

After starter-content and personal-audio acceptance, add `Экспорт` as a first-class destination in the outer left
navigation rail. It captures the current in-memory project revision and finite song range, then
renders the lower song arrangement through the shared offline DSP core to a stereo WAV. Export
ignores upper preview speaker/cursor state, excludes reference sources and keeps Desktop-native file
ownership separate from bounded Web handle/Download behavior.

**Exit:** packaged Desktop and production Web export the complete original example song and edited
user songs as valid deterministic WAV files with revision-bound progress, cancellation, typed
failures and exact task-owned cleanup.

### Stages 14–15 — responsive adaptation, acceptance hardening and evidence

**Detailed plans:**
[`STAGE-14-RESPONSIVE-MOBILE.md`](STAGE-14-RESPONSIVE-MOBILE.md) and
[`STAGE-15-ACCEPTANCE-HARDENING.md`](STAGE-15-ACCEPTANCE-HARDENING.md).

Stage 14 applies the shared responsive contract without creating alternate product models. Stage 15
does not redesign the model; it audits the combined result of Stages 0–14:

- Stage 9 recording remains engine-clock timed, automatically grouped and source-only after the
  composition UI is integrated;
- the frozen perceptual catalog retains objective alias/loudness/macro/stereo evidence, blind
  desire-to-use approval and native/Web parity inside linked
  brick preview and song playback;
- shared source/instance contract and current-only load evidence;
- Desktop/Web engine parity for preview and song playback;
- loop, trim, split, pause, overlap and stale-plan scenarios;
- project limits, timing, callback and memory budgets;
- approved light/dark visual witnesses plus compact, ultrawide, constrained-height and 200% zoom;
- independent musical-context-inspector/song-dock disclosure, focus recovery and usable canvas
  width in desktop-column, collapsed-rail, tablet-drawer and phone-sheet presentations;
- two-axis source scrolling, off-screen-note indicators and per-brick semantic viewport restoration;
- independent engine-authoritative brick cursors, speaker-disabled stillness and continuous
  full-line playhead manipulation without implicit playback;
- zero-placeholder New/Start-from-sound paths, fresh-copy example loading, original-content
  provenance and all ten editable drum patterns;
- explicit imported-audio intent, user-approved recorder flow, fixed-audio timing, portable assets,
  input permissions/clock diagnostics and no hidden transcription;
- dedicated Export navigation, captured-revision mixdown, reference exclusion, WAV correctness,
  native/Web offline parity and cancellation/cleanup;
- keyboard, screen-reader, focus and reduced-motion walkthrough;
- machine-readable mapping from every criterion below to a test or retained witness.

## Verification matrix

| Boundary | Required evidence |
| --- | --- |
| Domain | Unit/property tests for IDs, bounds, source edits, local instance edits and command undo |
| Current-only loading | Current fixtures for zero, one and multiple instances; deterministic bytes after resave |
| Compiler | Stable source/instance plan ordering, revision binding and ceiling failures |
| Rust engine | Offline samples/events for unequal cycles, offsets, partial loops, splits and overlaps |
| Runtime parity | Identical protocol scenarios through native and Web/WASM adapters |
| Sound quality | Frozen catalog manifest, mathematical defect/macro profile, blind level-matched preference and old-patch reproduction |
| Preview | Late-enable starts at zero; disable/re-enable releases voices; project revision unchanged |
| Preview cursors | Per-source generation/revision snapshots interpolate independently; disabled/stale cursors never move |
| Song | Seek/play/stop schedule authored positions and ignore the preview-enabled mask |
| Persistence | Save/reopen/recovery preserve links and never serialize preview cursors |
| Presentation state | Bass/lead retain independent semantic time/pitch/zoom anchors; switching and scrolling create no project revision |
| Pitch navigation | Wheel/trackpad/touch/keyboard scroll; sticky axes stay aligned; edge ghosts truthfully reveal canonical notes above/below |
| Playhead interaction | Whole line hit target, continuous left/right drag, exact placement and keyboard tick movement; idle move never starts playback |
| Progressive disclosure | Inspector and song dock toggle independently; the labelled reopen control remains reachable; focus and semantic viewport anchors survive every transition |
| Empty start | New/Start-from-sound contain zero authored notes, drum events and song instances until an explicit content command |
| Starter example | Immutable hash-validated template creates fresh project identity, empty initial Undo history and an ordinary saveable current session |
| Drum patterns | Four retained plus six new patterns have versioned editable events, distinct mathematical profiles and cross-tempo/kit listening evidence |
| Personal audio | Sample instrument versus phrase is explicit; imported/captured phrase timing is fixed; recorder design is approved; assets, permissions, clocks, save/reopen and cleanup pass on both targets |
| Audio export | Current revision/range captured once; valid PCM24/PCM16 WAV; reference/preview exclusion; native/Web parity and exact cancel cleanup |
| UI | Approved screenshots plus reviewed ghost delta, constrained height, 200% zoom, keyboard actions and focus recovery |

Resource-intensive full validation must run sequentially under the repository's fail-fast lifecycle
owner with one lock, bounded stage timeouts, heartbeats, signal handling and exact task-owned process
cleanup. Focused checks run on each stage branch before it is merged into the task integration branch.

## Definition of done

- Adding a source inside a non-empty project preserves the real brick list and current work;
  resumable role/sound choices remain transient until one atomic final commit.
- The canonical schema and architecture distinguish one source brick from its many song instances.
- All source edits propagate through references without rewriting instance-local placement data.
- Ordinary duplication stays linked; independent variation is explicit and receives new identities.
- Upper preview and lower song playback satisfy their separate, tested contracts without a mode
  switch.
- Every enabled brick cursor follows its own engine phase, every disabled brick remains still, and
  dragging any part of the line seeks only the intended source without implicit playback.
- Loop-resize is gapless repeat, not stretch; source pause and arrangement gap remain distinct.
- Current projects save, reopen and recover deterministically; non-current data is rejected.
- Native and Web/WASM engines consume the same versioned render plan and pass the same scheduling
  scenarios.
- Every enabled approved UI action is real, accessible and truthful in light/dark and constrained
  layouts.
- Every retained built-in sound remains desirable, role-appropriate and technically clean in both
  upper brick preview and the lower song mix; Stage 10 does not retune the frozen catalog.
- `Начать со звука` contains no hidden authored material, while `Начать с примера` opens a separate
  original, rights-documented song that teaches the same linked-bricks architecture without a
  demo-only model or autoplay.
- Straight, Sparse, Driving and Broken plus six curated additions remain distinct, editable and
  stable after a pattern is copied into a user project.
- `Мой звук` never confuses a keyboard sample with a hummed/played audio phrase; `Запись` uses the
  separately user-approved capture screen and produces the same portable phrase source only after
  explicit take confirmation.
- The separate Export destination renders the current song revision through the same offline DSP
  authority on Desktop and Web; it never exports upper preview state or presents Save/Download
  project data as rendered audio.
- The optional musical-context inspector never traps essential commands or permanently consumes
  note-canvas width; its personal preference is not serialized as project content.
- Every brick restores its own time, pitch and zoom viewport, and vertically off-screen canonical
  notes remain discoverable without being represented as editable or suggested duplicates.
- Stage 15 evidence maps every criterion to an executable test or retained UI/runtime witness.
