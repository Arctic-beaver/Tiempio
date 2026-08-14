# Pre-Phase-6 product gate implementation plan

## Status and scope

This plan implements the approved items D-001 through D-005 in
`PRE-PHASE-6-PRODUCT-DISCOVERY.md`. Stage 6 is explicitly outside this task: no Web AudioWorklet,
WASM engine, Web persistence expansion or other Stage-6 work is authorized by this plan.

The integration branch is `feature/note-editor-acceptance`. This is a large task. Each implementation
stage uses one sequential stage branch created from the updated integration branch, produces atomic
English commits, passes its focused gates, and merges back before the next stage branch is created.
No worktree, push, pull request, merge to `main` or `.github/workflows` change is authorized.

## Expected product outcome

- one song-wide major/minor palette drives truthful scale-aware performance input;
- exactly seven compact keys and an explicit full A-Z surface support physical, pointer and
  multi-touch audition without recording project notes;
- palette, chord and sound previews are bounded, cancellable and engine-owned;
- Sound Chooser uses a truthful `Hear sound` action rather than project transport;
- the approved orange SVG wave reacts to confirmed output energy and becomes idle without ongoing
  animation work;
- the native engine schedules one optional sample-aligned metronome from project tempo and meter;
- bars, beats and grid are visually distinct and the Piano Roll ruler can seek;
- every application dropdown uses one collision-safe themed overlay treatment.

## Existing architecture to preserve

- `ProjectSession` remains the sole project-content authority.
- `transport.key` remains the saved song palette. Applying another palette is a project command but
  does not transpose existing notes.
- rotation, octave, held inputs, open panels, preview state, metronome enablement and metronome
  volume are presentation/runtime preferences, not Undo/Redo entries.
- the native engine owns audio scheduling, transport and metronome timing.
- shared application and design-system packages do not import Desktop or Web adapters.
- no raw samples, FFT arrays or renderer-timed metronome clicks cross the runtime boundary.
- the current project schema already owns key and meter data; palette input uses that shape directly.

## Approved interaction constants

- compact physical row: `KeyA KeyS KeyD KeyF KeyG KeyH KeyJ`;
- expanded rows: `KeyQ-KeyP`, `KeyA-KeyL`, `KeyZ-KeyM`;
- tonic starts at the first compact control and rotates only through explicit left/right actions;
- physical events use `KeyboardEvent.code`; visible local layout labels are optional enhancement;
- performance input is active only while an explicit surface owns focus;
- pointer notes use press/release with capture; sliding does not transfer a held note;
- live performance does not record into the Piano Roll;
- metronome is off by default with one click sound and bounded volume;
- `4/4` opens explanation, not meter editing;
- `Hear sound` is a 2-3 second palette-aware phrase above the reactive wave;
- wave deformation requires confirmed engine energy and reduced-motion disables deformation.

## Dependency sequence

1. collision-safe overlays;
2. deterministic song-palette theory;
3. shared performance input ownership;
4. bounded engine-owned previews;
5. Song Palette and performance surfaces;
6. truthful sound demo and reactive wave;
7. native sample-aligned metronome;
8. transport/ruler UI;
9. combined acceptance.

## Stage A - collision-safe overlay foundation

**Branch:** `fix/collision-safe-overlays`.

### Work

- add a pure placement function that prefers below, flips above, shifts horizontally and caps
  available height inside a safe inset;
- add an application-owned overlay host and portal boundary that can remain inside the active modal;
- recalculate against anchor, viewport and scroll changes while open;
- treat trigger and portalled panel as one outside-click boundary;
- preserve listbox keyboard behavior, focus restoration, `aria-controls` and selected-option scroll;
- migrate every current `Select`, and make `Popover` consume the same geometry contract;
- preserve semantic theme, elevation, shared scrollbars and minimum touch targets.

### Verification and exit

- pure geometry covers below, above, constrained height, horizontal shift and missing anchors;
- interaction state covers Escape, Tab, language rerender, option choice and portalled outside click;
- Language, Appearance and Context sound selects remain reachable in compact/constrained layouts;
- no clipping ancestor owns the options panel.

## Stage B - song palette and music-theory domain

**Branch:** `feature/song-palette-domain`.

### Work

