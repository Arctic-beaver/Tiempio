# Stage 3 — canonical project model, session and minimal format

## Status and scope

This document is the implementation plan for Stage 3 of
`APPLICATION_SKELETON.md`, called step 4 in the execution sequence because the
lifecycle foundation, repository contracts and shared shell stages are already
complete.

The task integration branch is `feature/skeleton-project-core`. The outcome is
one validated, revisioned `ProjectSession` shared by Desktop and Web. Every
musical surface projects from its immutable snapshot, and every durable musical
change is expressed as a typed semantic command.

This stage does not implement physical ZIP compression, filesystem dialogs,
atomic native writes, IndexedDB, automatic disk autosave, audio decoding, DSP,
native/WASM engine hosting or audible playback. It defines the platform-neutral
contracts those later stages consume. The `.tiempio` work in this stage is a
bounded logical archive plus a canonical `project.json` manifest codec.

## Source of truth

The implementation follows:

- `docs/architecture/TIEMPIO_ARCHITECTURE.md`;
- `docs/project-plan/APPLICATION_SKELETON.md` Stage 3;
- `docs/tiempio_ux_path.md`;
- `docs/electronic_music_studio_concept(1).md`.

Yinkie remains read-only reference material. Tiempio reuses only its proven
revision-bound save acknowledgement, stale-result rejection and immutable
subscriber patterns. The project schema, musical commands, archive model and
render plan are Tiempio-owned.

## Architecture boundaries

- `packages/project-core` owns opaque musical IDs, the current project model,
  resolved instrument state, strict validation, semantic commands,
  `ProjectSession`, undo/redo and render-plan compilation.
- `packages/project-format` owns canonical manifest bytes, bounded logical
  archive validation and checksummed
  recovery envelopes. It depends on the public `project-core` boundary and has
  no platform or React dependency.
- `packages/application` owns the React provider and view projections. It may
  issue public project commands but cannot mutate snapshots or reproduce domain
  validation.
- Desktop and Web composition roots continue to mount the same application.
  Native paths, browser handles and storage implementations remain outside the
  shared project packages.
- The engine receives only a validated, revision-bound render plan. It never
  receives React state, archive bytes or an unvalidated project object.

## Current model and bound decisions

- Project schema, patch model, macro mapping, render plan and recovery envelope expose exactly one
  current shape and change only through an atomic repository-wide cutover.
- Musical time uses non-negative safe integers at 960 ticks per quarter. A
  project contains a bounded timeline, layer count, clip count, event count and
  title/name/ID length.
- MIDI pitches use integers 0–127, velocities use integers 1–127, gain uses a
  finite linear range, pan uses a finite normalized range and macros use finite
  values from 0 to 1.
- Opaque IDs are supplied by the application boundary. Core factories never
  depend on wall-clock time, randomness, paths or target APIs.
- The first synth source stores preset identity/revision, macro mapping/version
  and a fully resolved Bass patch. The resolved patch is authoritative for
  reproduction after catalog changes.
- Data that does not match the current project or patch contract is invalid and rejected without
  opening a session or retaining an alternate representation.
- The logical archive admits only canonical relative entry paths, one
  `project.json`, bounded entry count, bounded declared/decompressed bytes and
  bounded compression ratio metadata. Stage 5/6 adapters will supply actual ZIP
  streams.
- Recovery uses a canonical current-manifest payload and a CRC32 integrity
  checksum. It is corruption detection, not an authenticity or security
  boundary.

## Revision and command semantics

- `ProjectSession` starts at revision zero with a matching persisted revision.
- An accepted content-changing command produces a new deeply frozen snapshot
  and advances the revision exactly once. Rejected and semantic no-op commands
  leave revision and history unchanged.
- Commands carry an expected base revision. Stale commands fail before any
  mutation.
- Undo and redo restore bounded immutable project states but still create new
  monotonic revisions. A new command after undo clears redo history.
- Preview values are not project revisions. Macro preview returns a validated
  projected instrument state; only commit changes the canonical project.
- Save begins only for the current revision. An acknowledgement is accepted
  only for its in-flight revision and target fingerprint. If revision N+1 was
  created while N saved, N becomes the persisted revision and the session stays
  dirty.
- Recovery acknowledgement is independent from Save. A recovery record for N
  cannot claim that N+1 is protected, and a successful Save never fabricates a
  recovery acknowledgement.
- Selection, active editor, zoom, scroll, drawers and transport playhead remain
  presentation or engine state and do not advance the project revision.

## Initial model and commands

The first schema includes:

- project identity, title and version markers;
- tempo, meter, key, PPQ and bounded loop state;
- named sections with integer spans;
- musical-role layers with gain, pan, mute, solo and export inclusion;
- synth, minimal drum and reference sources;
- MIDI and drum clips with integer placement and events;
- one resolved `Deep` Bass preset plus semantic brightness, hardness, dirt,
  length and width macros;
