# Architecture alignment before Desktop runtime

## Status and scope

**Status:** implementation in progress.

**Task integration branch:** `fix/architecture-alignment`.

**Baseline:** `d835cf9`, the accepted Stage 4 engine-core revision.

This plan aligns the implemented Stage 0-4 foundation with the approved Tiempio architecture
before Stage 5 adds native persistence, engine supervision and live audio. It fixes known contract,
command-availability, policy-performance, module-ownership and bundle-headroom risks without
implementing Desktop audio, Web AudioWorklet hosting, physical project persistence or the primary
audible vertical slice.

Yinkie remains read-only reference material. Nothing in this task runs in or modifies Yinkie.

## Required outcomes

- Repository documentation describes the implemented Stage 0-4 state and actual integration
  history without presenting Stage 5-8 behavior as available.
- Target-boundary validation scans owned source inputs only and enforces the intended TypeScript
  package and Rust crate dependency directions.
- `EngineRuntime` exposes typed command and event envelopes; production engine boundaries contain
  no `unknown` payload escape.
- The shared command registry owns command effect, availability and localized disabled reasons.
- Unavailable audio cannot appear to play, stop or report Shared Audio as active.
- Protocol and application orchestration hotspots are separated along existing responsibilities
  without changing project revisions, protocol bytes or Stage 4 golden audio.
- Initial Desktop/Web shell graphs retain measured headroom without raising the accepted bundle
  ceilings merely to hide growth.

## Explicit non-goals

- native engine process supervision or a platform audio backend;
- WASM or AudioWorklet packaging;
- physical ZIP project archives, dialogs, atomic Save, Download or IndexedDB;
- real-time computer-keyboard audition or transport;
- new synth, drum, theory, arrangement or export behavior;
- GitHub Actions or other repository-hosted automation;
- merging to `main`, pushing or opening a pull request.

## Delivery method

Only the primary Tiempio worktree is used. This integration branch owns the plan and completed
stage merges. Each implementation stage uses a separate branch from the current integration head,
contains focused changes and atomic English commits, and is verified before a fast-forward merge
back into `fix/architecture-alignment`.

Resource-intensive validation, Rust compilation and production builds run sequentially through
the existing lifecycle owner. Every stage has bounded commands, progress heartbeats and explicit
timeouts. After every commit, the exact lifecycle journal, lock, quarantine and recorded process
identities are audited before another check, commit, branch or merge begins.

## Stage A - Documentation and delivery-state alignment

**Branch:** `fix/alignment-documentation`.

- Update the application-skeleton status from the original planning baseline to the implemented
  Stage 0-4 state.
- Record the actual local fast-forward integration history while leaving historical branch refs
  untouched.
- Correct the stale Stage 4 merge note and the Stage 3 evidence wording around presentation-only
  layer selection.
- Align documented topology names with the implemented `drums` feature and `offline-render` crate.
- State the current truthful boundary: shared in-memory editing and deterministic offline DSP are
  present, while runtime audio and durable target persistence are not.

## Stage B - Bounded dependency-policy scope and direction

**Branch:** `fix/boundary-policy-scope`.

- Enumerate tracked repository source and manifest files instead of recursively walking generated
  build caches.
- Explicitly exclude `.git`, `node_modules`, `dist`, `.test-out`, `artifacts` and `engine/target`
  from any fallback traversal.
- Encode the approved TypeScript package dependency matrix and Rust crate dependency matrix.
- Retain existing shared/Desktop/Web/platform isolation and public-package-entry checks.
- Add deterministic fixtures proving allowed edges, forbidden inversions and ignored build output.
- Record policy duration as non-gating evidence; correctness is enforced structurally rather than
  by a flaky wall-clock unit assertion.

## Stage C - Typed application-to-engine runtime

**Branch:** `fix/typed-engine-runtime`.

- Bind `EngineRuntime.send` and `EngineRuntime.onEvent` to the public typed engine command/event
  envelopes.
- Keep protocol DTO authority in `packages/contracts` and target-neutral sequencing/handshake
  coordination in `packages/engine-client`.
- Update unavailable runtimes, Desktop renderer adapters and test fakes without connecting audio.
- Cover compatible handshake, sequence monotonicity, typed send/event flow, stale revision evidence
  and unavailable capability behavior.

## Stage D - Command availability and truthful shell state

**Branch:** `fix/command-availability`.

- Extend command definitions with effect ownership, availability and localized disabled reasons.
- Resolve availability from immutable runtime capabilities and current project/presentation state.
- Enforce the same result for visible controls, DOM shortcuts and native command requests.
- Disable transport play/stop while the engine capability is unavailable.
- Replace the local fake playing state and unconditional Shared Audio label with a truthful audio
  availability presentation.
