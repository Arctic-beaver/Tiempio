# SQ-F acceptance status

Date: 2026-08-14

Branch: `feature/sound-quality-acceptance`

Status: **deferred post-merge — human observations are absent**.

The product owner approved Stage 8 engineering closure and squash merge on 14 August 2026 without
treating missing observations as a pass. This document remains the open preference-validation
record; the catalog is not preference-accepted or frozen.

## Ready evidence

- The current catalog passes the 648-probe SQ-E technical matrix.
- `SQ-F-AUDITION-MANIFEST.json` defines 27 blinded, level-matched candidate bundles, four context
  WAVs per candidate (108 files total), and 29 trials.
- `SQ-F-AUDITION-KEY.json` is the study-coordinator mapping; participant presentation must not
  expose it.
- WAV files regenerate into `artifacts/sq-f-audition` through the same lifecycle-owned production
  renderer and are verified by SHA-256 in `npm run check:sq-e-catalog`.
- The frozen panels, questions, pilot, power, exclusion and analysis rules remain in
  `LISTENING-PROTOCOL.md` and `QUALITY-PROFILE.md`.

## Missing gate

No trained-listener or target-creator response data were supplied or collected in this repository.
The minimum final target is 16 valid listeners per panel, or the larger sample required by the
pilot. Therefore preference confidence intervals, role-fit/desire floors, repeated critical
artifact decisions and catalog freeze cannot be computed or claimed.

The next valid action is to run the two panels with the committed package, preserve anonymized
paired observations and exclusion reasons, and analyze them as a declared SQ-F round. Objective
metrics and technical-neighbour distance must not be substituted for those observations.