- an empty bounded asset-reference list reserved for later storage adapters.

The command surface covers create project, add role layer, select character,
preview/commit macro, add/move/resize/delete note, transpose octave, layer
mute/solo/gain, tempo/key/loop, section creation and MIDI/drum clip placement.

## Delivery stages

### Stage A — Domain schema, presets and validation

**Branch:** `feature/project-domain-schema` from the task integration branch.

- Add branded IDs, musical scalar guards and immutable model types.
- Add deterministic project/layer/clip factories and the resolved `Deep` Bass
  preset catalog boundary.
- Add current-schema validation, duplicate/reference/cycle checks and explicit
  bounds.
- Reject every non-current shape as invalid without conversion or byte retention.
- Add fixtures for valid, invalid and catalog-independent current projects.

### Stage B — Commands, session, format and render plan

**Branch:** `feature/project-session-format` from the updated task branch.

- Add the pure semantic command reducer and typed failures.
- Add revisioned `ProjectSession`, subscriptions, bounded undo/redo, save-race
  handling and independent recovery acknowledgement.
- Add canonical manifest serialization/parsing and logical archive validation.
- Add the checksummed recovery envelope codec.
- Add deterministic revision-bound render-plan compilation and stale-revision
  rejection.

### Stage C — Shared application projection and acceptance

**Branch:** `feature/project-session-ui` from the updated task branch.

- Add one application-owned `ProjectSessionProvider` and seed project factory.
- Project Home, Layers, Context, Piano Roll, Drums, Arrangement and Sound Sculpt
  from the same session snapshot.
- Route existing musical UI actions through typed project commands and remove
  component-local note, drum, arrangement, character, macro and loop mutation.
- Keep unavailable persistence/audio operations truthful and keep target
  composition roots project-agnostic.
- Add repository policy, browser evidence and combined acceptance checks.

## Edge cases and failure modes

- Duplicate or missing IDs, dangling clip/section/asset references and reference
  cycles fail validation.
- Negative ticks, zero durations, overlapping arithmetic that exceeds safe
  integers, invalid MIDI values, NaN/infinite values and excessive collections
  fail closed.
- Out-of-scale notes remain valid data; theory guidance never becomes a schema
  validator.
- Reference layers are non-exportable by stored data and render-plan output,
  not by UI convention.
- Mutating a project during Save leaves the newer revision dirty.
- A stale save, recovery or render-plan acknowledgement cannot replace state for
  a newer revision.
- Undo capacity is bounded and cannot retain an unbounded project history.
- Preset catalog updates cannot alter an already resolved saved patch.
- Any schema or patch mismatch fails before a project session or save target is created.
- Archive traversal, duplicate normalized paths, excessive entry counts,
  declared-size overflow and suspicious compression ratios fail before entry
  payload decoding.
- Repeated serialize/parse/serialize uses one documented canonical key ordering
  and produces identical bytes.

## Verification strategy

Each delivery stage runs focused tests and `check:quick` before its atomic
commit, followed by a lifecycle audit before fast-forward merge into the task
integration branch.

The combined task branch must pass:

- current-schema round-trip and strict mismatch fixtures;
- malformed model and logical-archive corpus tests;
- repeated canonical manifest and recovery-envelope round trips;
- exhaustive bounded semantic command sequences where practical;
- revision, semantic no-op, undo/redo and history-capacity invariants;
- save/recovery race and stale-acknowledgement tests;
- resolved-patch catalog-independence fixtures;
- deterministic render-plan and stale-revision tests;
- shared UI projection tests proving all seven surfaces observe one revision;
- Node/Web typechecks, Rust regression check and target-boundary policies;
- Desktop and Web production builds plus CSP, package-content and bundle-budget
  policies;
- real-browser checks that mutations survive navigation and are reflected in
  equivalent shell surfaces;
- final staged `precommit` and post-commit lifecycle audit.

## Definition of done

- One validated immutable project snapshot serves both targets and all seven
  shared surfaces.
- Every durable musical mutation is a typed command owned by `project-core`.
- Revision, persisted revision, dirty state, recovery state and undo/redo are
  deterministic and bounded.
- A minimal project and recovery record round-trip canonically.
- Only the current project shape can be opened, recovered or saved.
- The resolved Bass patch survives preset catalog changes in fixtures.
- The render plan is deterministic, revision-bound and excludes reference
  layers from export by data.
- No React component owns canonical notes, drum events, arrangement placement,
  committed macros or project loop state.
- The task branch is clean and ready for an explicit merge request; it is not
  merged into `main` by this implementation task.
