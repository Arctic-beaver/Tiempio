# Stage 6 Web runtime evidence

## Result

**Recorded:** 2026-08-13  
**Integration branch:** `feature/skeleton-web-runtime`  
**Verification branch:** `feature/web-runtime-verification`  
**Status:** implementation complete and ready for review; the external-browser release matrix is
retained as an explicit pre-distribution limitation below.

The production Web target now composes the shared application with browser projects, settings,
recovery and a deferred Rust/WASM `AudioWorklet` engine. It remains a static, local-first artifact:
no account, cloud service, application-content network API, Electron bridge or Node filesystem is
present in the Web runtime.

## Reproducible automated gates

All resource-intensive commands ran sequentially through the repository lifecycle owner. Every run
was followed by `npm run lifecycle:audit`; the final audit reported no lock, quarantine or recorded
task-owned process.

| Gate                              | Retained result                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `npm test`                        | PASS: 200 TypeScript contract/unit tests and 96 repository-policy tests              |
| `npm run lint`                    | PASS                                                                                 |
| `npm run typecheck`               | PASS: Node and Web configurations                                                    |
| `npm run check:rust`              | PASS: Rust format, check, Clippy and tests                                           |
| `npm run check:target-boundaries` | PASS                                                                                 |
| `npm run check:security`          | PASS: production CSP policy                                                          |
| `npm run build:web`               | PASS: Web typecheck, release WASM, production build, CSP, budgets and chunk topology |
| `npm run build`                   | PASS: Desktop production build, CSP, budgets, topology and package-content policy    |

The final Web budget result was:

| Class                                       |   Bytes | Ceiling | Headroom |
| ------------------------------------------- | ------: | ------: | -------: |
| Initial JavaScript                          | 425,554 | 425,984 |      430 |
| Deferred application                        |  74,643 |  81,920 |    7,277 |
| Web runtime JavaScript                      |  99,984 | 196,608 |   96,624 |
| Worklet JavaScript, excluding embedded WASM |   5,308 |  65,536 |   60,228 |
| Release WASM                                | 626,385 | 786,432 |  160,047 |
| Shell output                                | 577,479 | 585,728 |    8,249 |

The final Desktop budget result was `214,395 / 229,376` main bytes,
`58,445 / 61,440` preload bytes and `613,575 / 622,592` renderer bytes.

## Production Web artifact inventory

The inventory below is from the passing `npm run build:web` output. Every emitted filename is
content-hashed except the required static `index.html`; no source map was emitted.

