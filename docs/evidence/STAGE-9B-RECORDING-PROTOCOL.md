# Stage 9B engine-clock recording protocol evidence

## Scope

This evidence covers the Stage 9B engine boundary that converts live performance input into
authoritative source ticks. Protocol version 9 adds one common `recording.engine-clock`
capability, bounded start/input/stop commands and recording state/input/stopped events for both
the native shared-output host and the Web AudioWorklet.

The application coordinator and recording UI consume this boundary through the completed Stage 9
integration.

## Realtime ownership and bounds

- `PreparedRecording` resolves the project revision, meter-aware count-in, pre-roll and tempo
  timeline on the control side before entering the callback.
- The callback uses the monotonic engine render clock and nearest-tick conversion. The render
  clock is independent from transport resets, seeks and loop wrapping.
- Count-in beats, held inputs and critical-event fallback storage have fixed protocol ceilings.
  No recording vector grows in the warmed callback.
- Notes pressed during count-in sound immediately and are acknowledged at the exact recording
  boundary. Stop closes every acknowledged held note at one authoritative stop tick.
- Render-plan publication is held while recording. Play, stop, seek, preview, shutdown and device
  loss interrupt the active recording through an explicit terminal reason.
- Native and Web adapters use the same `PreparedRecording`, `RealtimeCommand` and
  `RealtimeEvent` path. Target-local code only validates the active recording/layer and transports
  the common protocol.

## Retained automated evidence

| Check                        | Result                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `npm run check:rust`         | PASS: format, workspace check, strict Clippy and all Rust tests                |
| Native engine-clock scenario | PASS: note-on/off and stop use the shared render-clock tick conversion         |
| Web count-in scenario        | PASS: four-beat count-in, held note boundary, note-off and stop ticks          |
| `npm test`                   | PASS: 235 contract/application tests and 101 repository-policy tests           |
| `npm run check:web-engine`   | PASS: target check, deterministic tests, release build and live WASM parity    |
| Release WebAssembly          | PASS: recording lifecycle included; 725,026 bytes, below 786,432-byte ceiling  |
| Post-run lifecycle audit     | PASS after every validation; no task-owned process, lock or quarantine remains |

## Failure and recovery cases covered

- incompatible protocol/capability negotiation and malformed or oversized identifiers;
- stale project revision, missing render plan, unsupported target layer and duplicate recording;
- bounded command/event saturation and held-input ceiling;
- cancellation during count-in, ordinary stop, interruption and held-note closure;
- count-in that begins before source tick zero by combining metronome-only delay with available
  source pre-roll;
- deterministic Native/Web event parity without using UI timestamps as musical truth.
