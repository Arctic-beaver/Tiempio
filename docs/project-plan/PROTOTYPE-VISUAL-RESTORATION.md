# Prototype-exact visual restoration

## Status and scope

**Status:** planning only. No production UI changes are part of this commit.

**Task integration branch:** `fix/restore-prototype-visuals`.

**Baseline:** `80e14b8`, the architecture-alignment revision fast-forwarded into `main` on
2026-08-10.

The user-visible outcome is a Tiempio interface whose visual result matches the approved prototype
instead of reinterpreting it. This is a restoration task, not a redesign, modernization pass or
opportunity to preserve current styling preferences.

## Exact visual authority

The single exact visual reference is
[`docs/tiempio_ux_prototype.html`](../tiempio_ux_prototype.html), located at
`D:\Work\TiempioProject\Tiempio\docs\tiempio_ux_prototype.html`.

The reference revision recorded for this plan is:

- Git blob: `7ba45dddcd74090f7a8bbc602cf8c9de74d65143`;
- SHA-256: `C1A69E43635C7A41791A9179F5D1B0A176FEBDEB9E1F76A2BC2B109047F4990A`.

The prototype is authoritative for visible hierarchy, placement, relative and canonical geometry,
typography, colors, spacing, density, radii, borders, shadows, icons, copy, visual states, light and
dark schemes and the motion shown by the prototype. “Inspired by”, “close to”, a theme using
similar colors or a structurally different shell is not acceptance.

The production target is the prototype's `.app-window` and everything inside it:

- `.window-titlebar`;
- `.app-body`, `.nav-rail` and `.workspace`;
- all seven `.screen` states;
- state-local top bars, transports, panels, grids, editors, inspectors, footers and popovers;
- default, hover, active, selected, playing, disabled and open states represented by the reference;
- both the default light scheme and `.app-window.dark` scheme.

The following prototype harness is documentation UI and must not appear in Tiempio:

- the page background and `body` padding;
- `.prototype-shell`, `.prototype-bar` and `.prototype-title`;
- `.state-tabs` and the prototype-only theme button in `.proto-actions`;
- `.presentation` as an outer documentation layout;
- `.ux-note`, its journey map and explanatory copy.

The `.app-window` outer radius, border and shadow are part of the Web/reference presentation. A
platform-owned native window shadow or macOS traffic-light area may differ only where the operating
system owns it; the Desktop application-owned interior and Windows custom chrome remain exact.

Yinkie is read-only and is not a competing visual reference. It may inform implementation mechanics
such as semantic tokens, focus lifecycle, target separation and shared controls, but it may not
override any visible decision in the Tiempio prototype. Current Tiempio styling is also not an
authority when it conflicts with the prototype.

Any change to the reference file or any proposed visible deviation requires a separate explicit
user decision. A changed reference must receive a new recorded blob/hash and regenerated baselines;
the implementation may not silently drift with it.

## Authority boundary outside appearance

The prototype owns appearance and screen composition. Existing architecture remains authoritative
for data ownership, command availability, runtime capability truth, security, persistence, audio,
Desktop/Web isolation and accessibility semantics.

This produces four narrow rules:

1. The implementation must reproduce the prototype visually without copying its demo-only state
   management into production architecture.
2. The application must not claim playback, Shared Audio, persistence or another capability that
   the runtime has not provided. An unavailable capability keeps the prototype's geometry and visual
   language but uses truthful copy and a disabled/non-color state signal.
3. Accessibility-required focus, names, keyboard behavior, reduced motion and non-color signals may
   add semantics, but may not create an unexplained visual redesign.
4. Platform-native chrome is the only target-specific visible exception. Shared application
   surfaces remain identical between Desktop and Web for the same state, locale, scheme and size.

If exact appearance and a product invariant appear to conflict, implementation stops at that point,
records the conflict and asks for a decision. It does not choose an aesthetic or behavioral
compromise silently.

## Current mismatch premise

The current implementation cannot be accepted through token tuning alone. Its shared shell places
the transport, layer list and context panel around every view, including Home, while the prototype
uses state-specific compositions inside one stable title bar and navigation rail. Current light and
dark palettes, chrome identity, panel dimensions, content density and several view compositions also
differ from the reference.

Therefore the work must first restore composition ownership, then exact styling. Preserving the
current shell geometry and merely changing colors would fail this plan.

## Required screen mapping

