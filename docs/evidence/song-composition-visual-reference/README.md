# Song composition visual reference

These two PNG files are the user-approved full-page visual witnesses for the linked-bricks and song
composition model introduced on 2026-08-13. They preserve the light and dark renderings byte for
byte so implementation work does not depend on temporary clipboard files.

## Authority and scope

The executable authority is
[`docs/tiempio_ux_prototype.html`](../../tiempio_ux_prototype.html), state `06 Структура`. The product
behavior and data-ownership contract are recorded in
[`STAGE-10-LINKED-BRICKS-AND-SONG.md`](../../project-plan/STAGE-10-LINKED-BRICKS-AND-SONG.md).

The screenshots include the documentation harness. Production owns only the rounded `.app-window`
and its contents; the outer state tabs, page background, theme switch and explanatory panel remain
prototype-only documentation UI.

This pair supersedes the earlier state-06 arrangement composition in the original 2026-08-10
capture matrix. That matrix remains retained as historical evidence for the other prototype states
and for comparison with the previously accepted arrangement.

## Capture matrix

| State | Light reference | Dark reference |
| --- | --- | --- |
| 06 Linked bricks and song | [`light/06-linked-bricks-song.png`](light/06-linked-bricks-song.png) | [`dark/06-linked-bricks-song.png`](dark/06-linked-bricks-song.png) |

## Visible contract

- The upper editor owns one reusable musical brick: notes or drum events, sound character and an
  optional pause inside its cycle.
- Layer speaker buttons affect brick preview. Enabling a brick during preview starts that brick from
  its beginning.
- The collapsible lower dock owns the song and has its own Play action. Song playback follows clip
  positions on the timeline; it does not restart a brick merely because its preview was enabled.
- Timeline clips are linked instances of bricks. Source musical edits propagate to every linked
  instance, while placement, trimming, split points and arranged duration remain instance-local.
- Dragging the right edge extends an instance by gapless looping. A pause authored inside the brick
  repeats as part of every cycle; empty space between instances is a separate arrangement gap.
- The visible layer controls use speaker and edit actions instead of unexplained `S`/`M` letters.

[`manifest.json`](manifest.json) records the current prototype hash and the exact dimensions, byte
length and SHA-256 of both supplied images.
