# Stage 8 — perceptual sound quality and curated catalog

## Status and authority

**Status:** approved product direction; implementation has not started.

**Placement:** after Stage 6 and the context-preserving Add / focus-safe Sound Chooser bug gates,
but before the V4 source-material migration, performance recording and Stage 7.

**Integration branch:** `feature/perceptual-sound-quality`.

This document is authoritative for the first production-quality built-in synth catalog, the
bounded DSP work required to make it possible, the mathematical sound-lab workflow and the
subjective acceptance needed to answer the product question: **does every visible sound make the
user want to play and use it?**

The approved UI surfaces remain the
[light Sound Chooser](../evidence/prototype-visual-reference/light/03-sound-chooser.png),
[dark Sound Chooser](../evidence/prototype-visual-reference/dark/03-sound-chooser.png),
[light Sound Sculpt](../evidence/prototype-visual-reference/light/07-sound-sculpt.png) and
[dark Sound Sculpt](../evidence/prototype-visual-reference/dark/07-sound-sculpt.png). This stage
improves the sound and the truthfulness of its controls; it does not replace that interaction model
with a conventional synthesizer panel.

## Product standard

Sound quality is not end-of-project polish. In Tiempio, the first pressed key is the first proof
that the application understands the user's musical intention. A technically valid, finite and
audible signal is insufficient if it is harsh, tiring, weak, muddy, generic or difficult to place
in a small song.

The first catalog therefore follows these rules:

- every visible preset has a distinct musical job and a reviewed sweet spot;
- there are no filler sounds kept only to preserve a catalog count;
- an intentionally aggressive `Razor`, `Dirty` or `Wire` character may be bright or rough, but it
  may not contain accidental digital aliasing, uncontrolled peaks, painful resonances or a level
  trick that makes it seem better only because it is louder;
- every default reacts musically to pitch, velocity, note length and polyphony inside its stated
  role range;
- every point reachable through the beginner-facing macros is safe and useful, not merely within
  a numeric schema bound;
- macro movement is predictable: `Bright`, `Hard`, `Dirty`, `Long` and `Wide` change the heard
  quality named by the UI without arbitrary jumps or destructive loudness changes;
- switching presets during audition does not produce a dangerous or persuasive loudness jump;
- a sound must work both alone and beside the current procedural drums. A spectacular solo sound
  that masks the whole beginner mix is not finished;
- the existing drums are a positive control because their current character is user-approved.
  They receive regression, level and mix checks; their algorithms are changed only when evidence
  identifies a concrete defect.

“Beautiful” remains a human judgement. Objective metrics eliminate defects, keep comparisons fair
and make macro behaviour reproducible; they cannot select the winning timbre without listening.
The release gate is deliberately hybrid: deterministic analysis **and** blind human preference.

## Current baseline and why parameter tuning alone is not enough

The current catalog contains 27 synth presets in five families (`Bass`, `Lead`, `Pad`, `Pluck`,
`Texture`) and 15 drum-voice variants. Every synth preset resolves to the same V2 subtractive
topology:

```text
one waveform stereo pair + sine sub + noise
  -> state-variable low-pass
  -> amplitude envelope and tanh drive
  -> stereo width and output gain
```

The engine already has useful foundations: a PolyBLEP saw, bounded ADSR, smoothed live parameters,
a stable low-pass filter, deterministic noise, saturation, fixed voice pools, offline rendering and
native/Web use of the same Rust DSP.

The baseline audit must nevertheless treat these current limitations as likely sources of the
reported unpleasantness rather than attempting to hide them with preset output gain:

- Square/Pulse and Triangle are currently derived directly from phase and are not band-limited;
- nonlinear saturation can generate out-of-band harmonics without an antialias strategy;
- all families share one narrow oscillator/filter/envelope topology, so names can promise more
  distinction than the engine produces;
- velocity currently scales amplitude linearly but does not shape attack or brightness;
- cutoff has no explicit pitch/key tracking and per-register perceptual balance is not a catalog
  contract;
- one global macro formula drives every family, making musical corners and directionality hard to
  guarantee per preset;
- output gains are hand-authored values rather than the result of a repeatable loudness/headroom
  pass;
