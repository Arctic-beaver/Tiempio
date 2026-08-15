# Stage 10C linked composition UI evidence

## Delivered boundary

Stage 10C replaces the arrangement placeholder with one shared Desktop/Web composition surface
projected from canonical source layers and linked song instances.

- The upper workspace contains a real brick list, contextual creation card, selected-source editor,
  source-local manual or engine cursor, explicit cycle pause and transient preview speaker controls.
- The independently collapsible song dock renders canonical instances in per-source lanes. Source
  drag/drop creates linked placements; pointer and keyboard gestures move, left-trim, loop-resize,
  split and delete them with one project command per completed gesture.
- Ordinary duplication creates only another linked instance. `Create variation` atomically creates a
  new layer and instance with fresh layer, note or drum-event identities while preserving the source
  material semantics.
- Left trim changes start, duration and source offset together. Split preserves continuous source
  phase in both resulting linked instances. Invalid zero-length or boundary splits remain no-ops.
- The independently collapsible inspector exposes real edit, split, linked-duplicate, variation and
  delete actions. Source selection stays in composition; explicit sound editing opens Sound Sculpt.
- The composition-only editor remains in the existing lazy editor chunk. It reuses design-system
  buttons and scroll surfaces, semantic theme tokens and the application scrollbar treatment.
- English, Russian and Spanish catalogs contain identical composition keys and interpolation
  tokens.

## Automated verification

| Gate                     | Result                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:quick`    | PASS 19/19: format, lint, boundaries, UI/CSP/package policies, 247 TypeScript tests, 102 policy tests, Node/Web typecheck and the complete Rust workspace |
| Linked instance commands | PASS: trim, split, linked duplication, explicit variation, fresh identities, atomic Undo/Redo and source isolation                                        |
| Interaction geometry     | PASS: bounded pointer mapping, snapping, move, left trim, right loop resize and split boundaries                                                          |
| `npm run build:web`      | PASS 7/7: production build, CSP, bundle budgets and chunk topology                                                                                        |
| Web initial JavaScript   | 483,625 / 487,424 bytes                                                                                                                                   |
| Web deferred application | 108,327 / 122,880 bytes                                                                                                                                   |
| Web shell output         | 693,783 / 700,416 bytes                                                                                                                                   |
| Release WebAssembly      | 634,704 / 786,432 bytes                                                                                                                                   |
| Lifecycle audit          | PASS after every completed check/build: no recorded task-owned process, lock or quarantine                                                                |

Stage 10 owns an explicit tested growth envelope of 6 KiB for the Desktop preload, 64 KiB for the
Desktop renderer, 16 KiB for Web initial JavaScript, 24 KiB for deferred application code and 48
KiB for Web shell output. The preload allowance is consumed by the shared linked-render-plan and
brick-preview command/event validation at the isolated bridge. The composition screen remains
outside the initial graph; the initial Web increase is canonical command and localization code
shared by eager project services.

## Visual follow-up and resolved runtime edge

The retained light reference was inspected before implementation. A local production Web run
verified the Home, first-layer and audio-activation surfaces, but the in-app browser environment did
not deliver an AudioWorklet block-boundary render-plan acknowledgement. The first-brick safety gate
therefore correctly refused to commit, so the composition screen itself could not receive a live
browser screenshot in that environment.

The run exposed a separate integration edge for Stage 10D: after a candidate revision was accepted
by the protocol but its realtime acknowledgement timed out, restoring the older current revision
was rejected as stale. Stage 10D resolves this by treating candidates and recovery plans as
generation-ordered variants of the current revision, rejecting only lower revisions, and promoting
an acknowledged candidate to its committed canonical revision with a second publication.

The architecture authority identified a user-reviewed prototype delta for edge-ghost appearance,
aggregation and motion. Geometry and non-ghost implementation are complete. On 2026-08-15 the user
explicitly waived that manual review for the final Stage 10 delivery, so no additional screenshot
acceptance is required for the squash.
