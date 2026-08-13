# Prototype visual reference captures

> Historical baseline note: on 2026-08-13 the user approved a new linked-bricks and song model for
> state 06 and updated the active HTML prototype. The new authoritative state-06 pair is retained in
> [`song-composition-visual-reference`](../song-composition-visual-reference/README.md). The 14 files
> below remain byte-for-byte evidence of the 2026-08-10 baseline; the earlier arrangement image is
> no longer the active product target.

These 14 PNG files are the user-provided full-page visual witnesses for the exact Tiempio prototype
in both light and dark schemes. They are committed so future implementation and review work can
inspect the intended appearance without relying on temporary clipboard files or `file://` browser
access.

## Authority and scope

The capture set's recorded Git blob and SHA-256 remain defined in
[`PROTOTYPE-VISUAL-RESTORATION.md`](../../project-plan/PROTOTYPE-VISUAL-RESTORATION.md). The active
executable prototype has since evolved through an explicit user decision; see the current state-06
catalog linked above.

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

## Restoration status

As of 2026-08-10, all seven production states had been restored against this matrix on the
`fix/restore-prototype-visuals` integration branch. Both schemes were reviewed in the in-app browser;
the prototype's 900-pixel compact transition and a narrower reachable-control fallback were also
checked. All 14 files in this directory remain unchanged as historical evidence. State 06 now has a
new approved target, while implementation migration remains separate work.

Visual-only controls whose product behavior belongs to a later phase are deliberately disabled.
They establish the prototype appearance without expanding this restoration task into audio,
persistence or advanced editing work. Runtime-backed controls continue to show the actual project
and engine availability rather than the prototype's demo success states.