- current offline evidence proves one Bass phrase is deterministic, finite and unclipped, but its
  three coarse spectral bands cannot diagnose aliasing, harshness, onset clicks, stereo collapse,
  preset duplication or perceived desirability across the catalog.

The stage first measures this baseline. It does not assume that every weakness needs a new DSP
primitive, and it does not freeze the current topology before comparing high-return alternatives.

## Research and mathematical foundation

The implementation review begins with a short written synthesis of primary standards and research,
not with unsourced preset folklore:

| Source | What Tiempio takes from it |
| --- | --- |
| [ISO 226:2023 equal-loudness contours](https://www.iso.org/standard/83117.html) | Frequency and level interact in perception; raw RMS equality is not perceived loudness equality. |
| [ISO 532-1:2017 Zwicker loudness](https://www.iso.org/standard/63077.html) | Perceptual loudness is a useful analysis axis for stationary and time-varying synthetic sounds. |
| [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I) | Reproducible K-weighted loudness and oversampled true-peak measurement for fair trials and headroom. |
| [ITU-R BS.1534-3](https://www.itu.int/rec/R-REC-BS.1534-3-201510-I) and [BS.1116-3](https://www.itu.int/rec/R-REC-BS.1116-3-201502-I/en) | Randomized, level-matched, trained and blind listening principles; Tiempio uses an appropriately scoped internal derivative and does not claim formal compliance without meeting every condition. |
| [Välimäki, Nam, Smith and Abel, alias-suppressed oscillators](https://research.aalto.fi/en/publications/alias-suppressed-oscillators-based-on-differentiated-polynomial-w/) | Discontinuous virtual-analog waveforms require explicit antialiasing; bounded polynomial methods are candidates for the real-time engine. |
| [Pekonen, filter-based oscillator algorithms](https://research.aalto.fi/en/publications/filter-based-oscillator-algorithms-for-virtual-analog-synthesis) | Naive subtractive oscillators create disturbing aliasing, and candidate band-limited methods must be compared for sound and cost. |
| [McAdams et al., perceptual scaling of synthesized timbres](https://articles.ircam.fr/textes/McAdams95a/) | Log attack time, spectral centroid and spectral variation are meaningful coordinates for catalog identity and macro direction, not a complete definition of beauty. |

The research note records formulas, citations, assumptions, stimulus conditions and where the
chosen approximation differs from a formal standard. No standard name is used as a marketing or
compliance claim.

## One quality model, two gates

### Objective defect and behaviour gate

The offline sound lab renders a versioned matrix and derives at least:

- sample peak and 4x-oversampled true peak in dBTP;
- K-weighted loudness for fixed phrases plus unweighted RMS and crest factor;
- DC offset, non-finite values and every activation of the output guard;
- fundamental/pitch error after the attack and harmonic-to-noise ratio where meaningful;
- intended harmonic energy versus foldback/alias energy for controlled oscillator sweeps;
- spectral centroid, roll-off, high-frequency ratio, spectral flux and spectral irregularity;
- log attack/rise time, decay landmarks, release-to-silence time and onset discontinuity;
- mono/side energy, inter-channel correlation, low-frequency side energy and mono fold-down loss;
- loudness and descriptor spread across the approved role range and velocity set;
- CPU time per voice/block, maximum active voices, allocations and deadline margin in native and
  WASM builds.

Hard safety gates include zero non-finite output, zero unexpected output-guard clamps in the
catalog matrix, bounded DC, bounded true peak, no stuck tail and the existing real-time allocation
contract. Aliasing, register balance, stereo compatibility and level-spread limits are frozen from
the baseline/research stage **before** candidates are ranked, then recorded in a versioned quality
profile. Thresholds may differ by role but cannot be loosened after hearing a favourite candidate
without an explicit reviewed plan change.

Macro direction is tested over level-matched renders using rank correlation and continuity:

- `brightness` must strongly increase a brightness descriptor such as spectral centroid/roll-off;
- `hardness` must shorten perceived attack or increase controlled transient/filter-envelope
  definition;
- `dirt` must increase intentional harmonic enrichment while remaining below the alias/headroom
  limits;
- `length` must strongly increase measured audible decay/release duration;
- `width` must increase side energy while retaining the defined mono-compatibility floor.

The default target is absolute Spearman `ρ >= 0.9` for Brightness, Length and Width and
`ρ >= 0.85` for Hardness and Dirt across the representative sweep. A documented plateau is
allowed; an unexplained reversal, discontinuity or loudness spike is not. Perceptual parameters use
appropriate curves: frequencies and times map exponentially/logarithmically, gains in decibels or
equal-power space and bounded blends with continuous derivatives where a live sweep exposes them.

Descriptor vectors are standardized within their role and inspected with distance plots/PCA or
multidimensional scaling. This reveals duplicate presets and uncovered timbre regions, but a large
distance does not itself approve an ugly sound.

### Subjective desirability gate

The second gate answers what the metrics cannot:

- `I want to play this again`;
- `I would use this in a track`;
- `This fits the role/name`;
- `The sound responds expressively to velocity and duration`;
- `The macros improve or intentionally transform it`;
- `It remains pleasant/useful for repeated listening`;
- free-text artifact flags: harsh, whistling resonance, click, weak pitch, mud, tiring width,
  artificial tail, loudness jump or another concrete problem.

Trials are randomized, name-hidden and loudness-matched so “louder” cannot win by default. The same
candidate is heard as isolated notes, a role phrase, a chord/polyphony stress where appropriate,
and a tiny Bass/Lead/Pad/Drums context. Both decent headphones and ordinary laptop/consumer speaker
playback are represented; device and listening level are recorded.

Two panels have different jobs:

1. trained/critical listeners find subtle technical artifacts and fatigue;
2. target creators, including less experienced musicians, rate immediate desire, clarity and
   usefulness without needing synthesizer vocabulary.

A pilot determines sample size through power analysis and freezes the analysis plan. Candidate
comparisons use paired observations, bootstrap confidence intervals and effect sizes rather than a
single informal vote. Each replacement must improve the current version with a meaningful effect
or justify itself as a distinct role while meeting the frozen absolute desirability floor. Repeated
critical artifact reports block release. Weak or duplicate sounds are improved, merged or removed;
the catalog count is never the acceptance target.

The initial frozen decision rule uses seven-point scales: median `want to use` and role-fit are each
at least `5/7`, their lower quartile is at least `4/7`, and a replacement candidate's paired
desirability improvement over the current version has a positive 95% bootstrap confidence bound.
A candidate kept for a genuinely different role may use a predeclared non-inferiority margin
instead, but still clears the absolute floors. The same critical artifact independently reported
by two trained listeners blocks that candidate until a new corrected study round. The pilot may
change these numbers only before unblinding catalog candidates and with the reason recorded; it is
not permission to lower the bar after results are known.

## Versioned stimulus matrix

Every preset is rendered with identical deterministic material where comparable and a
role-specific phrase where necessary:

- low, middle and high notes inside the stated recommended range;
- velocity 32, 80 and 120, plus a continuous velocity-response probe;
- short tap, held note and release during a non-zero envelope stage;
- repeated staccato, legato/retrigger, octave leap and fast pitch alternation;
- unison interval, three-note chord and bounded dense polyphony for polyphonic families;
- default macro values, each macro's low/default/high positions, continuous one-axis sweeps and a
  pairwise/corner design that covers dangerous interactions without an unbounded Cartesian grid;
- 44.1 and 48 kHz as primary target rates, with a bounded higher-rate regression probe where the
  target supports it;
- solo, mono fold-down, and one small level-controlled mix with the protected drum reference.

The matrix and its maximum render count are versioned. A low-discrepancy Sobol or Latin-hypercube
sample covers multidimensional patch space more efficiently than random knob twiddling. Automated
analysis rejects unsafe regions; Pareto ranking retains candidates that balance role descriptors,
low artifacts, headroom, macro range and CPU cost. Human sound design selects and refines the final
sound. An optimizer is an exploration assistant, never the taste authority.

## Bounded DSP ceiling work

The baseline bake-off evaluates a small set of high-return engine improvements. The stage may
adopt them only with audible preference evidence, cross-target determinism and measured callback
headroom:

1. **Band-limited periodic waveforms.** Add correct antialiased Square/Pulse edges and a
   DC-stable band-limited Triangle method; retain or improve the existing PolyBLEP Saw. Sweep tests
   compare intended harmonics and foldback at every supported target rate.
2. **Controlled nonlinear colour.** Compare oversampled or antiderivative/otherwise
   alias-controlled saturation against the current audio-rate tanh path. Loudness compensation
   prevents Drive from winning by gain alone.
3. **Expressive key/velocity response.** Add versioned key tracking, velocity-to-amplitude curves
   and optional velocity-to-filter/attack response so low/high notes and soft/hard playing remain
   musical rather than being a linear volume multiplier.
4. **Envelope quality.** Compare perceptually useful exponential/curved segments, retrigger policy
   and click-safe very short attacks/releases while preserving exact bounded voice cleanup.
5. **Timbre breadth.** Bake off one bounded secondary oscillator/blend or fixed small unison model
   for families that cannot reach an accepted identity with the current single-waveform topology.
   Voice count and stereo behaviour remain explicit patch data, not hidden random state.
6. **Space and motion.** Only after dry sounds pass, compare a bounded chorus/delay/room primitive
   for Pad/Texture/Lead. It becomes a versioned render-graph/patch node with mono and CPU gates, not
   an always-on master effect. If it adds spectacle but damages mix clarity or target budgets, it is
   deferred rather than smuggled into presets.

The stage does not require every candidate primitive. It requires the measured bake-off and enough
adopted primitives to make every retained catalog entry pass. Any accepted patch-model change is
versioned before V4 source material is frozen.

## Semantic macro surfaces

One formula for all presets is replaced by a versioned per-family/per-preset mapping made from
shared curve primitives. Each mapping defines:

- default sweet spot and safe `[0, 1]` domain;
- target DSP parameters and nonlinear curve;
- gain compensation in dB;
- descriptor expected to move and its valid role/pitch range;
- smoothing time and continuity contract;
- interaction constraints with the other macros;
- mapping revision and deterministic resolver fixture.

The UI still shows only `Dark/Bright`, `Soft/Hard`, `Clean/Dirty`, `Short/Long` and the approved
width language. It does not expose oscillator/filter implementation. A macro may control several
DSP parameters together, but all audible movement must support the named intention. Preset and
macro changes use the same live preview path in Sound Chooser, Sound Sculpt, upper brick preview,
song playback and offline render.

## Family briefs

### Bass

- stable, tuneful fundamental and useful translation on small speakers;
- controlled sub energy, mono low end and no phase-dependent disappearance;
- clear attack without clicks, mud or high-register alias whistle;
- soft velocity remains audible, hard velocity gains definition rather than only level.

### Lead

- immediate pitch identity and expressive attack;
- bright options remain smooth enough for repeated high-register notes;
- stereo width supports presence without hollow mono fold-down;
- every retained character is meaningfully distinct in a melodic phrase.

### Pad

- beautiful onset/tail, stable chords and controlled cumulative polyphony;
- width and motion create life without seasickness, phase holes or endless masking tails;
- chord loudness/headroom is designed explicitly, not inferred from a safe single note.

### Pluck

- convincing transient and decay shape without a one-sample click;
- pitch remains clear throughout the decay;
- repeated notes do not produce uncontrolled peaks; high notes do not reveal foldback.

### Texture

- noise, movement and roughness are intentional and musically placeable;
- “interesting” does not mean broadband fatigue or random level;
- each texture retains a recognisable identity at low level and in mono.

### Drums

- keep the current approved punch and identity as the positive reference;
- add the same true-peak, loudness, mono, device and mixed-context evidence;
- protect choke, transient and variant contrast; change an algorithm only for a demonstrated defect
  or a clearly preferred, level-matched candidate.

## Persistence and catalog evolution

`presetId`, preset revision, macro values, macro-mapping version and the complete resolved patch
remain stored together. New projects use the reviewed catalog revision. Existing projects keep
their exact resolved sound after an application update, even when the preset with the same name is
improved.

If a patch-model revision is required:

- protocol, TypeScript and Rust validation change together;
- V2 -> next-version migration is deterministic and preserves the old audible patch rather than
  silently substituting the new catalog;
- an optional future `Update sound to latest version` is an explicit previewable project command,
  never a load-time side effect;
- old-version rendering remains supported for the documented compatibility window or is converted
  once into an acoustically equivalent new patch with retained golden evidence;
- catalog names and descriptions are finalized after the audio identity is frozen, so copy cannot
  compensate for a misleading sound.

An entry removed from the new-user chooser becomes a recognized legacy preset ID rather than an
invalid project value. Active catalog membership and decode/render compatibility are separate
registries: the former may shrink after review, while the latter retains every supported old ID and
its resolved-patch path for the compatibility window.

## Implementation stages and branch sequence

All stages use the primary worktree and merge sequentially into
`feature/perceptual-sound-quality`. Heavy Rust, WASM, render-matrix and packaging checks never run
concurrently.

### SQ-A — Research, baseline corpus and listening protocol

**Branch:** `feature/sound-quality-baseline`.

- write the cited research synthesis and versioned quality profile;
- render the complete current catalog matrix without changing sound;
- retain baseline descriptors, selected WAV witnesses, hashes and known-problem annotations;
- design the randomized level-matched listening study, pilot, power analysis and frozen decision
  thresholds;
- document role ranges and positive-control drums.

**Exit:** every current preset has reproducible baseline audio/metrics and no candidate work begins
before the defect thresholds and subjective protocol are frozen.

### SQ-B — Offline perceptual analysis lab

**Branch:** `feature/sound-quality-lab`.

- extend streaming offline analysis with true peak, loudness, timbre, stereo, pitch, onset/tail and
  alias probes;
- add bounded deterministic stimulus generation, Sobol/Latin-hypercube parameter manifests and
  candidate comparison reports;
- keep the lab offline and out of application/runtime bundles;
- verify reference signals and approximations against documented fixtures.

**Exit:** one command under the lifecycle owner produces a bounded catalog report and rejects
known synthetic defects without loading the UI or allocating in the audio callback.

### SQ-C — High-return DSP quality primitives

**Branch:** `feature/synth-quality-primitives`.

- implement and bake off band-limited Square/Pulse/Triangle plus alias-controlled nonlinear colour;
- improve click-safe envelope/retrigger, key tracking and velocity response;
- measure native/WASM determinism, CPU, allocations and sample-rate behaviour;
- update the patch model only for accepted primitives and retain old-patch compatibility.

**Exit:** adopted primitives beat the current level-matched baseline in blind artifact tests, meet
the frozen objective profile and preserve callback budgets on native and WASM.

### SQ-D — Timbre breadth and macro mapping

**Branch:** `feature/perceptual-macro-mapping`.

- run the secondary-oscillator/unison and bounded-space-effect bake-offs;
- adopt only the minimum topology expansion required by accepted family briefs;
- replace the global linear macro resolver with versioned perceptual curve mappings;
- implement loudness compensation and continuous smoothing across every macro path;
- add correlation, reversal, discontinuity and dangerous-corner tests.

**Exit:** all semantic macros are directionally truthful and every reachable reviewed surface stays
inside artifact, headroom, mono and CPU limits.

### SQ-E — Curated catalog production

**Branch:** `feature/curated-sound-catalog`.

- generate bounded candidate pools, curate by ear and refine each family against its brief;
- level-match defaults without erasing intentional dynamics;
- design velocity, register, polyphony and mix behaviour for every retained preset;
- improve, merge or remove weak/duplicate entries instead of preserving 27 by obligation;
- update names/descriptions only after sound identities pass;
- leave the user-approved drums unchanged unless a documented A/B justifies a correction.

**Exit:** every visible default and macro surface passes internal technical review and is ready for
blind creator testing; no placeholder/filler sound remains.

### SQ-F — Cross-target preference acceptance and catalog freeze

**Branch:** `feature/sound-quality-acceptance`.

- run the frozen trained-listener and target-creator panels;
- analyze paired results, confidence intervals, effect sizes and artifact reports;
- rework or remove failures, then rerun only through a declared new study round;
- verify Desktop/Web parity, headphones/laptop speakers, 44.1/48 kHz, real-time/offline and compact
  mixed-song contexts;
- freeze preset, macro-mapping and patch-model revisions with a manifest and retained evidence;
- update Stage 7 fixtures to consume the frozen catalog without redesigning it.

**Exit:** every retained visible sound clears the desirability/role-fit floor, has no repeated
critical artifact report, passes the mathematical profile and reproduces through native and WASM.

## Edge cases and failure policy

- A candidate is preferred only before loudness matching: reject the comparison and correct gain.
- A preset is beautiful at middle C but harsh or weak at its role boundary: it is not accepted.
- A default passes but one macro corner clips, whistles, collapses in mono or explodes in release:
  the whole published surface fails.
- Dirt or resonance creates intentional roughness that an alias metric misclassifies: inspect the
  spectrum/listening evidence and change the versioned metric profile openly; do not silently waive
  one candidate.
- A high-quality primitive misses the Web callback deadline: optimize or reject it; Desktop does
  not receive a private better synth fork.
- 44.1 and 48 kHz produce materially different identity: fix rate normalization before catalog
  tuning.
- Dense Pad chords or overlapping releases exceed headroom despite safe solo notes: redesign voice
  gain/envelope or bounded dynamics; do not rely on the final output guard as a sound designer.
- Wide sound vanishes or changes pitch colour in mono: constrain low-frequency side energy and
  mapping range.
- Noise/random phase makes evidence non-repeatable: seed deterministically per voice identity while
  retaining perceptually appropriate variation.
- Existing projects change after catalog update: block release and repair resolved-patch migration.
- A removed weak preset makes an old project fail validation: restore it to the legacy-ID registry;
  hiding a new choice never invalidates saved content.
- Listening results disagree between trained and target users: retain both reports, investigate the
  attribute/device interaction and do not average away a critical artifact.
- No candidate for a named slot clears the gate: remove the slot or improve the engine; do not ship
  the least bad candidate.

## Verification matrix

| Boundary | Required evidence |
| --- | --- |
| Catalog identity | Stable preset/revision/patch manifest; no duplicate or filler decision without review |
| Oscillators/nonlinearity | Sweeps, intended-harmonic versus foldback energy, rate parity and level-matched A/B |
| Perceptual level | Fixed-stimulus loudness, true peak, crest/headroom and no louder-wins trial |
| Timbre | Attack, centroid, flux/irregularity, role-range and velocity descriptor reports |
| Macros | Rank correlation, continuity, no reversal/dead zone and all dangerous corners bounded |
| Stereo | Correlation, side/low-side energy, mono fold-down and ordinary speaker review |
| Polyphony | Chords, repeated notes, release overlap, voice stealing and output-guard counters |
| Runtime | Same patch/PCM tolerance in offline, native and WASM; zero callback allocations |
| Persistence | Old resolved patches reopen unchanged; new catalog revision round-trips deterministically |
| Subjective | Randomized name-hidden level-matched panel, power analysis, intervals/effect sizes and artifact log |
| Product | Every Sound Chooser entry invites replay/use and behaves truthfully in Sound Sculpt |

## Definition of done

- The research synthesis, quality profile, stimulus matrix and listening analysis plan are reviewed
  and versioned before candidate ranking.
- Every retained synth preset has a distinct role, accepted default, safe macro surface, expressive
  velocity/register behaviour and small-mix evidence.
- Band-limited waveforms and nonlinear colour meet the frozen alias profile at target rates; no
  accidental digital harshness is hidden by filtering or gain.
- Catalog switching is level-controlled, true-peak safe and free of output-guard clamps,
  non-finite values, stuck tails and unbounded DC.
- Macro mappings are perceptually directional, continuous, gain-compensated, versioned and exactly
  reproducible from saved project state.
- Weak or duplicate presets are improved or removed; catalog size is a result, not a goal.
- The current drums retain their approved identity and pass regression/mix evidence.
- Trained listeners approve technical cleanliness and target creators clear the frozen desire-to-use
  and role-fit gates under blind level-matched conditions.
- Desktop native and Web/WASM render the same catalog within documented deterministic tolerances
  and callback budgets.
- Existing projects retain their resolved sound after the catalog/patch revision.
- Stage 9 V4 source work and recording begin only after the catalog and patch model are frozen.
- All heavy analysis, Rust/WASM checks, builds and packaged acceptance run sequentially through the
  fail-fast lifecycle owner with one lock, bounded per-stage timeouts, heartbeats, signal handling
  and exact task-owned process-tree cleanup.