| Prototype state | Production feature | Non-negotiable visible composition |
| --- | --- | --- |
| `home` — 01 Старт | Home | Editorial start surface and recent-project panel inside title bar + rail only; no global transport, layer list or context inspector around Home. |
| `empty` — 02 Первый слой | First Layer | Screen-local project top bar, zero-layer list, eight-bar canvas, central intent list and footer guidance. |
| `sound` — 03 Выбор звука | Sound Chooser | Instrument categories left, sound/audition/preset stage center, semantic fine-tuning panel right and prototype keyboard preview. |
| `piano` — 04 Мелодия | Piano Roll | Layer list, piano keys and roll, harmony guidance panel, phrase/cycle footer and state-specific top-bar actions. |
| `drums` — 05 Ритм | Drums | Layer list, drum voices, step grid and pattern/density panel with the reference hierarchy and density. |
| `arrange` — 06 Структура | Arrangement | Track headers left, arrangement ruler and clips center, intent-based inspector right and matching selected/muted states. |
| `sculpt` — 07 Характер звука | Sound Sculpt | Large sound-orbit surface and semantic axes, neighboring-character panel, preview transport and Done action. |

The mapping covers the visible mock content as deterministic acceptance data. Production content may
vary at runtime, but a checked acceptance fixture must reproduce the exact reference labels, values,
counts, selections and musical events so visual comparison remains deterministic.

## Delivery method

This is a large task. `fix/restore-prototype-visuals` is the integration branch. Each stage is
implemented on a separate branch created from the updated integration branch in the primary
worktree, verified, committed atomically and merged back before the next stage begins. Stage branches
are deleted only after their commits are reachable from the integration branch.

No stage may modify Yinkie or create repository-hosted automation. Resource-intensive checks,
builds and visual capture run sequentially through the existing fail-fast lifecycle owner with its
lock, timeouts, heartbeats, signal handling and exact process-tree cleanup.

## Stage A — Reference baselines and visual contract

**Planned branch:** `fix/prototype-visual-baselines`.

- Capture the prototype's `.app-window` for all seven states in light and dark through an approved
  browser surface or user-provided lossless exports.
- Record the exact `.app-window` bounds produced by canonical standard, compact and ultrawide
  reference viewports; production comparisons use an equal viewport to the captured app-window
  crop rather than the outer documentation page.
- Export a deterministic manifest of reference colors, typography, line heights, spacing, radii,
  borders, shadows, control dimensions, grid columns and important landmark rectangles.
- Add a mapping from every visible prototype element to its production component and command.
- Capture the current production result with the same fixtures and publish labelled visual diffs.
- Freeze motion, caret blinking, timestamps and other nondeterministic presentation during capture.
- Add a local application-owned comparison entry point; do not add or modify GitHub Actions.

**Stage exit:** all 14 standard reference images exist, every visible element has an owner, current
deltas are explicit and the comparison can fail on missing elements, geometry or computed styles.

## Stage B — Shared frame, tokens and controls

**Planned branch:** `fix/prototype-shared-frame`.

- Align semantic light/dark tokens exactly to the prototype values and relationships.
- Restore the title bar identity, Tiempio mark, Foundation treatment, window controls, 64-pixel
  canonical navigation rail, icons, tooltip treatment and selected navigation state.
- Replace the always-on global work-area composition with a stable frame that permits each state to
  own the composition shown by the prototype.
- Implement the shared screen-local top bar, transport capsule, audio chip/popover, buttons, rows,
  sliders, panel surfaces and scrollbars once in the application design system.
- Express canonical prototype geometry through named semantic tokens and relative/container-aware
  rules. Do not spread unexplained fixed pixel literals across feature styles.
- Preserve command availability, runtime truth, focus restoration and Desktop/Web boundaries.

**Stage exit:** the empty shared frame and reusable controls match the reference in both schemes;
Home is no longer surrounded by editor-only global panels; equivalent controls share one themed,
keyboard-capable implementation.

## Stage C — Start, first layer and sound choice

**Planned branch:** `fix/prototype-onboarding-surfaces`.

- Reproduce `home`, `empty` and `sound` structure, content hierarchy and whitespace exactly.
- Restore the Home editorial composition, circular line motif, three start actions, recent list and
  reference-audio note.
- Restore the first-layer eight-bar canvas, role intent list and footer guidance.
- Restore sound categories, title/copy/action, waveform, preset rows, keyboard preview and semantic
  tuning panel.
- Use deterministic project fixtures and real command wiring; demo-only prototype navigation is not
  copied into production.

