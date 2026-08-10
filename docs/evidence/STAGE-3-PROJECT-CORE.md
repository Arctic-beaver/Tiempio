# Stage 3 project core acceptance evidence

Date: 2026-08-09

Task integration branch: `feature/skeleton-project-core`

Delivery branches:

- `feature/project-domain-schema`;
- `feature/project-session-format`;
- `feature/project-session-ui`.

## Accepted architecture

- `packages/project-core` owns schema v1, opaque IDs, 960 PPQ musical time,
  resolved instrument state, validation, v0 migration, semantic commands,
  immutable revisioned sessions, bounded undo/redo and deterministic render
  plans.
- `packages/project-format` owns canonical UTF-8 manifests, bounded logical
  `.tiempio` archives, exact preservation of unsupported future bytes and CRC32
  recovery envelopes.
- `packages/application` owns one `ProjectSessionProvider`. Home, Layers,
  Context, Piano Roll, Drums, Arrangement and Sound Sculpt are pure projections
  of the same immutable session snapshot.
- Desktop and Web mount the same application and project provider. The project
  packages have no Electron, browser-storage or React dependencies.
- Notes, drum events, arrangement clips, committed macros, sound-character selection and project
  loop changes now travel through typed project commands. Selected layer, navigation, drawers,
  playhead/playback and transient slider previews remain presentation state.

Physical ZIP compression, storage dialogs, automatic durable persistence,
native/WASM engine hosting and audible playback remain outside this stage.

## Automated acceptance

`npm run checks` passed all 27 bounded, sequential lifecycle stages:

- 51 compiled tests in 9 suites, including schema, validation, migrations,
  session revision/history/save/recovery races, commands, canonical project
  format, recovery corruption detection, render plans and all seven UI
  projections;
- 65 repository-policy tests in 12 suites, including process ownership, target
  boundaries, generated protocol consistency, package contents, CSP and the UI
  rule that forbids component-local canonical project mutation;
- Node and Web TypeScript checks;
- Rust formatting and workspace checks;
- Desktop and Web production builds;
- Desktop/Web CSP, Desktop package-content and bundle-budget policies.

Recorded production sizes were 3,090/65,536 bytes for Desktop main,
927/32,768 bytes for Desktop preload, 364,701/393,216 bytes for the Desktop
renderer and 364,705/393,216 bytes for Web.

The final lifecycle audit reported no recorded process, lock or quarantine.

## Real-browser acceptance

The production Web build was exercised through the in-app browser at the
default viewport, 920x600 and constrained 920x480 layouts.

| Scenario             | Result                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed project         | `Velvet Morning`, four layers, transport and all seven shared surfaces project from the same session.                                             |
| New-project flow     | Creating a piece resets the session, shows a truthful empty state, adds a Bass layer, selects the resolved `Deep` character and opens Piano Roll. |
| Cross-view note edit | A new C3 note remained present after navigating to Arrangement and back.                                                                          |
| Transport edit       | Loop state changed through the project command and remained changed after navigation.                                                             |
| Synth edit           | Brightness committed at 60% and remained 60% after navigating away and back.                                                                      |
| Themes and controls  | Dark and light themes render the same application-owned select, slider, focus and scrollbar treatments.                                           |
| Localization         | Switching to Spanish updated navigation, transport, settings, layers and Sound Sculpt copy immediately.                                           |
| Constrained height   | The workspace scrolls internally at 920x480 without document/body overflow.                                                                       |
| Runtime diagnostics  | Browser console inspection reported no warnings or errors.                                                                                        |

The first manual Ctrl+C preview stop left a stale lifecycle lock after all three
recorded PIDs had already exited. Their PID, creation time and command identity
were checked, quarantine was absent, only that exact lock was removed and the
follow-up audit passed before any further work.

## Acceptance conclusion

Stage 3 meets its definition of done: one validated immutable project snapshot
serves both targets and every musical surface; durable musical edits use typed
commands; format/recovery/render contracts are deterministic and bounded; and
future formats fail read-only without destructive normalization.
