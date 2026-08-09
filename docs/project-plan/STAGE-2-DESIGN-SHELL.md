# Step 3 — Tiempio design system and shared application shell

## Status and scope

This document is the implementation plan for Stage 2 of
`APPLICATION_SKELETON.md`, called step 3 in the execution sequence because the
lifecycle foundation and repository-contract stages are already complete.

The task integration branch is `feature/skeleton-design-shell`. The outcome is
one production React shell shared by Desktop and Web, with the seven prototype
states represented by typed presentation models rather than copied prototype
HTML.

This stage does not implement project persistence, `ProjectSession`, audio
playback, DSP, MIDI, or saved settings. Runtime capabilities that are not yet
connected remain explicitly unavailable; the shell must not simulate durable
or audible success.

## Source of truth

The implementation follows:

- `docs/architecture/TIEMPIO_ARCHITECTURE.md`;
- `docs/tiempio_ux_path.md`;
- `docs/tiempio_ux_prototype.html`;
- `docs/electronic_music_studio_concept(1).md`;
- Stage 2 in `docs/project-plan/APPLICATION_SKELETON.md`.

Yinkie remains read-only reference material. Tiempio reuses its proven
semantic-token, typed localization, command-registry, focus-lifecycle,
responsive-shell and dual-target patterns without copying its Markdown domain,
theme families, settings model, or application CSS.

## Architecture boundaries

- `packages/design-system` owns semantic tokens and reusable controls:
  icon/text buttons, tooltip, popover, select, semantic slider, scroll surface,
  focus treatment and motion policy.
- `packages/localization` owns typed EN/RU/ES base catalogs, locale resolution,
  interpolation and parity checks. Project names, musical note names, preset
  names and other musical content are never translated.
- `packages/application` owns providers, the command registry, responsive shell
  state, typed presentation models and the seven feature surfaces.
- Desktop and Web remain composition roots. Feature components do not branch on
  target names and never import platform modules.
- `ApplicationRuntime` remains the only platform boundary. Unavailable runtime
  capabilities produce disabled or explanatory presentation, not throwing
  placeholders or invented success.
- Desktop window chrome is adapted at the target boundary. Windows/Linux use
  application controls, macOS reserves integrated traffic-light space, and Web
  renders no native control contract.

## Delivery stages

### Stage A — Design-system and presentation foundations

**Branch:** `feature/skeleton-design-system` from the task integration branch.

- Add the Tiempio semantic light/dark token registry and System resolution.
- Add the global application-owned scrollbar treatment.
- Add reusable buttons, tooltip, popover, select, slider and scroll-surface
  primitives with keyboard and assistive-technology semantics.
- Add application runtime, presentation-settings and localization providers.
- Add complete typed EN/RU/ES catalogs and parity tests.
- Add the typed command registry, shortcut matching and placement coverage.

### Stage B — Shared shell and seven states

**Branch:** `feature/skeleton-shared-shell` from the updated task branch.

- Build the stable title area, activity rail, project top bar, layer list,
  central workspace, contextual panel and compact drawer.
- Add typed view models and feature components for Home, First Layer, Sound
  Chooser, Piano Roll, Drums, Arrangement and Sound Sculpt.
- Make every state reachable through the command/navigation model without
  treating the states as independent application routes.
- Preserve the prototype's musical hierarchy while replacing fixed demo
  geometry with semantic relative layout tokens and container-aware fallbacks.
- Keep mute, solo, selected layer, scale membership, diagnostics and disabled
  capabilities understandable without color alone.

### Stage C — Target chrome, policies and acceptance

**Branch:** `feature/skeleton-shell-acceptance` from the updated task branch.

- Connect Desktop window chrome through the versioned preload/runtime boundary
  and retain Web's independent composition root.
- Add static theme/localization/control/geometry policies and focused unit tests.
- Add lifecycle-owned local preview and UI acceptance workflows.
- Validate both production builds, package separation and bundle budgets.
- Inspect the real Web production shell in light and dark schemes at compact,
  standard and ultrawide viewports plus constrained height.

## Expected behavior

- Both targets mount the same `ApplicationRoot` and the same feature components.
- Initial locale resolves from the system with deterministic English fallback;
  EN/RU/ES changes are live and never change musical content identifiers.
- System theme follows the operating-system preference while Light and Dark
  remain explicit stable choices.
- The seven states are reachable by visible controls and keyboard-capable
  commands. Browser-reserved shortcuts always have visible alternatives.
- The right contextual surface becomes a labelled compact drawer instead of
  disappearing. Layers remain reachable in constrained layouts.
- Popovers dismiss on Escape and outside pointer input and restore focus to the
  invoker without stealing a newer focus target.
- All dropdown and scroll states share one design-system implementation.
- Reduced-motion users receive no essential animated transition.

## Risks and edge cases

- Compact width or constrained height can hide musical context or make the
  project unusable. Layout acceptance must check access, not only absence of
  horizontal overflow.
- Russian labels can overflow controls that appear correct in English.
- Native title controls can be duplicated on macOS or exposed in Web if target
  presentation leaks into shared feature code.
- A styled select trigger can still open an unthemed native panel. The shared
  select owns supported picker states and documents its semantic fallback.
- Popover dismissal can lose focus, re-open from the same click, or steal focus
  from a newer interaction.
- Mute, solo, selected notes and scale hints can become color-only signals.
- Timeline and drum-grid density can produce unusable focus order. Repeated
  visual events are summaries in this stage; interactive commands retain named
  keyboard alternatives.
- Unsupported settings, persistence or audio operations must remain visibly
  unavailable and may not report success.
- Responsive CSS must not inherit the prototype's fixed desktop geometry.
  Fixed pixels are limited to documented hairlines and native/test boundaries.
- Shell growth must remain inside the Stage 1 Desktop/Web bundle ceilings.

## Verification strategy

Each stage runs focused tests and `check:quick` before its atomic commit, then a
lifecycle audit before merge into the task integration branch.

The combined task branch must pass:

- localization parity and interpolation tests;
- command placement, shortcut and presentation tests;
- popover lifecycle and responsive-layout model tests;
- theme-token, shared-control, relative-geometry and target-boundary policies;
- Node and Web type checks;
- Rust workspace check to prove no cross-stage regression;
- Desktop and Web production builds;
- production CSP, package-content and bundle-budget policies;
- browser inspection for all seven states, EN/RU/ES, Light/Dark, compact,
  standard, ultrawide and constrained-height scenarios;
- keyboard focus, popover dismissal/restoration, drawer access, select/slider
  semantics, reduced motion and shell-overflow assertions;
- final staged `precommit` and post-commit lifecycle audit.

## Definition of done

- One shared shell renders independently in Desktop and Web.
- All seven prototype states are reachable through typed presentation state.
- No feature component contains a Desktop/Web branch or imports a platform
  transport.
- Semantic tokens cover both schemes and every shared control state.
- Equivalent dropdowns and scrollable surfaces use the shared implementation.
- EN, RU and ES catalogs have exact key and parameter parity.
- Compact and constrained-height layouts retain labelled access to layers and
  current context with no shell-level horizontal overflow.
- Keyboard focus, focus restoration, reduced motion and non-color state cues are
  covered by deterministic checks and real-browser inspection.
- Both production targets, policies, tests and bundle budgets pass.
- The task branch is clean and ready for an explicit merge request; it is not
  merged into `main` by this implementation task.
