# Stage 10D integration and durability evidence

## Delivered boundary

Stage 10D completes the linked-source path across application publication, Rust activation,
current-only persistence and both production targets.

- Render-plan variants at one canonical project revision are accepted only when their plan
  generation advances. Plans from an older project revision are still rejected by the protocol,
  core engine and WebAssembly boundary with `engine.stale-revision`.
- A prepared project transaction is preactivated as a transient variant of its base revision. The
  exact candidate must be acknowledged before the project commits; the committed revision is then
  published canonically and acknowledged separately.
- Candidate timeout restores the current project as a newer same-revision generation. A late
  candidate acknowledgement is ignored, the canonical session stays unchanged and the runtime
  remains available instead of entering a stale-revision failure loop.
- The composition projector now derives its extent, source lanes and placements only from
  `song.instances`. The obsolete section-cell view model and `toggleCell` compatibility action are
  removed; canonical project sections remain available to the project format and other musical
  features.
- A linked composition with one edited source, two placements and a non-zero source offset is
  exercised through Undo/Redo, canonical manifest bytes, the physical `.tiempio` archive and the
  checksummed recovery envelope. Reopen retains one source and two references to that source.
- The first-hour contract is covered across the shared runtime and format suites: layer creation and
  acknowledged preactivation, linked placements, source editing, independent brick preview, song
  transport, recovery writes, Undo/Redo, physical save/reopen and recovery decode. Desktop and Web
  consume the same `ProjectSession`, codecs, compiler and protocol rather than target-specific song
  state.

The implementation commit is `253374f` (`Integrate linked composition durability`), retained
evidence is `608c572`, and the Stage 10D integration merge is `3b48a64`.

## Automated verification

| Gate                           | Result                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:quick`          | PASS 19/19: 248 TypeScript tests, 102 repository-policy tests, Node/Web typecheck and the complete Rust workspace                |
| Candidate activation recovery  | PASS: same-revision variants accepted, lower revisions rejected, timeout restores canonical content and late ack is ignored      |
| Linked persistence and history | PASS: source edit, Undo/Redo, two linked instances, source offset, canonical bytes, physical ZIP reopen and checksummed recovery |
| `npm run build:web`            | PASS 7/7: release WebAssembly, production application, CSP, bundle budgets and chunk topology                                    |
| `npm run check:web-engine`     | PASS 5/5: target check, seven deterministic native scenarios, release build and live WASM parity                                 |
| `npm run package:check`        | PASS 11/11: native host, Desktop production build, CSP, budgets, topology, package policy and fresh unpacked package             |
| Lifecycle audit                | PASS after every completed check, build, package and commit: no recorded task-owned process, lock or quarantine                  |

## Production measurements

| Class                           |  Actual | Ceiling | Remaining |
| ------------------------------- | ------: | ------: | --------: |
| Desktop main                    | 223,398 | 229,376 |     5,978 |
| Desktop preload                 |  66,791 |  68,608 |     1,817 |
| Desktop renderer                | 738,640 | 757,760 |    19,120 |
| Web initial JavaScript          | 483,011 | 487,424 |     4,413 |
| Web deferred application        | 107,878 | 122,880 |    15,002 |
| Web runtime JavaScript          | 108,081 | 196,608 |    88,527 |
| Web worklet JavaScript overhead |   5,557 |  65,536 |    59,979 |
| Release WebAssembly             | 634,696 | 786,432 |   151,736 |
| Web shell output                | 692,720 | 700,416 |     7,696 |

Desktop initial/deferred JavaScript is 511,242/125,828 bytes. Web initial/deferred JavaScript is
483,011/215,959 bytes. The Stage 10 preload envelope is 6 KiB and is attributed to the shared
linked-render-plan and brick-preview command/event validation at the isolated Desktop bridge.

The fresh Windows x64 package contains the staged native host with SHA-256
`04371EF81610C41ACA4C4F69F147CE5175D610CCA1CB4904255BD7617A0E1493`; package policy verified the
asar contents, native manifest and executable resource.

## Manual acceptance disposition

The approved linked-composition light/dark reference remains retained and policy-locked. The
architecture authority identified a user-reviewed prototype delta for edge-ghost appearance,
aggregation and motion. On 2026-08-15 the user explicitly waived that manual review for this
delivery. Automated geometry, disclosure, focus, theme, overflow and production-artifact gates
remain the acceptance evidence; no manual screenshot review is required for the final squash.
