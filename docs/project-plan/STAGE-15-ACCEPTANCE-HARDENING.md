# Stage 15 — combined acceptance hardening and evidence

## Status and placement

**Status:** approved planning baseline; implementation has not started.

Stage 15 begins only after Stages 7–14 have met their focused exit criteria. It adds no substitute
architecture and no large product feature. Its job is to audit the integrated Desktop/Web product,
close omissions and retain reproducible evidence before Stage 16 external interchange import adds a
new untrusted-file boundary.

The master roadmap remains
[`APPLICATION_SKELETON.md`](APPLICATION_SKELETON.md); each numbered stage document owns its focused
behavior. Stage 15 maps every required criterion to an executable check or a retained manual witness.

## Required audit scope

### Product and UX

- Stage 7 context-preserving Add draft, focus-safe Fine Tuning audition and exact commit/cancel rules;
- Stage 8 complete perceptual catalog evidence, current resolved-patch conformance and native/WASM sound;
- Stage 9 note editing, two-axis navigation, ghosts, per-brick viewports, playheads, count-in,
  velocity/pressure, linear overdub and grouped Undo;
- Stage 10 source/instance integrity, independent brick preview and synchronized lower song;
- Stage 11 empty-start truthfulness, fresh starter copy, provenance and ten curated rhythms;
- Stage 12 explicit sample/phrase split, approved microphone recorder, portable assets and fixed-time
  audio behavior;
- Stage 13 dedicated revision-bound stereo WAV Export;
- Stage 14 complete wide/compact/tablet/phone adaptation, including the header collision regression.

### Architecture, security and durability

- one canonical `ProjectSession`, render-plan compiler and Rust DSP authority on both targets;
- current-only loading, source references, project ceilings and stale revision handling;
- opaque Desktop paths/device handles and target-clean Web bundles;
- physical `.tiempio` archive, portable audio assets, Save/Download/recovery truthfulness;
- no network transfer of project/audio/name/path/device content;
- callback no-allocation/no-I/O contract, bounded protocol and asset registration;
- exact cleanup for save, recording, import, export, Worker, native host, temporary file and lock paths;
- supported OS/browser/device matrix and explicit residual risks.

## Implementation order

**Integration branch:** `feature/stage-15-acceptance`, created from the completed Stage 14 integration
branch.

1. `feature/acceptance-manifest` — machine-readable mapping from every Stage 0–14 criterion to test
   or retained evidence, with no unowned requirement;
2. `fix/integrated-omissions` — only evidence-backed gaps/regressions found by the audit, kept in
   focused atomic commits;
3. `feature/cross-target-release-evidence` — packaged Windows and production Web behavior, target
   topology and artifact inspection;
4. `feature/visual-accessibility-evidence` — light/dark and wide/compact/tablet/phone matrix,
   keyboard/touch/screen reader/high contrast/reduced motion;
5. `feature/audio-performance-evidence` — native/WASM parity, listening witnesses, callback, memory,
   render-plan, recording and offline-export budgets;
6. `feature/final-lifecycle-audit` — sequential release workflow, interruption/failure cleanup and
   documentation reconciliation.

If the audit reveals a missing architectural capability, work returns to the owning numbered stage
and updates its plan before implementation. Stage 15 cannot hide architectural redesign inside a
generic “acceptance fix”.

## Combined validation sequence

The fail-fast lifecycle owner runs sequentially and stops at the first failure:

1. dependency reproducibility and security policy;
2. formatting/lint and Markdown/reference integrity;
3. generated protocol/schema consistency;
4. TypeScript unit/property/integration tests and type checks;
5. Rust format, lint, tests and native/WASM deterministic fixtures;
6. project/archive/audio-asset/import/export hostile-input policy tests;
7. Desktop production build, unpacked package and exact artifact inspection;
8. packaged Windows primary-path/audio/durability/recording/export scenarios;
9. Web production build, bundle topology and supported-browser scenarios;
10. native/Web audio comparison and measured performance ceilings;
11. complete visual/responsive/accessibility matrix;
12. final documentation/acceptance-manifest reconciliation;
13. process-tree, Worker, temporary output, lock and cleanup-quarantine audit.

Every stage has a bounded timeout and heartbeat. The overall run forwards interruption through one
cleanup path and terminates only exact task-owned process trees. Resource-intensive stages never run
concurrently.

## Definition of done

- Every Stage 0–14 exit criterion has a passing executable test or retained, reviewable evidence.
- The primary create/audition/edit/record/arrange/save/reopen/export flow works in a clean packaged
  Windows build and supported production Web browsers.
- Built-in and personal audio reproduce within documented native/WASM tolerances; no approved sound
  or macro regresses its quality evidence.
- Responsive Desktop/tablet/phone presentations pass the finite supported matrix without overlap,
  unreachable controls, lost state or project/audio side effects.
- Security, privacy, persistence, recovery, external-resource and real-time invariants fail closed.
- Documentation describes actual behavior and explicit remaining limits without advertising future
  Stage 16 or later functionality as implemented.
- The integration branch contains no unrelated user changes and no task-owned process, Worker,
  temporary output, lock or cleanup quarantine after success, failure, timeout or interruption.
- The product is ready for the separate Stage 16 interchange-import boundary; Stage 15 itself does
  not parse MIDI/stems or proprietary DAW projects.
