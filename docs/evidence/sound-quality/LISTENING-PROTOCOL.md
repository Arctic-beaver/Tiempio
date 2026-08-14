# Blind listening protocol

## Decision purpose

The study asks whether a technically safe candidate is desirable, expressive and truthful for its
role. It does not ask listeners to validate implementation details or formal standards compliance.

## Panels

Two panels are analyzed separately:

1. trained/critical listeners who can identify aliasing, clicks, resonance, image instability and
   fatigue;
2. target creators, including less-experienced musicians, who rate immediate playability,
   clarity, role fit and desire to use the sound.

Panel membership, device, approximate listening level, environment and training completion are
recorded. Observations are never invented or copied between panels.

## Pilot and power rule

- Run a pilot with at least 8 paired observations per panel on non-finalized candidates.
- Estimate the within-listener paired effect and bootstrap its uncertainty.
- Before unblinding final catalog labels, freeze a sample size providing at least 80% power for the
  smallest meaningful paired improvement of 0.6 points on the seven-point desire scale.
- The minimum final target is 16 valid listeners per panel. If the pilot implies more, use the
  larger frozen number. Missing observations are not treated as neutral scores.

## Presentation

- Candidate names, catalog positions and implementation labels are hidden.
- Order is randomized within and between listeners with a stable per-session seed.
- Current and candidate stimuli are K-weighted level-matched within 0.25 dB and checked against
  true peak after matching.
- Each sound is heard as an isolated note, role phrase, appropriate chord/polyphony stress and one
  compact protected-drum mix.
- Trained listeners receive artifact exemplars during familiarization, not during blind grading.
- Sessions are split before fatigue; one block is capped at 25 minutes.
- Headphones and ordinary laptop/consumer speakers are both represented, but a listener does not
  switch devices inside a paired block.

## Questions

Seven-point scales:

- I want to play this again.
- I would use this in a track.
- It fits the stated role.
- It responds expressively to velocity and duration.
- The named macros improve or intentionally transform it.
- It remains useful or pleasant after repeated listening.

Artifact flags: harsh/foldback whistle, painful resonance, click, weak pitch, mud, tiring or hollow
width, artificial/stuck tail, loudness jump and free text.

## Analysis

- Report medians, quartiles and paired effect distributions per panel and device class.
- Use a deterministic percentile bootstrap over listener-level paired differences with 10,000
  resamples and a two-sided 95% interval.
- Preserve listener pairing; do not pool individual stimuli as independent listeners.
- Report panel disagreement rather than averaging away trained-listener artifact findings.
- Apply the frozen floors from `QUALITY-PROFILE.md`.
- A corrected candidate enters a declared new round; results are not silently overwritten.

## Data integrity

The study package contains a manifest, anonymized response rows, session seed, stimulus hashes,
analysis revision and exclusion reasons. Raw personal identifiers are not stored in the repository.
Until valid response data exist, SQ-F remains externally blocked and the catalog is not described
as preference-accepted or frozen.

## Current study package

`SQ-F-AUDITION-MANIFEST.json` is the participant-facing inventory of blinded assets and trials.
It contains 27 blind candidate bundles, each with isolated-note, role-phrase, polyphony and
protected-drum-mix WAVs (108 files total), across 29 balanced trials.
`SQ-F-AUDITION-KEY.json` is restricted to the study coordinator and must not be loaded into the
participant presentation. Both files and all WAV hashes regenerate through
`npm run check:sq-e-catalog`. The committed package intentionally contains no response rows; its
status remains `awaiting-human-observations`.
