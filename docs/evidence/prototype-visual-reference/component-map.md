# Prototype-to-production visual ownership

This map fixes the ownership boundary for every visible region inside the prototype's
`.app-window`. It prevents a future implementation from restoring the old always-on shell or from
copying the documentation harness into production.

## Shared frame

| Prototype region                           | Production owner                                   | Existing authority retained                                  |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| `.app-window`                              | `StudioShell`                                      | Desktop/Web mount boundary and active color scheme           |
| `.window-titlebar`                         | `TitleBar`                                         | Native minimize, maximize and close APIs                     |
| `.brand-lockup`, `.brand-mark`, `.edition` | `TitleBar`                                         | Localized product name; Foundation is visual edition copy    |
| `.app-body`                                | `StudioShell`                                      | Stable rail/workspace split                                  |
| `.nav-rail` and `.rail-button`             | `ActivityRail`                                     | Command registry navigation and truthful availability        |
| `.workspace`, `.screen`                    | `ActiveStudioView`                                 | Lazy feature boundaries and production navigation state      |
| `.topbar`, `.transport`                    | shared screen-frame primitives                     | Transport commands and `ProjectSession` transport projection |
| `.audio-chip`, `.audio-popover`            | shared audio-status primitive                      | Runtime audio availability; no simulated success             |
| `.project-space`, `.layer-list`, `.layer`  | screen-local project layout and `LayersPanel` rows | Selected layer and project projections                       |

The outer prototype page, its state tabs, theme button, presentation grid, UX note and journey map
have no production owner and must never be mounted by Tiempio.

## Screen compositions

| State         | Prototype regions                                                                                                                                                                  | Production owners and command boundary                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home          | `.home-main`, `.start-actions`, `.recent-panel`, `.inspiration-note`                                                                                                               | `HomeView`; create uses `useHomeActions`, unavailable open/recent actions remain disabled                                                                                                         |
| First Layer   | `.phrase-head`, `.first-layer`, `.intent-list`, `.footer-guidance`                                                                                                                 | `FirstLayerView`; role buttons use `useFirstLayerActions`                                                                                                                                         |
| Sound Chooser | `.chooser-categories`, `.sound-stage`, `.audition`, `.preset-lines`, `.keys-preview`, `.semantic-panel`                                                                            | `SoundChooserView`; back/choose use `useSoundChooserActions`; audition remains truthful to runtime availability                                                                                   |
| Piano Roll    | `.piano`, `.piano-keys`, `.note-grid`, `.harmony-panel`, `.editor-footer`                                                                                                          | `PianoRollView`; note mutations stay in `usePianoRollActions` and `ProjectSession`; `.harmony-panel` becomes the optional musical-context inspector and cannot be the sole host for note commands |
| Drums         | `.drum-editor`, `.drum-voices`, `.step-grid`, `.pattern-panel`                                                                                                                     | `DrumsView`; step mutations stay in `useDrumsActions` and `ProjectSession`                                                                                                                        |
| Arrangement   | Historical: `.arrange`, `.track-heads`, `.arrange-grid`, `.arrange-context`. Current state 06: `.song-composer`, `.source-editor`, `.song-dock`, `.linked-clip`, `.clip-inspector` | `ArrangementView` plus the selected brick editor; brick mutations and instance mutations remain separate authorities in `ProjectSession`                                                          |
| Sound Sculpt  | `.sculpt-main`, `.sound-orbit`, `.axis-controls`, `.sculpt-presets`                                                                                                                | `SoundSculptView`; macro commits stay in `useSoundSculptActions` and `ProjectSession`                                                                                                             |

## Visual-only controls

Prototype controls without an implemented production command may be rendered only as disabled or
non-interactive presentation. This currently includes project opening, advanced synthesis, octave
operations, arrangement intent shortcuts and completion flows not present in the command registry.
They keep the reference geometry and labels but must not mutate local demo state or claim success.

Dense piano/drum/arrangement marks remain visual descendants of their feature owner. The feature's
existing named controls and summaries retain keyboard and assistive-technology access; the repeated
decorative grid itself must not become an unnecessarily long tab sequence.
