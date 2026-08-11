# Pre-Phase-6 product gate evidence

## Acceptance boundary

This evidence covers the approved D-001 through D-005 product work from
`PRE-PHASE-6-PRODUCT-DISCOVERY.md`, the integrated acceptance remediation and the Tiempio
application icon requested before final builds. It does not claim Web audio availability or replace
real-device audio, keyboard-layout, touch and display-scale observation.

The integration branch is `feature/note-editor-acceptance`. No worktree, push, pull request, merge to
`main` or repository-hosted automation was created.

## Implementation map

| Stage                  | Branch                            | Commit               | Result                                                                    |
| ---------------------- | --------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| A - overlays           | `fix/collision-safe-overlays`     | `3abf64f`            | Shared portal, collision geometry, Select and Popover treatment           |
| B - palette domain     | `feature/song-palette-domain`     | `7ff37f4`            | 24 truthful major/minor palettes, mappings and beginner chords            |
| C - performance input  | `feature/performance-input-core`  | `a8dc7af`            | Scoped physical/pointer ownership and source-counted held notes           |
| D - previews           | `feature/audition-preview-engine` | `8b3f17c`            | Bounded engine-clock audition protocol and mutual exclusion               |
| E - palette UI         | `feature/song-palette-surface`    | `fc10d07`            | Shared compact/full keyboard, setup flow, project popover and play panel  |
| F - sound demo/wave    | `feature/sound-demo-and-wave`     | `4ddd9ca`            | Transport-independent demo and confirmed-energy reactive SVG wave         |
| G - metronome          | `feature/engine-metronome`        | `3bf9797`            | Native sample-aligned meter-aware click with ephemeral settings           |
| H - transport guidance | `feature/transport-beat-ruler`    | `13cdabe`            | Beat state, meter help, absolute ruler/playheads, seek and first-use hint |
| Application icon       | `feature/application-icon`        | `61d9d15`            | Canonical SVG plus dev, Web, Windows, macOS and Linux resources           |
| Integrated acceptance  | `fix/pre-phase-6-acceptance`      | This evidence commit | Bundle attribution, viewport containment and final verification           |

## Automated evidence

The lifecycle-owned workflows ran sequentially on 2026-08-11 and passed:

- `npm run check:quick`: all 19 stages, including formatting, lint, import boundaries, UI and
  security policies, Node/Web typechecks, protocol parity, Rust format/check/Clippy and workspace
  tests;
- `npm run test`: 158 TypeScript contract tests and 88 repository policy tests;
- `npm run check:audio`: release native host build, package staging and the controlled null-audio
  self-test;
- `npm run build:web`: Web typecheck, production build, CSP, bundle budget and chunk topology;
- `npm run package:check`: all 11 Desktop stages, including the release native host, Desktop build,
  CSP, bundle/topology policies, package-content policy, Electron Builder, fuses, ASAR integrity and
  packaged native-resource verification.

Rust workspace tests cover sample-aligned metronome boundaries, stop/seek/restart cleanup,
engine-clock previews, device recovery, protocol validation, realtime allocation safety and the
deterministic offline proof. TypeScript tests cover all 24 palettes, compact/full mappings, physical
and pointer release paths, preview cancellation, waveform settling, project round-trip without note
movement, meter-aware rulers and shortcut collision avoidance.

## Bundle attribution and ceilings

The previous note-editor measurements were 493641 bytes for Desktop renderer and 463857 bytes for
Web. The complete approved feature set measures:

| Class            | Measured | Ceiling | Remaining | Topology                       |
| ---------------- | -------: | ------: | --------: | ------------------------------ |
| Desktop main     |   179981 |  196608 |     16627 | one main process entry         |
| Desktop preload  |    54493 |   57344 |      2851 | one isolated preload entry     |
| Desktop renderer |   557181 |  573440 |     16259 | 421803 initial, 67033 deferred |
| Web              |   522462 |  540672 |     18210 | 386967 initial, 67017 deferred |