| Path                                         |   Bytes | SHA-256                                                            |
| -------------------------------------------- | ------: | ------------------------------------------------------------------ |
| `index.html`                                 |     791 | `3a9027fa050784274d146484d93b40dfc0a5dd3f17beae92b7a1b047ae9b4bd7` |
| `assets/tiempio-Nvhtlzzv.svg`                |     458 | `020798670fff3f25f55eec46c6932ce07217d9e9418e46b846041fbc1149eb1a` |
| `assets/index-dHvjNH_w.css`                  |  48,322 | `35e3b8aabacdeee8709ff8018aab2ddb47955a8389b656846b81809ae15f47f0` |
| `assets/SettingsDialog-raWEfWBK.css`         |   3,983 | `ffa13372486ccd8ec0360e9f5a125be34e7aa6549bcec52d248fb8951eddf141` |
| `assets/EditorSurface-CFB9_sip.css`          |  23,350 | `db97dd9c257c313f1b3567ca04f8309658896e91573c72c6377b197317fe0b49` |
| `assets/web-entry-CnNHyZAb.js`               | 425,932 | `6e8c3a80a72d9bb08904f79fc828134b08a89356e839d08bb430fc1f78655241` |
| `assets/mountRuntimeApplication-DqSrBrIk.js` |  21,564 | `9bfdda0674edebac223d2792be91863694a4de14daba0ac4392a28cd2b8f5420` |
| `assets/EditorSurface-DFJHvH3R.js`           |  33,633 | `aab52c625ed96c5ddf88f56ecba009a47c4536a1a4bbd3a19d662c7f54afa17e` |
| `assets/SettingsDialog-CpXU-W3U.js`          |   7,020 | `2d84e519fe93cd56e95df3aff5096201fb30ee40564393df776f8305f955ad3a` |
| `assets/WorkflowSurface-DlkO18OR.js`         |  18,400 | `dc4db1394d5b31a4c48b74c304a93d1417b87950feb967b3b2d97750a7079a4c` |
| `assets/TransportBar-LP7vZGNu.js`            |  15,590 | `339860524751d35c9e9c9c1c9bc2aa8a0253d71b5a26483943ebc91ea53bad28` |
| `assets/index-jQ5yTG8f.js`                   |   9,345 | `bedf909d72b17a1ada3000a251189b2fa6f1b1227801bad660e30d9a936d9751` |
| `assets/index-dr4sGpMC.js`                   |   9,893 | `b44ec61813235c97f73620f3690c195b03aef076212c41ff710619f2e860d511` |
| `assets/WebProjectsRuntime-DCu_hkT_.js`      |  22,639 | `5cafc497ea7845eaf136910b0be5a0b2d26d3e0dbe2bd70d89d8e58dbc655fb9` |
| `assets/physical-archive-B5XCq9XC.js`        |  19,949 | `e74edfa0cfed056ad56ca6a82e02033e8bad81f59c91ce3f1ebedaf457b2c2e8` |
| `assets/WebEngineRuntime-DfT_j1X_.js`        |   5,912 | `4494962e846f8920dc7527b0da051000d77bd6d0a8853ef568a6b4fde2a17e65` |
| `assets/webAudioWorkletAdapter-cX52YlvD.js`  |   6,025 | `ae6b53e20c1f2cfa425ccff9742623e68a59b4e7fdf619dc0b6afb0835da4829` |
| `assets/engine-event-validation-DWFyEGTl.js` |   5,288 | `00006b1d87f56bd310375acc51bba5530258bf5567e35ca93fac890854aabc7d` |
| `assets/web-worklet-HmYwyflF.js`             | 840,488 | `9e74c55742bb2ebcedcf71a0ea937c51914c69dca6e3e7b6b42077d0a76c3c66` |

The checked import graph has these security-relevant edges:

- `index.html` loads only `web-entry` and the shared shell stylesheet;
- `web-entry` dynamically imports the application mount, editor/workflow/settings surfaces and Web
  projects runtime;
- `WebProjectsRuntime` dynamically reaches `physical-archive` and its lazy compression dependency;
- `WebEngineRuntime` dynamically reaches `webAudioWorkletAdapter`, which alone owns the hashed
  worklet URL;
- the worklet owns the encoded release WASM payload, so startup performs no WASM fetch;
- the topology policy proves the engine client, Web runtime, worklet, WASM and physical archive are
  absent from the initial shell class.

The production CSP keeps `connect-src 'none'`, forbids ordinary `unsafe-eval`, and permits only the
narrow `wasm-unsafe-eval` needed to compile the packaged engine. Target-boundary and package-content
policies reject Electron, native-host, Node filesystem and Desktop bridge reachability from Web or
shared bundles.

## Browser acceptance

### Tested environment

| Browser surface                | Operating system                             | Result                       | Notes                                                            |
| ------------------------------ | -------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| Codex in-app Chromium          | Windows 11 Home Single Language `10.0.26200` | PASS for the scenarios below | The connector does not expose an exact Chromium product version. |
| Google Chrome `151.0.7922.109` | Installed on the same Windows host           | NOT RUN                      | The Chrome control extension was not connected.                  |
| Microsoft Edge `151.0.4129.78` | Installed on the same Windows host           | NOT RUN                      | No Edge-controlled session was available.                        |
| Firefox                        | Not installed on the acceptance host         | NOT RUN                      | Requires a separate release-matrix host.                         |

