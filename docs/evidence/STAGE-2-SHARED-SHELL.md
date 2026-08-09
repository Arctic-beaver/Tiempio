# Stage 2 shared shell acceptance evidence

Date: 2026-08-09

Task branch: `feature/skeleton-design-shell`

Acceptance branch: `feature/skeleton-shell-acceptance`

## Automated acceptance

- `npm run check:visual-a11y` passed the shared UI-foundation policy, Web
  typecheck, production Web build and CSP policy. The policy certifies the
  shared themes, controls, scrollbars, command mechanisms, EN/RU/ES catalogs
  and seven presentation states.
- `npm run build` passed Node and Web typechecks, the Desktop production build,
  Desktop CSP, package-content policy and bundle budgets. Recorded sizes were
  3,090/65,536 bytes for main, 927/32,768 bytes for preload and
  331,136/393,216 bytes for the renderer.
- `npm run build:web` passed the Web typecheck, production build, CSP and bundle
  budget. The recorded Web output was 331,140/393,216 bytes.
- Localization tests verify exact key and interpolation-token parity across
  English, Russian and Spanish and exercise live i18next language changes.
- Focused tests cover command placement and shortcuts, responsive layout
  classification, Windows/Linux/macOS window-chrome policy and the Desktop
  runtime adapter.

Every lifecycle-owned command was followed by `npm run lifecycle:audit`. Final
audits reported no recorded process, lock or quarantine. An initial manual
Ctrl+C preview stop left only a stale lock; its owner and every recorded child
PID were absent and port 4173 had no listener before the exact lock file was
removed. Later previews were stopped through their verified task-owned child
PID so the lifecycle owner released its own lock.

## Real-browser matrix

The production Web output was inspected through the in-app browser rather than
the prototype HTML.

| Scenario       | Coverage                                                                                         | Result                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1440x900, dark | EN, RU and ES; Home, First Layer, Sound Chooser, Piano Roll, Drums, Arrangement and Sound Sculpt | All states reachable through shared commands; no document or body overflow             |
| 1024x768, dark | ES settings, custom selects and arrangement                                                      | Localized labels and option descriptions; no shell overflow                            |
| 390x844, light | ES compact title/transport, arrangement and settings                                             | Navigation and details remain available as labelled drawers; popover fits the viewport |
| 390x844, dark  | RU Sound Chooser and navigation drawer                                                           | Long labels remain readable; no document or body overflow                              |
| 1024x500, dark | ES constrained-height Sound Chooser                                                              | Layers remain visible and the workspace scrolls without page-level overflow            |

The arrangement and editor surfaces may scroll internally on compact widths;
this is intentional and does not widen the document.

## Localization and accessibility observations

- Switching the shared i18next instance updates visible copy immediately and
  synchronizes the document language to `en`, `ru` or `es`.
- Application-owned labels, layer labels, arrangement accessible names and
  sound-character descriptions are localized. Project titles, preset names and
  musical pitch names remain authored content.
- The shared listbox exposes trigger, listbox, option, selected and expanded
  semantics and dismisses with Escape.
- Compact drawers move focus to their close button, trap keyboard focus,
  dismiss with Escape and restore focus to the invoking control.
- Light and dark themes preserve the same custom select, scrollbar and focus
  treatment. Reduced-motion behavior is enforced by the shared foundation
  policy.
- Browser console inspection reported no warnings or errors in the acceptance
  scenarios.

## Acceptance conclusion

The shared production shell meets the Stage 2 definition of done for the
implemented skeleton scope. Audio playback, durable project/settings
persistence and engine-backed editing remain explicitly outside this stage.
