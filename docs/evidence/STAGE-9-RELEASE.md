# Stage 9 release evidence

## Delivered boundary

Stage 9 is complete on `feature/brick-editor-performance`. The integration contains the current-only
source-material/song-instance cutover, per-source semantic editor viewport, complete engine-clock
recording protocol, coordinator/history/recovery boundary, normalized keyboard/mouse/touch/pen
input and the responsive Record/count-in/live-note performance UI.

The delivery intentionally stops before Stage 10 linked-song scheduling and composition. The
existing compiler flattens current instances deterministically until Stage 10 consumes the source
and viewport authorities established here.

## Sequential delivery history

| Boundary                   | Branch commit | Integration merge |
| -------------------------- | ------------- | ----------------- |
| Source domain              | `ea6dbd0`     | `2056150`         |
| Semantic editor            | `dd678b5`     | `a6d4c91`         |
| Recording protocol         | `b32217d`     | `9cadb03`         |
| Coordinator and durability | `ef06a94`     | `b818c0f`         |
| Expressive input           | `b997867`     | `982b8f0`         |
| Recording UI               | `4ddceb4`     | `c76f334`         |

Each stage was committed atomically on its own sequential branch, audited, and merged back into the
same integration branch before the next stage began. No worktree, push, pull request, `main` merge or
repository-hosted workflow was created.

## Automated verification

| Gate                       | Retained result                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check:quick`      | PASS 19/19: policy, generated contracts, formatting, lint, boundaries, UI/security/package policy, 235 TypeScript contract/application tests, 101 repository-policy tests, Node/Web typecheck, Rust format/check/strict Clippy/tests |
| `npm run build:web`        | PASS 7/7: Web typecheck, WASM inventory/build, production build, CSP, bundle budgets and topology                                                                                                                                    |
| `npm run check:web-engine` | PASS 5/5: target check, seven deterministic scenarios, release build and live WASM parity across five synth families, drums, controls, recording and bounded failures                                                                |
| `npm run package:check`    | PASS 11/11: Node/Web typecheck, native host release/staging, Desktop build, CSP, measured budgets, topology, package policy, unpacked Electron package and native-resource verification                                              |
| Lifecycle audit            | PASS after validation and packaging; no recorded task-owned process, lock or quarantine remained                                                                                                                                     |

The release WebAssembly is 725,026 bytes against a 786,432-byte ceiling. Measured production bundle
classes are:

| Class                    |  Actual | Ceiling | Remaining |
| ------------------------ | ------: | ------: | --------: |
| Desktop main             | 218,312 | 229,376 |    11,064 |
| Desktop preload          |  61,702 |  62,464 |       762 |
| Desktop renderer         | 691,073 | 692,224 |     1,151 |
| Web initial JavaScript   | 467,354 | 471,040 |     3,686 |
| Web deferred application |  91,863 |  98,304 |     6,441 |
| Web shell output         | 648,978 | 651,264 |     2,286 |

Stage 9 owns an explicit measured growth envelope: 1 KiB for the recording-capable Desktop preload,
36 KiB for the Desktop renderer, 20 KiB for Web initial JavaScript, 16 KiB for deferred application
and 44 KiB for Web shell output. The one-byte-over-ceiling policy remains enforced by unit tests.

## Production interaction evidence

The production Web build was exercised at 1280x720 and 640x520. Audio activation succeeded; `R`
entered count-in and then recording; the REC bar/beat state and engine-clock recording cursor were
visible; a physical `A` created a growing A2 note beyond the former material end; `Escape` stopped
the pass; one Undo removed the whole pass and Redo restored it. The performance keyboard dock
collapsed independently. After a compact-layout correction, the Record control remained reachable
at 640x520 without changing the application-wide scrollbar treatment.

## Fresh unpacked Desktop package

- Directory:
  `D:\Work\TiempioProject\Tiempio\artifacts\packages\win-unpacked`
- Executable:
  `D:\Work\TiempioProject\Tiempio\artifacts\packages\win-unpacked\Tiempio.exe`
- Executable size and timestamp: 225,949,696 bytes; `2026-08-15T04:00:02.2229810Z`.
- Application archive: 32,222,142 bytes.
- Verified native host: 1,214,464 bytes; SHA-256
  `C62B90FA8DD16776A064D60BD4E7C48A74E827C178FD9786E8AFDB7DC05F768F`.

## Retained manual observations and non-goals

- Launching the new unpacked Desktop GUI on the user's actual audio device, listening for latency
  or glitches and exercising physical touch/pen hardware remain manual checks; packaging and native
  resource integrity are automated and passed.
- MIDI device permission, discovery and routing are not implemented. Stage 9 provides the bounded
  normalized MIDI-ready event seam only.
- Stage 10 linked-song composition/scheduling and Stage 12 audio-file/microphone recording remain
  separate approved phases.
- The deferred Stage 8 human preference study is not claimed as passed and did not block its merged
  engineering package or Stage 9.