Module attribution maps the renderer growth to the approved music-theory, performance keyboard,
overlay, preview, sound-wave, song-palette and transport modules. No accidental new dependency owns
the increase. The emitted Tiempio SVG adds 458 bytes to each renderer output. The ceilings are the
smallest practical 560 KiB Desktop and 528 KiB Web full-output classes that retain roughly the same
measured headroom as the previous acceptance baseline.

## Application-brand evidence

- `resources/branding/tiempio.svg` uses the exact existing title-bar mark as its canonical source;
- Electron development windows use the derived 512-pixel asset, with a macOS Dock override and a
  stable Windows application user-model identifier;
- Electron Builder consumes the multi-frame ICO, PNG-backed ICNS and named Linux PNG set;
- Desktop and Web production HTML both resolve the emitted `tiempio-Nvhtlzzv.svg` favicon;
- the final Windows package contains both the SVG favicon and runtime PNG inside `app.asar`;
- the 32-by-32 icon extracted from the final `Tiempio.exe` has zero pixel differences from the
  corresponding canonical ICO frame.

## Interactive Web evidence

The final production Web output was exercised in the in-app browser at the default Desktop viewport,
390x844 and 1024x500:

- the first-sound flow moves from `Use sound` to palette selection and then to the project;
- compact mode presents exactly seven scale notes; full mode presents the explicit
  Q-P/A-L/Z-M 26-key surface;
- Eb major keeps Eb, Ab and Bb spelling through keys and Home/Lift/Tension chord suggestions;
- the project top bar presents the applied palette, metronome controls, `4 beats in each bar` and the
  absolute bar/beat ruler without claiming audio availability in Web;
- the Song Palette popover stays inside the viewport and gives its palette list an owned scrollbar;
- Appearance and Language use the same themed listbox treatment inside compact nested dialogs;
- switching Dark to Light and English to Russian rerenders immediately and sets `html[lang="ru"]`;
- at both constrained viewports, body, application root and document dimensions exactly equal the
  viewport with no horizontal or vertical document overflow;
- no browser warning or error was recorded during the completed flow.

The browser smoke exposed a margin-collapse regression in the Web shell: the outer shell margin moved
`body` and `#root` down by 18 pixels. A root formatting context now contains that margin, and a
repository UI policy test prevents its removal. The repeated production measurement is top zero and
exactly 390x844 / 1024x500.

## Retained real-device observations

The following observations require a packaged application on the user's actual hardware and are not
represented as automated passes:

1. Audible click, visual beat, playhead and ruler alignment over play, seek, tempo change and loop.
2. Shared-output recovery across laptop speakers, wired unplug/replug and Bluetooth default changes.
3. Physical playing in English, Russian and another non-Latin/IME layout.
4. Simultaneous physical and multi-touch chords plus cancel, blur and lost-capture release paths.
5. Pointer and keyboard ruler seeking, note editing and 100-200% display scaling in the packaged app.

The controlled native tests and browser semantics cover the underlying contracts, but they cannot
substitute for those device-dependent observations.

## Lifecycle record

All validation, build and package work used the single fail-fast lifecycle owner with bounded stages
and progress heartbeats. One early sandboxed formatter attempt could not certify Windows process
inspection; its quarantine contained no PID, manual inspection found no task-owned process or lock,
and only that exact quarantine file was removed.

Twice, interrupting the interactive Web preview through its PTY ended the owner and its Vite/esbuild
children before the owner removed its lock. Each following audit failed closed. For the first run,
exact PIDs 8944, 21824 and 6456 were absent; for the second, exact PIDs 21812, 14484 and 21828 were
absent. Port 4173 had no listener, the recorded token was unchanged and no cleanup quarantine
existed before only the exact stale lock was removed. Every subsequent lifecycle audit passed with no
recorded process, lock or quarantine.
