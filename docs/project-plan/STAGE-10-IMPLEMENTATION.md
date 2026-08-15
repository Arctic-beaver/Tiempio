# Stage 10 implementation plan

## Status and scope

**Status:** stages 10A-10D implemented, verified and delivered to `main` as one squash commit on
2026-08-15. The user explicitly waived the manual edge-ghost visual review for this delivery.

**Historical integration branch:** `feature/linked-bricks-song-architecture` from the completed
Stage 9 tip on `main` at `b4e6fcd`; removed after the squash delivery.

The approved product and architecture authority is
[`STAGE-10-LINKED-BRICKS-AND-SONG.md`](STAGE-10-LINKED-BRICKS-AND-SONG.md). This coordinator records
the executable delivery sequence, entry audit, verification and completion history. It does not
expand Stage 10 into starter content, personal audio, export or application-wide mobile adaptation.

## Entry audit

- Stage 9 completed the current project schema: one source material per layer and separate bounded
  song instances. Current-only persistence, recovery fixtures and grouped source recording are the
  canonical baseline.
- The semantic source viewport, off-screen canonical-note indicators, continuous source playhead,
  recording coordinator and responsive performance controls already exist and must be reused.
- The TypeScript render-plan compiler is the intentional temporary boundary: it expands every
  instance cycle into flattened events before sending render-plan version 4 to Rust.
- The Rust engine, native host and Web AudioWorklet already share generated protocol contracts and
  deterministic scheduling fixtures. Stage 10 versions those contracts rather than creating a
  target-specific scheduler.
- The repository lifecycle owner provides one exclusive lock, direct child launches, bounded
  per-stage timeouts, 15-second heartbeats, signal propagation, exact process-tree cleanup and a
  retained audit. All combined checks and builds run sequentially through it.
- Stage 9 release margins are tight. Every stage measures affected bundles and records an explicit
  growth envelope before accepting production builds.

## Architecture decisions

- `ProjectSession` remains the only canonical musical mutation and Undo/Redo authority.
- A source program contains resolved sound, bounded canonical events and a positive cycle. A song
  instance contains only source identity, start, duration and source offset.
- The engine expands cycles at scheduling time using bounded preallocated state. React and the
  TypeScript compiler do not create unbounded repeated event arrays.
- Runtime event identity derives deterministically from instance, source event and cycle iteration.
- Note lifetime across instance start, trim, split and partial end is explicit and deterministic;
  no command copies source events to simulate continuation.
- `BrickPreviewSession` is application-owned transient state. Per-source cursor snapshots are
  generation-, sequence-, frame- and render-revision-bound.
- Brick preview and song playback are mutually exclusive audio authorities without introducing an
  application mode.
- Source viewport, manual playhead, disclosure and preview speaker state remain presentation state
  and never enter `.tiempio`, project revision or Undo history.
- Shared design-system overlays, scroll surfaces, tokens and focus behavior remain the only UI
  treatments across Desktop and Web.

## Stage sequence

Each implementation stage is created from the updated integration branch, verified, committed
atomically and merged back before the next branch is created.

### 10A — referenced render plan and scheduling

**Branch:** `feature/linked-bricks-render-plan`.

- version TypeScript, generated wire and Rust render-plan contracts;
- compile bounded source programs and referenced song instances from one project revision;
- schedule source offsets, unequal cycles, tail rests, partial final cycles, overlaps and seeks in
  Rust without callback allocation;
- define deterministic boundary-note lifetime for trim, split and partial instance endings;
- reject dangling references and all source/instance/event/duration ceiling violations before plan
  activation;
- run identical protocol, offline, native-adapter and Web/WASM scenarios.

**Exit:** source edits change every referenced placement without recompiling copied canonical event
arrays, placement edits remain local, and native/Web scheduling samples and diagnostics match.

### 10B — brick preview runtime

**Branch:** `feature/brick-preview-runtime`.

- add keyed preview protocol commands and cursor snapshots;
- implement `BrickPreviewSession`, start/stop, late enable at zero, disable/re-enable, source-local
  suspend/seek/resume and stale snapshot rejection;
- keep per-source phases independent while using the shared tempo and engine clock;
- make preview/song authority handoff release all previous voices exactly once;
- recover truthfully from unavailable audio, device loss, engine restart, blur and project teardown.

**Exit:** unequal sources run with independent engine-authoritative cursors, disabled sources stay
still, and preview actions never change the project revision or song plan.

### 10C — shared composition UI

**Branch:** `feature/song-composition-ui`.

- replace the arrangement placeholder with the approved upper brick editor and collapsible lower
  song dock projected from canonical state;
- reuse contextual brick creation, source recording, source viewport, inspector disclosure,
  design-system controls and application scrollbars;
