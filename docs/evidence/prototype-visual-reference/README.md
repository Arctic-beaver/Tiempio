# Prototype visual reference captures

These 14 PNG files are the user-provided full-page visual witnesses for the exact Tiempio prototype
in both light and dark schemes. They are committed so future implementation and review work can
inspect the intended appearance without relying on temporary clipboard files or `file://` browser
access.

## Authority and scope

The single executable visual authority remains
[`docs/tiempio_ux_prototype.html`](../../tiempio_ux_prototype.html). Its recorded Git blob and
SHA-256 are defined in
[`PROTOTYPE-VISUAL-RESTORATION.md`](../../project-plan/PROTOTYPE-VISUAL-RESTORATION.md).

These PNGs are lossless, byte-for-byte copies of the files supplied by the user on 2026-08-10. They
are authoritative visual witnesses of that prototype rendering, not a replacement for the HTML/CSS
contract.

Each image includes the whole prototype documentation page. The production target is only the
rounded `.app-window` and its contents. The top prototype state switcher, outer page background,
theme toggle and right-hand explanatory journey panel are documentation harness and must not appear
in Tiempio. See the plan for the exact boundary.

The screenshots have a common width of 3120 pixels, but their heights vary slightly because they
were supplied as manual full-page captures. Their outer dimensions are therefore not a canonical
production viewport. Future pixel-diff work must derive equal-dimension `.app-window` crops without
overwriting or transforming these raw files.

## Capture matrix

| State            | Light reference                                            | Dark reference                                           |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 01 Home          | [`light/01-home.png`](light/01-home.png)                   | [`dark/01-home.png`](dark/01-home.png)                   |
| 02 First Layer   | [`light/02-first-layer.png`](light/02-first-layer.png)     | [`dark/02-first-layer.png`](dark/02-first-layer.png)     |
| 03 Sound Chooser | [`light/03-sound-chooser.png`](light/03-sound-chooser.png) | [`dark/03-sound-chooser.png`](dark/03-sound-chooser.png) |
| 04 Piano Roll    | [`light/04-piano-roll.png`](light/04-piano-roll.png)       | [`dark/04-piano-roll.png`](dark/04-piano-roll.png)       |
| 05 Drums         | [`light/05-drums.png`](light/05-drums.png)                 | [`dark/05-drums.png`](dark/05-drums.png)                 |
| 06 Arrangement   | [`light/06-arrangement.png`](light/06-arrangement.png)     | [`dark/06-arrangement.png`](dark/06-arrangement.png)     |
| 07 Sound Sculpt  | [`light/07-sound-sculpt.png`](light/07-sound-sculpt.png)   | [`dark/07-sound-sculpt.png`](dark/07-sound-sculpt.png)   |

## Integrity and use

[`manifest.json`](manifest.json) records the semantic state, scheme, dimensions, pixel format, byte
length and SHA-256 of every committed PNG.

[`component-map.md`](component-map.md) assigns every visible application region to a production
component and records which existing command or project authority it must preserve.

Future work must:

1. read the restoration plan and prototype HTML before interpreting a screenshot;
2. inspect both schemes for the state being implemented;
3. preserve these raw files and verify their hashes before deriving crops or diffs;
4. keep derived baselines and production diffs in a separate evidence directory;
5. treat any mismatch between a PNG and the recorded HTML revision as a blocking reference change,
   not as permission to choose whichever appearance is easier to implement.
