# Pre-Stage-5 architecture alignment evidence

Date: 2026-08-10

Task integration branch: `fix/architecture-alignment`

Acceptance branch: `fix/alignment-acceptance`

Baseline: Stage 4 revision `d835cf9`

## Accepted corrections

- Repository and architecture documents now describe the implemented Stage 0-4 boundary and the
  actual local fast-forward history. Stage 5-8 behavior is not presented as available.
- Target-boundary policy enumerates tracked and unignored owned inputs, ignores generated trees and
  enforces the approved TypeScript package and Rust crate dependency directions.
- `EngineRuntime` commands and events are typed end to end. Protocol DTOs, validation and session
  state remain target-neutral; no production engine payload uses an `unknown` escape.
- The command registry owns effect, availability and localized disabled reasons. Visible controls,
  DOM shortcuts and native requests use the same gate. Without an engine, Play and Stop remain
  unavailable, the shell reports `Audio engine unavailable`, and Tempo is a non-interactive value.
- TypeScript and Rust protocol responsibilities are split behind stable public facades while wire
  names, diagnostics, ordering, frame ceilings and exact serialized events remain unchanged.
- `StudioApplication` is a 48-line composition root, the shared projector facade is 46 lines and
  the application stylesheet entry is five ordered imports. Navigation, transport, feature command
  controllers, projections and CSS regions have explicit owners.
- Home stays in the initial renderer graph. Workflow and editor surfaces are two measured lazy
  entries; one `ProjectSession`, React, i18next, project authority and protocol code are not
  duplicated. Future engine-client, WASM/worklet and audio-activation modules are forbidden from
  the initial graph.

Large project validators and the typed project reducer remain intentionally cohesive. Their size
comes from complete bounded schema coverage and the single command authority, not mixed UI,
platform or persistence responsibilities. Splitting them solely by line count would weaken local
invariant visibility and is not required before Stage 5.

## Bundle evidence

The accepted 393,216-byte renderer/Web ceilings were not raised.

| Bundle class     | Full output |   Limit | Remaining | Initial JS | Deferred JS |
| ---------------- | ----------: | ------: | --------: | ---------: | ----------: |
| Desktop renderer |     373,114 | 393,216 |    20,102 |    329,418 |      12,095 |
| Web              |     372,966 | 393,216 |    20,250 |    329,240 |      12,087 |

Desktop main is 3,090/65,536 bytes and preload is 927/32,768 bytes. The attribution schema records
entry/static/dynamic edges and module ownership. The topology policy requires eager Home, two
distinct deferred surfaces, absence of future audio graphs from initial code and no duplicated
framework/localization/project/protocol modules.

## UI and responsive review

The production Web output was exercised through the in-app browser across the real Home -> First
Layer -> Sound Chooser -> Piano Roll and Home -> First Layer -> Drums paths. Both lazy surfaces
loaded, note/drum mutations remained project-backed and the console reported no warnings or errors.

Light and Dark schemes both kept Play and Stop unavailable, retained the truthful unavailable-audio
status and rendered Tempo as a `div`, not an invented edit control. A real 390x844 viewport audit
also exposed off-screen hidden tooltip geometry. The shared design system now presents compact
tooltips as a viewport-contained fixed bottom surface for hover and keyboard focus; repository
policy rejects removal of that containment. Existing compact drawer, constrained-height and
internal editor overflow behavior remains covered by the responsive model tests and retained Stage
2 browser matrix.

## Automated acceptance

- `npm run checks`: 31/31 bounded stages passed on the final code, including 66 TypeScript/contract
  tests, 79 repository-policy tests, 47 Rust tests, format, lint, typechecks, clippy, CSP, package
  separation, both production builds, bundle budgets and chunk topology.
- `npm run evidence:engine`: 106,667 frames and all golden metrics reproduced; PCM16 FNV-1a 64
  remained `8e3d8e2e6e48671a` with zero clipped or non-finite samples.
- Every completed workflow and every commit was followed by the exact lifecycle audit. No
  task-owned process, lifecycle lock or cleanup quarantine remains.

## Residual implementation boundary

This work deliberately does not add native engine process supervision, an operating-system audio
backend, WebAssembly/AudioWorklet packaging, live transport, physical ZIP storage, dialogs,
IndexedDB or durable Save/Download semantics. Those capabilities must be introduced through the
typed runtime and lazy graph boundaries in Stages 5-7; until then the corresponding shell actions
remain unavailable rather than simulated.
