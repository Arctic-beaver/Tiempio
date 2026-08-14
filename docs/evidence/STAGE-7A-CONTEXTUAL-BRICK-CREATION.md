# Stage 7A contextual brick creation evidence

## Result

**Recorded:** 2026-08-14

**Integration branch:** `feature/stage-7`

**Implementation branch:** `fix/contextual-add-brick`

**Status:** complete and accepted for integration into Stage 7.

Stage 7A replaces eager project mutation with a single application-owned creation draft. The draft
is visible beside canonical layers but remains outside `ProjectDocument`, render-plan compilation,
persistence, history and layer counts until the user explicitly accepts an engine-ready candidate.

## Architecture and implementation

- `ProjectSession` now exposes prepared transactions. Commands are reduced and validated against one
  base revision, then published atomically as one revision and one Undo/Redo unit only on commit.
- `LayerCreationCoordinator` owns the bounded one-draft state machine, navigation suspension,
  cancellation, retry and a shared commit lock. It never leaks its branded draft identifier into a
  project command.
- A candidate synth is appended only at the application-controller wire-plan boundary. Draft plans
  are event-free; commit waits for the exact engine plan-generation/revision acknowledgement.
- Candidate failure, timeout, stale acknowledgement, cancellation or project replacement restores
  the canonical plan and discards the prepared transaction. Successful publication reuses the
  already accepted plan and does not send a duplicate load.
- The first-layer route is now a true zero-layer onboarding. Existing projects keep their editor,
  selected layer, transport and navigation context while the shared draft card appears in the real
  Desktop layer list or compact drawer.
- The Sound Chooser receives an explicit draft target. Synth and drum configuration is finalized in
  the single `layer.add` boundary; merely choosing a role, preset or kit creates no canonical state.
- The Desktop layer list and compact drawer share the application `ScrollSurface`, semantic theme
  tokens, localized EN/RU/ES copy and the same coordinator actions.

## Automated gates

All resource-intensive commands ran sequentially. Each lifecycle run was followed by an exact
process/lock audit.

| Gate                        | Result                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| `npm test`                  | PASS: 207 compiled contract/unit tests and 96 repository-policy tests |
| `npm run lint`              | PASS                                                                  |
| `npm run typecheck:web`     | PASS                                                                  |
| `npm run check:visual-a11y` | PASS: shared UI policy, Web typecheck, production Web build and CSP   |

Targeted coverage includes transaction invisibility and atomic history, foreign/stale/reused
prepared transactions, the bounded draft state machine, protocol-safe identifiers, candidate-plan
acknowledgement and rollback, no duplicate plan publication, double-accept suppression and cancel
during an in-flight commit.

## Production Web acceptance

The production artifact was served at `http://127.0.0.1:4173` and exercised in the Codex in-app
Chromium surface.

- Adding beside four existing layers kept all four rows, the selected editor and Undo state intact;
  a repeated Add produced one draft only.
- Choosing Bass kept the canonical count at four and Undo disabled. Selecting an existing Drums
  layer suspended the draft; Continue restored the same Sound Chooser step. Escape backed out one
  step and then cancelled without mutation.
- A genuinely empty project displayed the full onboarding only at zero layers. Choosing Bass opened
  a zero-count draft; the unavailable Web audio engine produced an actionable retained error with no
  layer or Undo entry, and cancellation returned to the true empty onboarding.
- The compact 680 px drawer showed the same single card in a shared themed scroll surface. Dark,
  light and 500 px constrained-height presentations remained readable and operable.
- Browser console warning/error capture was empty.

The application-controller integration suite supplies deterministic engine acknowledgement and
rollback evidence that cannot be accepted through this browser run because the local Web preview had
no usable audio engine.

## Resource ownership

The preview ran through the bounded `preview:web` lifecycle owner. Terminating the outer execution
cell left its recorded owner/Vite/esbuild tree alive. PID, creation time, command line and parent
chain were matched to the lock before those exact three task-owned processes were stopped. The
orphaned lock was then removed and `npm run lifecycle:audit` confirmed that no recorded process,
lock or quarantine remained. No process was selected by executable name alone.

## Definition of done

Stage 7A is accepted when creation is contextual and singular, drafts cannot enter canonical state,
finalization is engine-first and atomic, cancellation is lossless, Undo/Redo contains one add, and
the same accessible behavior is available in Desktop and compact Web layouts. The implementation,
tests and browser evidence above satisfy those criteria; Stage 7B may begin after this branch is
merged into `feature/stage-7`.