The tested artifact was served by `npm run preview:web` at `http://127.0.0.1:4173`, which is the
supported localhost secure-context exception. Direct `file://` execution is not supported.

### Exercised in the real production UI

- Initial mount did not create a ready audio graph. The existing Retry action was enabled and one
  user action advanced the real `AudioWorklet` to `Audio ready`.
- Representative engine-timed previews were exercised for Bass, Lead, Pad, Pluck and Texture.
- Procedural drum variants were changed and auditioned. A discovered duplicate-render-plan defect
  was fixed: an already accepted project revision is no longer resent before drum audition. Both
  `Tight` and `Soft` auditions retained `Audio ready` with no Retry state.
- Play/Pause, seek and metronome controls remained live through the worklet. The deterministic Rust
  parity test additionally covers stop, loop, preview cancellation, finite output and metronome
  energy on the shared realtime path.
- The Settings design-system listbox changed System to Dark; Dark remained selected after reload
  through the real IndexedDB-backed settings runtime.
- Home and activity-rail Open actions were enabled and synchronously opened the browser-native file
  picker. The picker itself is outside the connector's file-upload surface, so no private local file
  was selected during this run.

The automated WASM harness proves non-silent finite output for all five synth families and the
procedural drum plan. The browser run proves real graph readiness and transport behavior, but it is
not a perceptual listening certification because this agent cannot monitor the host speakers.

## Persistence and degradation evidence

The deterministic Web runtime suite covers the paths that cannot safely be forced through a user's
native picker or storage settings during automated acceptance:

- bounded file-input snapshot fallback without a false direct-write claim;
- granted direct write, permission denial/revocation and external fingerprint conflict;
- Save As binding only after verified write/close/re-read;
- canceled operations and Download as `download-requested`, never persisted;
- rejection of every non-current archive before a project handle is registered;
- settings defaults only for absence, latest-revision checksummed recovery and corrupt recovery;
- blocked, aborted and quota/storage failures while the in-memory application remains usable;
- opaque-handle validation so raw browser handles, names and bytes do not cross the adapter boundary.

The shared physical ZIP tests cover traversal, normalized duplicates, excessive ratios, CRC failure,
bounded inflate and round-trip compatibility for both Desktop and Web adapters.

## Definition-of-done mapping

| Criterion                                          | Evidence                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| One controller, activation-owned AudioWorklet/WASM | Web engine/runtime tests plus the real `Audio ready` browser run                                  |
| Shared synth/drum DSP and engine-clock behavior    | Rust native/WASM parity, 200 contract tests and real family/drum/transport interaction            |
| Bounded realtime failure behavior                  | Rust queue, stale-revision, non-finite and render-bound tests; Web generation/timeout/fatal tests |
| Browser project, settings and recovery semantics   | Web project and IndexedDB suites; real native-picker invocation and settings reload               |
| Static security and target separation              | CSP, target-boundary, chunk-topology, bundle-budget and Desktop package gates                     |
| Desktop non-regression                             | Final Desktop production build/package pass and shared test suite                                 |
| Resource ownership                                 | Sequential lifecycle runs and final clean lifecycle audit                                         |

## Explicit retained limitations

These items are not represented as passed and must be re-recorded before public distribution:

- exact latest-stable Chrome, Edge and Firefox interactive runs, including browser-specific writable
  handle and fallback behavior;
- a real native-picker round trip using a dedicated non-private fixture file;
- DevTools network-panel capture. The static artifact and `connect-src 'none'` policy provide the
  enforceable no-transport boundary, but no retained HAR is claimed;
- instrumented browser activation/first-output latency, peak-memory and per-render timing capture.
  Bounds, finite output, queue capacity and no render-time memory growth are covered by deterministic
  tests, but host-level performance numbers are not claimed here;
- a human perceptual listening pass and physical context suspension/resume on each release browser.

These are acceptance-environment limits, not hidden product fallbacks. The implementation and
automated gates remain review-ready without increasing authority or weakening browser behavior.