- implement platform-neutral pitch-class, major/natural-minor scale and chord functions;
- provide musically truthful sharp/flat spellings for all supported tonics;
- generate compact and full physical mappings from palette, tonic MIDI pitch, register and rotation;
- generate deterministic Home/Lift/Tension beginner chord suggestions with technical names;
- project the canonical `transport.key` into top bar, Piano Roll and palette view models;
- remove hard-coded A-minor harmony presentation;
- keep drums/reference sources outside pitched palette controls.

### Verification and exit

- all 24 tonic/mode palettes contain exactly seven unique degrees and the tonic;
- rotation preserves cyclic order and exactly one compact occurrence of every degree;
- generated MIDI values remain within 0-127 and cross octaves correctly;
- flat keys never become accidental all-sharp aliases;
- applying `transport.key.set` survives round-trip and leaves every existing note unchanged.

## Stage C - shared performance input core

**Branch:** `feature/performance-input-core`.

### Work

- replace the controller's fixed A-L map with a subscribable performance-input session;
- model each physical key, pointer and automatic preview as a bounded source identity;
- source-count held pitches so releasing one source cannot clear another;
- expose note-on, note-off, source release and release-all through one engine command boundary;
- add scoped physical keyboard ownership and ignore editing fields, composition and modifiers;
- add pointer capture, independent touch pointers and primary-mouse filtering;
- release held sources before palette, rotation, octave, instrument or audio state changes;
- make octave and rotation presentation state without project history.

### Verification and exit

- English, Russian, Spanish and non-Latin event labels produce identical `code` mappings;
- physical, mouse and multiple touches share visual state without early note-off;
- cancel, lost capture, blur, visibility loss, device loss and remap leave no held source;
- performance shortcuts never steal text entry, Settings capture or focused Piano Roll arrows.

## Stage D - engine-owned audition previews

**Branch:** `feature/audition-preview-engine`.

### Work

- add versioned bounded start/cancel preview commands and preview lifecycle events;
- validate maximum duration, event count, chord size, pitch, velocity and identifier sizes;
- prepare preview schedules off the realtime callback and execute them from the engine clock;
- keep preview transport-independent and cancel it on playback, manual input or configuration change;
- expose accepted preview pitch state and existing bounded meter snapshots to the application;
- add one application preview coordinator with mutual exclusion for palette, chord and sound demos.

### Verification and exit

- preview timing never depends on React or renderer timers;
- cancellation ordering cannot leave a voice or visual key held;
- preview never changes playhead, project revision, dirty state or history;
- malformed/oversized programs fail closed in TypeScript and Rust;
- host restart and device loss clear preview ownership.

## Stage E - Song Palette and reusable performance surfaces

**Branch:** `feature/song-palette-surface`.

### Work

- build one `PerformanceKeyboard` for compact and expanded layouts;
- render pitch as primary label and physical/local key as secondary label;
- implement rotation, octave, Full keyboard, held, tonic and current-chord states;
- build one collision-safe Song Palette panel shared by onboarding and project editing;
- insert palette selection after `Use sound` in first-sound flow;
- add the quiet project top-bar palette chip and `Existing notes will not move` truth;
- add a project Play drawer using the same input/session component;
- provide palette and chord preview actions through the shared coordinator.

### Verification and exit

- compact view always has exactly seven usable controls with no clipping or fillers;
- expanded view preserves Q-P/A-L/Z-M rows and 48x48 CSS-pixel touch targets;
- palette preview and chord suggestions agree with visible labels and selected instrument;
- applying another palette is undoable project intent but does not transpose existing notes;
- Light, Dark, forced-color, compact and tablet layouts keep non-color role signals.

## Stage F - truthful sound demo and reactive wave

**Branch:** `feature/sound-demo-and-wave`.

### Work

- remove compact project `TransportBar` from Sound Chooser;
- add visible `Hear sound` / `Stop demo` with palette-aware accessible naming;
- keep `Hear sound`, manual keys and `Use sound` as distinct actions;
- drive the same screen keys from automatic sound-demo preview events;
- convert the existing SVG paths into a bounded pure deformation model;
- combine smoothed meter energy with held/released state, without raw samples or FFT;
- stop animation frames when settled/hidden and provide reduced-motion opacity-only behavior.

### Verification and exit

- sound demo never changes project transport, notes, revision, dirty state or history;
- manual input, navigation, another preview and audio loss cancel it completely;
- wave paths remain finite and bounded for silence, peaks, chords and release tails;
- unavailable audio cannot produce full motion;
- idle and hidden surfaces retain no animation frame or meaningful CPU work.

## Stage G - native sample-aligned metronome

**Branch:** `feature/engine-metronome`.

