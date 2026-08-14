# Stage 7 completion evidence

## Result

**Recorded:** 2026-08-14  
**Integration branch:** `feature/stage-7`  
**Stage branches:** `fix/contextual-add-brick`, then `fix/sound-chooser-focus-audition`  
**Status:** Stage 7A and Stage 7B are complete, integrated in the required order and verified for
the explicitly authorized merge into `main`.

The detailed acceptance records remain in
[`STAGE-7A-CONTEXTUAL-BRICK-CREATION.md`](STAGE-7A-CONTEXTUAL-BRICK-CREATION.md) and
[`STAGE-7B-FOCUS-SAFE-AUDITION.md`](STAGE-7B-FOCUS-SAFE-AUDITION.md).

## Architecture outcome

The existing boundaries were not adequate for Stage 7: creation mutated canonical project state
before acceptance, Sound Chooser audition required a canonical layer, performance routing treated
every input as text, and slider consumers did not share exact gesture ownership. The implementation
therefore refactored only the Stage 7 foundations before adding behavior:

- immutable prepared `ProjectSession` transactions now validate privately and publish one revision
  and one Undo/Redo entry atomically;
- one application-owned `LayerCreationCoordinator` keeps branded drafts outside the project,
  persistence, recovery and history;
- draft and Fine Tuning audition exist only at the engine wire-plan boundary, with exact revision
  acknowledgement, rollback and cancellable note ownership;
- a pure semantic focus classifier and shared `SemanticSliderGesture` own input and gesture
  lifecycles instead of view-local handlers;
- the persistent layer projection, scroll treatment, focus token and responsive drawer reuse the
  application design system.

Public project commands and Desktop/Web runtime boundaries were preserved. No unrelated redesign,
worktree, repository copy, hosted workflow or provisional canonical layer was introduced.

## Delivered behavior

Stage 7A keeps the selected editor, transport, layer list and song context visible while exactly one
resumable synth or drum draft is configured. True zero-layer onboarding remains distinct. Cancel,
suspend, project replacement, engine failure and stale acknowledgement are lossless; Use publishes
an engine-ready brick atomically, and one Undo removes the entire creation.

Stage 7B lets mapped physical audition pass through a focused range without stealing native slider
keys or focus. Text, unknown input, capture and non-delegating modal targets fail closed. Keyup
releases the physical source accepted at note-on even after focus moves. Dirty pointer, keyboard and
blur terminals converge on one commit; cancellation restores the committed value. Fine Tuning
previews the latest patch without history mutation or broad note release.

## Verification

All resource-intensive workflows ran sequentially through `scripts/lifecycle-runner.mjs`, with its
single-run lock, bounded stage timeouts, heartbeats, signal handling and task-owned cleanup.

| Gate                        | Result                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `npm test`                  | PASS: 213 compiled contract/unit tests and 97 repository-policy tests                     |
| `npm run lint`              | PASS                                                                                      |
| `npm run check:visual-a11y` | PASS                                                                                      |
| `npm run build`             | PASS: Desktop budgets, topology, CSP and package content                                  |
| `npm run build:web`         | PASS: release WASM, Web budgets, topology and CSP                                         |
| `npm run check:quick`       | PASS: all 19 stages in 85.8 seconds, including TypeScript and the complete Rust workspace |

The fixed Stage 7 bundle-growth envelopes are 32 KiB for the Desktop renderer, 24 KiB for initial
Web JavaScript and 20 KiB for the Web shell. The final measured artifacts remain within those
ceilings: Desktop renderer 639,713/655,360 bytes; initial Web JavaScript 442,307/450,560 bytes; Web
shell 598,691/606,208 bytes. Deferred, runtime, worklet and WASM ceilings were not relaxed, and the
policy suite retains a one-byte-over-budget failure check.

Production-browser acceptance covered true-empty and existing-project creation, single-draft
ownership, suspend/resume/cancel and engine-failure non-mutation, compact drawer, light/dark and
constrained-height layouts. Stage 7B retained focused range value/focus on mapped audition input,
showed the shared focus ring in both themes and produced no browser warnings or errors. The preview
environment had no usable Web audio output, so deterministic application-controller and Desktop
integration tests provide the actual plan-ordering and note-on/off evidence; no perceptual listening
claim is made.

## Resource and repository audit

Two manually terminated preview executions left recorded owner/Vite/esbuild trees alive. Each tree
was matched by exact PID, creation time, command line and parent chain before only those task-owned
processes were stopped. Locks were removed only after their absence was confirmed. Subsequent
lifecycle audits, including the final `check:quick` audit, report no recorded process, lock or
quarantine. The machine did not become noticeably slow, so no one-hour continuation was scheduled.

Stage 7A was merged into `feature/stage-7` before Stage 7B began. The final branch diff, plans,
architecture, edge cases, accessibility, localization and Desktop/Web parity are ready for the
required local merge into `main`; no push or pull request is part of this acceptance.