- Render tempo as a non-interactive value until a real edit command exists.
- Add source and behavior tests proving that no visible enabled control is handlerless or bypasses
  command availability.

## Stage E - Protocol module boundaries

**Branch:** `fix/protocol-module-boundaries`.

- Split Rust wire DTOs, command decoding, render-plan conversion, event encoding and tests into
  focused modules behind the existing public `tiempio-engine-protocol` API.
- Split TypeScript protocol DTOs, command validation, event validation and session state behind the
  existing `packages/contracts` public boundary.
- Preserve generated stable codes, diagnostics, frame limits, shared fixtures and serialized bytes.
- Prove the Stage 4 golden digest and offline metrics remain unchanged.

## Stage F - Shared application orchestration boundaries

**Branch:** `fix/application-orchestration-boundaries`.

- Keep `StudioApplication` as a composition root while extracting navigation, transport and
  feature-specific project command controllers.
- Split shared project projections by feature behind one stable facade.
- Split the monolithic application stylesheet into shell/layout and feature-owned styles while
  retaining the single design-system scrollbar, dropdown, focus and semantic-token treatment.
- Split project validators and reducers only where current domain boundaries are already explicit;
  line count alone is not a reason to add abstractions.
- Preserve one `ProjectSession`, presentation-only selection and identical Desktop/Web behavior.

## Stage G - Initial bundle headroom

**Branch:** `fix/bundle-headroom`.

- Retain bundle attribution for the current shared shell.
- Introduce measured lazy boundaries for feature surfaces that are not required on Home.
- Keep future engine-client, WASM/worklet and audio-activation graphs outside the initial shell.
- Add chunk-topology policy coverage and check for duplicate framework/localization/protocol code.
- Do not raise the existing 393,216-byte renderer/Web ceiling without a separate reviewed decision.

## Stage H - Combined acceptance and documentation closeout

**Branch:** `fix/alignment-acceptance`.

- Review the combined diff against this plan, the architecture and every recorded issue.
- Run focused checks, TypeScript tests/typechecks, Rust tests and dependency policies.
- Run Desktop/Web production builds and bundle attribution sequentially.
- Inspect unavailable audio/tempo controls in Light, Dark, compact and constrained-height states.
- Reproduce Stage 4 protocol fixtures and golden offline evidence.
- Update retained documentation with actual final behavior and residual limits.
- Run the complete bounded `checks` workflow and final lifecycle audit.

## Edge cases and regression risks

- A typed runtime refactor must not create a `contracts`/`engine-client` dependency cycle.
- Disabled commands must remain unavailable through keyboard shortcuts and native requests.
- A runtime capability changing after mount must not leave stale enabled controls.
- Presentation-only selection must not begin advancing project revisions during controller splits.
- Protocol module moves must not change serde names, JSON key casing, diagnostic codes, ordering,
  frame limits or shared fixture interpretation.
- Lazy feature boundaries must not duplicate React, i18next, project authority or command providers.
- Dynamic imports must preserve CSP, offline/static Web behavior and target separation.
- CSS splitting must preserve one application-owned dropdown and scrollbar treatment across all
  features, schemes and constrained layouts.
- Policy enumeration must work from the primary worktree on Windows and remain path-separator safe.

## Verification strategy

Each stage receives focused unit/policy tests and the smallest relevant lifecycle-owned check. Heavy
workflows are not run concurrently. The final combined branch runs, in order:

1. lifecycle and dependency policies;
2. formatting, lint and generated protocol checks;
3. TypeScript contract tests and Node/Web typechecks;
4. Rust format, clippy and workspace tests;
5. target, package-direction, Rust-crate and UI-control policies;
6. Desktop and Web production builds;
7. bundle budgets, attribution and chunk topology;
8. Stage 4 offline golden evidence;
9. focused real-browser UI inspection;
10. full `checks` and exact lifecycle audit.

## Definition of done

- Documentation and Git state describe the same Stage 0-4 implementation boundary.
- The boundary policy ignores generated caches and rejects every forbidden dependency edge.
- Production engine runtime commands and events are typed end to end.
- Command definitions own effect and availability; unavailable commands cannot execute by any path.
- The shell never claims active Shared Audio or playback without engine acknowledgement.
- Protocol and application modules have focused ownership with stable public facades.
- Project revisions, canonical format fixtures and Stage 4 golden audio remain unchanged.
- Desktop and Web production artifacts pass existing target and size ceilings with measured
  headroom.
- The integration branch is clean, contains no unrelated changes and leaves no task-owned process,
  lifecycle lock or cleanup quarantine.