### Work

- version the engine render plan to carry the bounded project meter map;
- update schema, generated protocol, TypeScript/Rust validation and fixtures together;
- precompute meter/beat boundaries outside the realtime callback;
- add a short bounded procedural accent/downbeat click and softer ordinary click;
- add enable/disable/volume commands as ephemeral engine state;
- schedule from actual project position across play, stop, seek, tempo and loop changes;
- restore preference only at a known boundary after device/host recovery;
- persist metronome enablement and volume in the current settings shape without changing project history.

### Verification and exit

- offline fixtures prove sample positions across tempo/meter boundaries;
- loop starts in the middle of a bar do not receive a false downbeat;
- seek/stop/restart do not duplicate or omit a stale click;
- gain/envelope remain bounded and allocation-free in the callback;
- protocol mismatch and any non-current settings fail closed deterministically.

## Stage H - transport, beat and ruler presentation

**Branch:** `feature/transport-beat-ruler`.

### Work

- add metronome toggle beside Play and a collision-safe volume popover;
- add a restrained meter-derived beat indicator from the authoritative transport snapshot;
- expose `4 beats in each bar` from the compact meter control;
- strengthen bar/beat/grid hierarchy without obscuring notes;
- make ruler bar/beat positions pointer- and keyboard-seekable;
- add one dismissible empty-editor first-use hint;
- add a remappable metronome command without a default unmodified letter shortcut.

### Verification and exit

- visual beat, audible click, playhead and ruler agree after play, seek and loop;
- stopped/unavailable audio presentation never claims audible clicks;
- no screen-reader announcement occurs on every beat;
- 48x48 touch targets, reduced motion and forced-color distinctions remain usable;
- existing note editing, transport and A-Z performance scopes do not collide.

## Stage I - integrated acceptance

**Branch:** `fix/pre-phase-6-acceptance`.

### Automated gates

- focused TypeScript tests after each shared stage;
- focused Rust tests after each engine stage;
- protocol generation/parity checks after wire changes;
- complete lifecycle-owned quick check after integration;
- Desktop package, native-host self-test, bundle and packaged-content checks;
- lifecycle audit immediately after every commit and before every next check, branch or merge.

The approved D-001 through D-005 implementation grows the complete production renderer output
beyond the previous note-editor ceilings. Module-attribution reports must be reviewed before changing
the ceilings. If the growth maps to the approved features rather than an accidental dependency, set
the smallest practical full-output limits with measurable headroom and record both measurements and
the decision in acceptance evidence.

### Manual gates

1. Exercise every dropdown near top, bottom and horizontal viewport edges at 100-200% scaling.
2. Play compact and full keyboards with English, Russian and non-Latin layouts.
3. Play physical + multi-touch chords and interrupt them with every release path.
4. Compare contrasting palettes and instruments, including flat and sharp spellings.
5. Confirm `Hear sound`, palette preview and manual input never overlap ambiguously.
6. Inspect reactive wave in Light, Dark, reduced-motion, hidden and audio-unavailable states.
7. Verify metronome alignment over play, stop, seek, loop and tempo changes on packaged Desktop.
8. Verify shared-output recovery and no regression in canonical note editing or persistence.

## Edge cases and compatibility risks

- source identities can leak and create stuck voices unless every exit path is centralized;
- renderer preview timing would violate the engine-clock authority;
- portalled overlays can escape modal focus or close on their own pointer event;
- enharmonic aliases can make labels lie even when MIDI pitches are correct;
- a palette change can be mistaken for transposition unless the persistent copy remains visible;
- malformed or non-current settings must fail closed without losing the active in-memory defaults;
- render-plan meter changes can break native protocol parity if only one language updates;
- loop boundaries are not necessarily bar boundaries;
- wave animation can retain hidden requestAnimationFrame work or react falsely to input without sound;
- expanded keyboard letters can collide with global commands without strict focus ownership;
- shared application changes must continue to compile for the unavailable Web engine without adding
  any Stage-6 implementation.

## Definition of done

- all approved D-001 through D-005 behavior is implemented and evidence-backed;
- no remaining open product decision is required for this scoped delivery;
- Stage 6 code and architecture remain untouched;
- every automated and manual gate above passes or records an explicitly accepted platform limit;
- current project files and settings round-trip without note movement or alternate-format handling;
- no task-owned process, lifecycle lock or cleanup quarantine remains;
- the integration branch is clean and ready for review without merge to `main`, push or PR.