**Stage exit:** six standard baselines (three states × two schemes) pass the exact visual criteria
and their visible actions retain truthful availability and keyboard behavior.

## Stage D — Piano roll and drums

**Planned branch:** `fix/prototype-musical-editors`.

- Reproduce the Piano Roll layer list, keys, ruler, notes, playhead, harmony panel, cycle strip and
  editing footer.
- Reproduce the Drums layer list, voice column, step grid, pattern choices and density control.
- Preserve scale membership, selected-note, selected-step, mute, solo and ghost suggestions with
  the prototype's appearance plus redundant non-color semantics.
- Keep dense repeated grids out of an unusable keyboard sequence while retaining named command
  alternatives and accessible summaries.

**Stage exit:** four standard baselines pass; editor geometry remains usable at constrained height;
musical selection and disabled states are not color-only.

## Stage E — Arrangement and sound sculpt

**Planned branch:** `fix/prototype-arrangement-sculpt`.

- Reproduce track headers, arrangement ruler, section labels, clips, rests, playhead and selected
  fragment inspector.
- Reproduce Sound Sculpt's title, large orbit/wave surface, three semantic axes, adjacent character
  list, preview control and completion action.
- Preserve current project authority and command boundaries while matching the prototype's
  state-local panels instead of reusing visually incompatible generic cards.

**Stage exit:** four standard baselines pass; selection, mute, rests, active character and semantic
axis values remain clear in light and dark schemes without relying on color alone.

## Stage F — Responsive, cross-target and final acceptance

**Planned branch:** `fix/prototype-visual-acceptance`.

- Audit every visible dropdown and scrollable surface application-wide and enforce the shared
  design-system treatment for trigger, panel, option, selected, hover, focus, disabled, track,
  thumb, hover, active and corner states.
- Match the prototype's responsive intent at its wide layout, 1350-pixel documentation transition
  and 900-pixel compact transition, translated to the actual `.app-window`/container width.
- Verify constrained height without losing access to layers, context or the active musical tool.
- Verify Russian reference copy first, then EN/RU/ES overflow behavior without changing musical
  identifiers or the Russian baseline.
- Verify Desktop Windows custom chrome, native macOS title integration and Web target separation.
- Run final computed-style, landmark-geometry, screenshot, accessibility, policy, test, typecheck,
  build and bundle checks sequentially.
- Record any user-approved platform deviation next to its exact mask and rationale. Unapproved
  masks or broad screenshot exclusions are forbidden.

**Stage exit:** every matrix cell below passes and the combined diff contains no unrelated feature,
engine, persistence or project-format work.

## Exact visual acceptance criteria

### Element and content parity

- Every element visible inside the reference `.app-window` for the selected state exists in the
  production acceptance fixture.
- No visible production element absent from the reference is accepted merely because it existed in
  the previous Tiempio shell.
- Text, numbers, counts, selected items, musical events, icons and visible order match the reference
  fixture exactly, except for a documented runtime-truth or platform-chrome exception.
- The prototype harness never appears in production.

### Geometry parity

- At the canonical standard comparison size, each recorded landmark edge, width and height differs
  from the reference by at most one CSS pixel, solely for browser subpixel rounding.
- Grid columns, panel visibility, alignment, overflow, clipping and z-order match the reference.
- Text wraps to the same lines after fonts and viewport are fixed; wrapping differences are not
  dismissed as responsive behavior at a canonical size.
- Compact and ultrawide layouts follow the reference hierarchy and its explicit hide/reflow rules;
  no required control becomes unreachable.

### Style parity

- Reference colors, opacity, font family, font size, weight, line height, letter spacing, borders,
  radii, shadows and control dimensions match their recorded computed values.
- Light and dark are independently accepted. Passing one scheme does not imply the other.
- Default, hover, focus-visible, active, selected, disabled, open popover and reduced-motion states
  have explicit evidence.
- There is one application-owned dropdown treatment and one application-owned scrollbar treatment
  across the full application.

### Screenshot parity

- Each standard image is a crop of the reference `.app-window` compared with a production viewport
  of the same CSS dimensions and device-pixel ratio.
- Deterministic geometry and computed-style checks must pass before screenshot comparison; a pixel
  percentage cannot excuse a structural mismatch.
- Automated mismatch must be no greater than 0.25% after masking only platform-owned native chrome.
- Every remaining changed pixel must be attributable to font/edge rasterization. Any coherent,
  user-visible diff region fails even when the global percentage is below the threshold.
- Diff images are retained beside the acceptance record. Blanket masks, blurred comparisons and
  masks covering application-owned UI are forbidden.

