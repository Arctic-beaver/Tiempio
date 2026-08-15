# Stage 9 implementation plan

## Status and scope

**Status:** implementation complete on the integration branch, 2026-08-15.

**Integration branch:** `feature/brick-editor-performance` from accepted Stage 8 on `main` at
`76cef01`.

Stage 8 is accepted as the engineering entry gate because SQ-A through SQ-E, the SQ-F technical
package and the final engineering audit are merged into `main`. The deferred human preference study
does not block this user-authorized Stage 9 implementation and is not claimed as passed.

This plan coordinates the detailed product authorities in
[`STAGE-9A-NOTE-EDITOR-INTERACTIONS.md`](STAGE-9A-NOTE-EDITOR-INTERACTIONS.md) and
[`STAGE-9B-PERFORMANCE-RECORDING.md`](STAGE-9B-PERFORMANCE-RECORDING.md). It does not expand Stage
9 into the Stage 10 linked-song UI. Stage 9 owns the current source/instance domain, reusable
source-editor navigation state and complete performance-recording path. Stage 10 consumes those
authorities when it adds linked-song scheduling and composition.

## Architecture decisions

- `ProjectSession` remains the only canonical project mutation and Undo/Redo authority.
- The project schema changes atomically from clip-owned events to one material per source layer and
  separate song instances. Only the current schema is accepted after the cutover.
- Stage 9 introduces a presentation-only viewport store keyed by stable source-layer ID. It owns
  semantic time/pitch anchors, zoom, source playhead, inspector disclosure and off-screen canonical
  note indicators. Stage 10 reuses the store when linked instances can select the same source.
- The engine sample frame is the only recording clock. DOM timestamps and React rendering remain
  responsive hints, never canonical musical timing.
- `PerformanceInputSession` continues to own physical and pointer sources. It emits one normalized,
  bounded input event carrying source identity, kind and velocity; it never imports project state.
- One `PerformanceRecordingCoordinator` owns the recording state machine, engine acknowledgement
  reconciliation, explicit history group, recovery checkpoints and render-plan activation hold.
- Desktop native and Web AudioWorklet adapters expose the same generated protocol capability and
  deterministic recording scenarios.
- Stage 9 may temporarily flatten current song instances in the existing render-plan compiler. The
  referenced source-program scheduler remains Stage 10A ownership.

## Stage sequence

Each implementation stage uses one branch created from the updated integration branch. A stage is
verified, committed atomically and merged back before the next stage branch is created.

1. `feature/recording-source-domain`
   - introduce source material, song instances, opaque IDs and bounded current-only validation;
   - add begin/finalize/extend recording commands, tail-rest consumption and explicit history groups;
   - adapt factories, projections, persistence fixtures and the temporary flattened compiler.
2. `feature/source-editor-navigation`
   - add the reusable semantic viewport store, two-axis navigation, synchronized rulers and zoom;
   - implement a continuous full-height source playhead and truthful off-screen-note indicators;
   - implement the collapsible musical-context inspector and contextual octave commands.
3. `feature/performance-recording-protocol`
   - version and generate shared recording DTOs/capability;
   - implement count-in, recording cursor, applied-input acknowledgement and exact Stop in core,
     native and Web paths with bounded preallocated state.
4. `feature/performance-recording-session`
   - add the application coordinator, stale-ID rejection, live projection and grouped canonical flow;
   - hold render-plan activation during a pass and integrate recovery/checkpoint/interrupt cleanup.
5. `feature/expressive-performance-input`
   - normalize keyboard, mouse, touch and pen source identity, kind, pressure and velocity;
   - preserve same-pitch simultaneous sources and a MIDI-ready adapter boundary.
6. `feature/source-editor-recording-ui`
   - add Record/count-in/REC/Stop states, scoped shortcuts, live-note growth and pass feedback;
   - reuse the shared performance keyboard in a responsive, independently collapsible dock;
   - implement auto-follow without making the viewport a timing authority.
7. `feature/phase9-release-evidence`
   - complete Desktop/Web persistence, failure recovery, accessibility and parity evidence;
   - run final sequential validation and produce a fresh unpacked Desktop build.

## Completion record