- add accessible pointer and keyboard placement, move, left/right trim, split, loop resize and
  deletion using one project command per completed gesture;
- add explicit linked duplication and independent-variation actions with fresh identities;
- bind speaker controls to transient preview rather than persistent layer mute;
- bind idle/disabled lines to manual source playheads and running lines to their own trusted preview
  cursors;
- preserve independent inspector/song-dock disclosure, focus return, constrained-height overflow,
  light/dark themes and 200% zoom.

**Visual gate disposition:** the architecture authority originally required a user-reviewed
prototype delta for edge-ghost appearance, aggregation and motion. Geometry and non-ghost work were
completed, and the user explicitly waived the remaining manual review for the final delivery on
2026-08-15.

**Exit:** every enabled control has one real accessible handler, ordinary duplicates stay linked,
instance edits stay local and all approved disclosure/viewport/playhead combinations remain
truthful.

### 10D — integration, durability and release evidence

**Branch:** `feature/linked-bricks-integration`.

- connect project publication, referenced plan activation, preview and song transport with stale
  revision protection;
- remove the obsolete flattened/demo compatibility path after both targets use the new contract;
- cover create, place twice, edit source, preview, arrange, song-play, save, reopen, recover and
  Undo/Redo as one first-hour flow;
- verify engine restart, project switch, rapid enable/disable/select/seek, invalid plans, limits and
  cleanup;
- retain packaged Desktop and production Web evidence plus measured bundle deltas.

**Exit:** both targets reopen and play the same linked song with the same sound, source content,
instance geometry, cycle pause and failure diagnostics.

## Edge cases and regression risks

- zero or negative cycles/durations, dangling source IDs and source events outside material bounds;
- empty but positively sized silent bricks and partial final repetitions;
- offsets larger than a later-shortened cycle and exact modulo normalization;
- notes crossing instance start, left trim, split and final boundaries;
- overlapping placements exceeding voice or per-block event ceilings;
- stale plan activation during rapid project edits or engine restart;
- late preview enable, disable/re-enable, stale generation/sequence and source-local seek while other
  cursors advance;
- preview/song handoff, blur, device loss and project teardown without stuck voices;
- cancelled pointer gestures, React remount and responsive transitions without duplicate commands;
- independent semantic viewport restoration without flashes, project revisions or copied instance
  viewports;
- dense off-screen indicators, keyboard alternatives, reduced motion and high contrast;
- bundle-budget overflow or accidental initial-shell loading of composition-only UI.

## Verification strategy

- focused TypeScript unit tests for project commands, compiler shape, source/instance isolation,
  stable identities, viewport/presentation behavior and preview coordination;
- generated TypeScript/Rust fixtures for supported versions, bounds and stable diagnostics;
- Rust protocol/core/offline tests for samples and event timing across all instance boundaries;
- the same deterministic runtime scenarios through native and Web/WASM adapters;
- persistence/recovery tests for linked instances and rejection of non-current or dangling data;
- UI/accessibility tests for keyboard/pointer parity, focus, disclosure, themes, reduced motion,
  constrained height and 200% zoom;
- focused checks on each stage branch, followed sequentially by `check:quick`, `build:web`,
  `check:web-engine`, `package:check` and `lifecycle:audit` for final acceptance;
- an ownership audit immediately after every commit and before any following check, branch, merge,
  stage or commit.

## Definition of done

- all four stage branches are merged sequentially into the clean integration branch;
- the canonical source/instance model is preserved through persistence, compiler, protocol, Rust
  scheduling and UI;
- no ordinary placement or duplicate copies canonical source events;
- preview and song playback use separate truthful transports with exact voice cleanup;
- move, trim, split, loop, pause, overlaps and boundary notes pass deterministic parity tests;
- all enabled composition controls are accessible and functional on Desktop and Web;
- per-source viewport and cursor authorities remain independent and non-persistent;
- current-only save, reopen and recovery reproduce the same linked composition;
- focused, combined, production, engine, package and lifecycle checks pass sequentially;
- retained evidence records versions, bundle deltas, package metadata, manual follow-ups and exact
  task-owned cleanup.

## Completion record

| Delivery | Stage commit | Integration merge |
| --- | --- | --- |
| Plan and entry reconciliation | `b0b1d09` | direct integration-plan commit |
| Referenced render plan and scheduling | `6fb246c` | `db01682` |
| Brick preview runtime | `432d518` | `482c832` |
| Shared composition UI | `170dd85` | `ebd7507` |
| Integration and release evidence | `253374f` (evidence `608c572`) | `3b48a64` |
| Final `main` delivery | combined Stage 10 result | one squash commit |
