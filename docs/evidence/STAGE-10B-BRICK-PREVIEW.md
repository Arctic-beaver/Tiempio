# Stage 10B brick preview runtime evidence

## Delivered boundary

Stage 10B adds an application-owned, transport-independent preview for linked source bricks without
changing canonical project state or the published song plan.

- Engine protocol version 11 advertises `preview.linked-sources` on native and Web profiles.
- Generation- and render-revision-bound commands start and stop one preview, enable or disable one
  source, and seek or suspend only that source.
- `BrickPreviewSession` owns transient enabled state and trusted cursors keyed by source layer. It
  rejects stale generations, revisions and event sequences and interpolates only from accepted
  engine-frame snapshots.
- Unequal source cycles advance independently on the shared engine clock. A late-enabled or
  re-enabled source starts at local tick zero while already-running sources keep their phase.
- Preview start, source-local disable, seek and stop release only the affected preview voices.
  Starting song transport, recording, audition preview, plan replacement or shutdown interrupts the
  brick preview without mutating song transport or material.
- Native and Web adapters prepare all source actions outside the realtime callback. The warmed
  callback retains its zero-allocation and zero-deallocation contract.
- The runtime controller resets preview state on unavailable audio, engine failure, project
  replacement and controller teardown. Preview commands and events leave `ProjectSession` revision
  and project identity unchanged.

## Verification

| Gate                            | Result                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and repository tests | PASS: 242 compiled contract/application tests and 101 policy tests                                                        |
| Preview session scenarios       | PASS: unequal cycles, stale snapshots, late enable, disable/re-enable, source-local suspend/seek/resume and interpolation |
| Runtime-controller authority    | PASS: preview/song/recording/audition handoff and project revision isolation                                              |
| Rust workspace                  | PASS: format, check, strict Clippy and all crate/integration tests                                                        |
| Realtime allocation             | PASS: warmed song/preview callback paths allocate and deallocate zero times                                               |
| Native host                     | PASS: linked-preview capability, start/cursor/stop lifecycle and bounded cleanup                                          |
| Web/WASM parity                 | PASS: linked preview plus five synth families, drums, controls, recording and bounded failures                            |
| Release WebAssembly             | 634,704 bytes against the unchanged 786,432-byte ceiling                                                                  |

The release profile now uses one code-generation unit, thin LTO and symbol stripping. This preserves
the normal optimized DSP level while recovering binary headroom without relaxing the artifact
budget.

All workflows ran sequentially through the repository lifecycle owner with an exclusive lock,
bounded stage timeouts, progress heartbeats, signal handling and exact task-owned process cleanup.

## Deferred to Stage 10C

The runtime is ready for the composition surface. Stage 10C owns the linked-brick speaker controls,
per-source running/manual playheads, arrangement gestures, disclosure state and accessible shared
Desktop/Web presentation.