| Delivery | Stage commit | Integration merge |
| --- | --- | --- |
| Plan and ownership reconciliation | `4bf4b1b` | direct integration-plan commit |
| Source material and song instances | `ea6dbd0` | `2056150` |
| Semantic source-editor navigation | `dd678b5` | `a6d4c91` |
| Engine-clock recording protocol | `b32217d` | `9cadb03` |
| Recording coordinator and recovery | `ef06a94` | `b818c0f` |
| Expressive input normalization | `b997867` | `982b8f0` |
| Source-editor recording UI | `4ddceb4` | `c76f334` |

The final release-evidence commit and merge are the tip of
`feature/brick-editor-performance`. Retained verification, measured budgets, package metadata and
manual follow-ups are recorded in
[`STAGE-9-RELEASE.md`](../evidence/STAGE-9-RELEASE.md).

## Edge cases and failure policy

- Starting without an editable source, with unavailable audio or at a bounded material limit fails
  before mutation with an actionable diagnostic.
- Count-in cancellation produces no revision. A key held through the boundary starts exactly at the
  selected tick.
- Duplicate, reordered, stale or late acknowledgements cannot mutate another pass or source.
- Same-pitch notes from different physical/pointer/MIDI-ready sources retain independent IDs.
- Missing release, pointer-capture loss, blur, visibility loss, layer/project switch and device or
  engine failure close all acknowledged held notes at the last trusted tick and keep one Undoable
  pass.
- Recording silence may extend material; ordinary scrolling, zooming and seeking never do.
- Tail-rest occupation transforms the material/rest boundary without leaving events inside a region
  still labelled as trailing rest.
- Project tick, note, instance, queue, voice and live-overlay limits fail closed without wrapping,
  unbounded allocation or an indefinitely active REC presentation.
- A frozen monitor plan prevents newly canonical notes from sounding twice during a pass. The newest
  revision publishes after Stop.
- React remount, compact-layout transitions and inspector collapse preserve coordinator and semantic
  viewport authority outside the mounted component.
- Existing Stage 8 patch determinism, Stage 7 focus-safe audition, audio recovery, current-only
  persistence and Desktop/Web boundaries must not regress.

## Verification strategy

- Domain unit tests cover current schema, duplicate/reference validation, source commands,
  material/rest transformation, history grouping, source/instance isolation and deterministic
  temporary compilation.
- Pure presentation tests cover semantic anchors, horizontal/vertical bounds, zoom, rulers,
  off-screen indicators, playhead seeking and disclosure invariants.
- Generated TypeScript/Rust protocol fixtures cover count-in, frame-to-tick mapping, overlapping
  input, held Stop, stale IDs, limits and identical native/Web outcomes.
- Coordinator tests use a deterministic fake engine clock for state transitions, live/canonical
  reconciliation, publication hold, recovery cadence and every interruption path.
- Input tests cover physical layouts, IME/text suppression, range focus, keyboard repeat, mouse
  fallback, multi-touch, pressure normalization, cancel and lost capture.
- UI/accessibility tests cover unmistakable transport states, keyboard/touch operation, light/dark,
  reduced motion, 200% zoom, constrained height and the shared scrollbar/dropdown treatment.
- Final checks run sequentially through the repository lifecycle owner: focused tests during stages,
  then `check:quick`, Desktop/Web builds, protocol parity, package verification and lifecycle audit.

## Definition of done

- The clean integration branch contains all seven sequential stage merges and no unrelated changes.
- Current project data stores one reusable source material per layer and separate bounded instances;
  recording never writes into copied arrangement data.
- Source editing and recording work over an open, bounded two-axis canvas with per-source semantic
  viewport state, continuous manual playhead and truthful off-screen indicators.
- Recording starts after a meter-derived count-in at the exact playhead tick, overdubs linearly,
  stores engine-clock timing and velocity, never loops at the old material end and commits one
  automatic Undo group per pass.
- Every loss/restart path leaves no stuck voice, dangling recording, hidden mutation or false REC.
- Desktop native and Web AudioWorklet paths pass the same generated capability and timing fixtures.
- The Stage 9A history/octave and musical-context follow-ups are complete and accessible.
- Focused, combined, package and lifecycle checks pass under bounded ownership.
- A fresh unpacked Desktop artifact is available with its absolute path recorded in retained evidence.
