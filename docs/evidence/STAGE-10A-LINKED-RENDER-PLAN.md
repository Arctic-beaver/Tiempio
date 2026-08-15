# Stage 10A linked render-plan evidence

## Delivered boundary

Stage 10A replaces the temporary TypeScript-expanded song projection with one bounded canonical
source program per playable layer and separate linked song instances.

- Engine protocol version 10 advertises `render-plan.linked-instances` on native and Web profiles.
- Render-plan version 6 carries canonical source events, source cycle, song-enabled mix state and
  bounded instances with source offsets.
- TypeScript no longer creates one copied event per instance cycle. Long placements retain the same
  source event array and change only instance-local data.
- Rust validates source/instance references and expands bounded `PreparedAction` values outside the
  realtime callback.
- Scheduled voice identity includes plan generation, source layer, instance, source event and cycle
  iteration, so overlapping linked placements do not alias voices.
- Large stored source offsets normalize against the current cycle without rewriting project data.
- Exact split chains preserve one note lifetime across a continuous boundary without a second
  attack. Partial final notes end at the authored arrangement boundary.
- Muted/solo-disabled sources remain present for later brick preview while scheduling no song
  actions.

## Verification

| Gate                            | Result                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| TypeScript and repository tests | PASS: 237 compiled contract/application tests and 101 policy tests                                               |
| Rust workspace                  | PASS: format, check, strict Clippy and all crate/integration tests                                               |
| Scheduler scenarios             | PASS: unequal cycles, large offsets, split continuity, partial endings, swing, density and disabled-song sources |
| Realtime allocation             | PASS: warmed render callback and plan swap allocate and deallocate zero times                                    |
| Native protocol                 | PASS: shared synth/drum fixtures, ceilings, host self-test and offline proof                                     |
| Web/WASM parity                 | PASS: five synth families, drums, controls, recording and bounded failures                                       |
| Release WebAssembly             | 749,342 bytes against the 786,432-byte ceiling                                                                   |

All workflows ran sequentially through the repository lifecycle owner with an exclusive lock,
bounded stage timeouts, progress heartbeats, signal handling and exact task-owned process cleanup.

## Deferred to Stage 10B

The source programs now remain available even when song mix state disables their scheduling.
Per-source preview commands, independent preview clocks/cursors and preview/song authority handoff
are owned by Stage 10B.
