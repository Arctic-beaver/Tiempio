# Stage 9B recording session evidence

## Scope

The application recording session now owns one engine-clock pass independently of React and the
currently mounted source editor. `PerformanceRecordingCoordinator` captures the target
`ProjectSession`, rejects stale recording IDs, reconciles engine state/input acknowledgements and
commits canonical source commands under one explicit history group.

## Retained invariants

- Count-in and interrupted pre-roll remain mutation-free, including an engine interruption whose
  reason is broader than `count-in-canceled`.
- Entering recording extends the selected MIDI source at the exact source tick. Beat checkpoints
  and Stop preserve silent linear range as well as played notes.
- Engine-acknowledged note-on creates a one-tick canonical note; note-off and Stop finalize exact
  duration. A first recorded note may create the source's first song instance in the same Undo
  group.
- Held inputs release before Stop. Blur, visibility loss, device loss, retry, project switch and
  close either receive the engine Stop acknowledgement or close at the last trusted tick and enter
  explicit recovery.
- Render-plan publication is held for the complete pass and publishes only the newest canonical
  revision after release, preventing double playback of live input.
- Undo and Redo share the centralized command-availability gate and are unavailable for every
  active recording phase.
- Keyboard, mouse, touch, pen and the reserved MIDI adapter boundary emit the same immutable input
  event with source ID/kind, phase, pitch, velocity and optional non-authoritative source timestamp.
  Touch and pen use one finite clamped pressure curve; mouse and physical keys retain the explicit
  fallback velocity. Same-pitch sources stay independent through their complete release lifecycle.

## Automated evidence

- `performance-recording-coordinator.test.ts` covers grouped Undo/Redo, stale IDs, mutation-free
  count-in interruption, silent extension, trusted-tick failure, held-note closure and
  project-session switching.
- `ApplicationRuntimeController.test.ts` exercises count-in, recording input commands, authoritative
  engine acknowledgements, canonical mutation, render-plan hold, exact Stop and post-pass plan
  publication through the real controller/engine-client boundary.
- `command-availability.test.ts` proves that visible controls, DOM shortcuts and native requests use
  the same recording-aware Undo/Redo gate.
- `performance-input-session.test.ts` covers keyboard timestamps, mouse fallback, touch/pen pressure,
  independent pointer capture and a bounded MIDI-ready device/channel/note identity.
- `recording-presentation.test.ts` covers Record/count-in/REC/Stop presentation, engine-clock
  cursor projection, live-note growth, horizontal-only auto-follow, pass feedback and independent
  performance-keyboard disclosure.
- Production Web interaction checks at 1280x720 and 640x520 covered count-in, recording, a live
  note beyond the previous material end, Escape Stop, one-step Undo/Redo and independent dock
  collapse. The compact pass retained a reachable Record control.
- `npm test` passed 235 contract/application tests and 101 repository-policy tests on 2026-08-15.

The engine protocol and Native/Web timing parity evidence remains in
[`STAGE-9B-RECORDING-PROTOCOL.md`](STAGE-9B-RECORDING-PROTOCOL.md).