### Behavioral and architectural preservation

- The seven states remain reachable through the production command/navigation model.
- `ProjectSession` remains the single project authority and the engine remains a projection/runtime;
  visual work does not add parallel mutable feature state for project content.
- Desktop and Web continue to mount the same shared application without target branches inside
  feature components.
- Unavailable commands remain disabled through visible controls, shortcuts and native requests.
- No visual test fixture can leak into normal persisted user projects or report fake audio/save
  success.
- Existing target-boundary, CSP, bundle, chunk-topology, project-format and engine golden evidence
  remains green.

## Acceptance matrix

The final standard gate contains at least 14 exact reference comparisons:

| State | Light | Dark |
| --- | --- | --- |
| Home | required | required |
| First Layer | required | required |
| Sound Chooser | required | required |
| Piano Roll | required | required |
| Drums | required | required |
| Arrangement | required | required |
| Sound Sculpt | required | required |

Additional required scenarios cover compact, ultrawide and constrained-height layouts for each
distinct composition family; the audio popover open state; hover/focus/disabled shared controls;
Russian overflow; and representative EN/ES overflow. These scenarios supplement the 14 standard
images and cannot replace them.

## Risks and edge cases

- The prototype uses many fixed pixel values for a documentation viewport. Copying them directly
  would make the production shell brittle; converting them to semantic relative/container-aware
  geometry must still reproduce the canonical result exactly.
- The prototype shows successful Shared Audio. Until the runtime provides it, matching appearance
  must not become a false availability claim.
- Current deterministic seed content differs from prototype mock content. Acceptance fixtures must
  match the reference without replacing user data or weakening project invariants.
- Russian is the reference locale and can be wider than current English-first controls. EN/ES and
  system font fallback must not corrupt the Russian geometry baseline.
- OS font rasterization, scaling and native chrome can create false screenshot noise. Capture records
  must pin browser/runtime version, device-pixel ratio, font availability and platform masks.
- State-specific layout restoration can accidentally duplicate controls or break command placement.
  One command registry and shared primitives remain mandatory.
- Editor grids can become visually exact but keyboard-hostile. Accessible summaries, named commands
  and focus order must stay usable without adding visual clutter.
- Compact widths and constrained heights can hide the right context or layer controls. The prototype
  hide/reflow behavior must be combined with labelled drawer access where required by accessibility.
- CSS changes in shared primitives can improve one screen while regressing another. Every shared
  change reruns the full seven-state light/dark matrix.
- Large feature styles can erase the bundle headroom restored by architecture alignment. Existing
  size ceilings are not raised to accommodate avoidable visual duplication.
- A prototype edit during implementation can invalidate all evidence. Hash drift stops acceptance
  until the user confirms the new reference and baselines are regenerated.

## Verification strategy

Each implementation stage runs focused unit and policy checks plus its affected visual matrix before
an atomic commit. After each commit, the exact lifecycle journal, lock, quarantine and recorded
process identities are audited before another check, commit, branch or merge.

The combined integration branch runs, sequentially:

1. reference hash and visual-contract validation;
2. formatting, lint, localization and UI-foundation policies;
3. command, projection, layout and design-system tests;
4. Node and Web typechecks;
5. target-boundary, CSP, package-content, bundle and chunk-topology checks;
6. Desktop and Web production builds;
7. all standard, compact, ultrawide, constrained-height and interaction visual scenarios;
8. keyboard, focus restoration, reduced motion, non-color signal and overflow inspection;
9. the repository's complete bounded validation workflow;
10. final lifecycle audit and final-diff review against this plan.

## Definition of done

- The linked prototype remains the recorded and unchanged exact visual authority.
- All seven production states match the prototype in both light and dark at the canonical standard
  size under the element, geometry, computed-style and screenshot criteria above.
- Responsive and constrained layouts preserve the prototype hierarchy and keep required controls
  reachable.
- No previous shell element survives solely because it was already implemented.
- No prototype harness UI appears in Tiempio.
- Every visible deviation is either platform-owned or explicitly approved by the user and recorded;
  there are no silent aesthetic deviations.
- Runtime truth, project authority, command availability, accessibility, target separation and
  existing quality/bundle gates remain intact.
- Yinkie is unchanged.
- The integration branch contains focused atomic stage commits, no unrelated changes, no running
  task-owned process, no lifecycle lock and no cleanup quarantine, and is ready for explicit review
  rather than automatically merged or pushed.
