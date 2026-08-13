# Stage 11 — honest empty starts, an original example song and curated rhythms

## Status and placement

This document is the implementation authority for the starter-content gate requested after the
linked-bricks song architecture. Implementation has not started.

The phase begins only after Stage 10A–10D in
[`STAGE-10-LINKED-BRICKS-AND-SONG.md`](STAGE-10-LINKED-BRICKS-AND-SONG.md) have passed on Desktop and Web. It consumes the
frozen instrument catalog from
[`STAGE-8-PERCEPTUAL-SOUND-QUALITY.md`](STAGE-8-PERCEPTUAL-SOUND-QUALITY.md) and the final V4
source/instance model; it must not add a demo-only project model, playback path or copied-note
shortcut. The dedicated audio-export gate then uses the approved example as its full-song fixture;
Stage 15 audits the combined result.

Relevant visual references:

- [Home](../evidence/prototype-visual-reference/light/01-home.png) — add a separate
  `Начать с примера` action without turning Home into a template marketplace;
- [Drum editor](../evidence/prototype-visual-reference/light/05-drums.png) — retain the current
  direct, editable pattern choice and extend it with more genuinely distinct rhythms;
- [Linked bricks and song](../evidence/song-composition-visual-reference/light/06-linked-bricks-song.png)
  — the example must demonstrate this real source/instance workflow.

A reviewed prototype delta for the new Home action, empty-source state and expanded pattern list is
required before implementation UI acceptance.

## Approved product decisions

1. Home exposes four different intents: `Новый трек`, `Начать со звука`, `Начать с примера` and
   `Открыть проект`.
2. `Начать со звука` creates sound, not authored music. After `Use sound`, a melodic source contains
   zero notes, and choosing a drum kit alone contains zero drum events. No invisible, off-viewport
   or inaudible placeholder is allowed.
3. Choosing a named drum rhythm is an explicit content action and may populate visible editable
   drum events. Merely choosing a sound or kit never does.
4. The first `Начать с примера` delivery opens one complete, simple and beautiful original Tiempio
   song. It is editable and uses the same bricks, instances, commands, render plan and engine as a
   user project.
5. The example is bundled locally and opens without network access. It does not autoplay; the user
   starts playback deliberately.
6. Opening the example creates a new independent user-owned project copy. The immutable bundled
   template is never edited, saved into Recent Projects or shared between openings.
7. The four existing patterns — Straight, Sparse, Driving and Broken — remain. The gate adds six
   curated, musically distinct patterns, subject to the same objective and listening-quality bar as
   the retained set.
8. Catalog updates never rewrite existing projects. Example and rhythm revisions are explicit,
   deterministic and reproducible.

The first delivery contains one example song, not a gallery. The catalog boundary must allow more
examples later without changing project or persistence architecture.

## Home and creation flows

### Start from sound — honestly empty musical material

The sound chooser remains an audition surface. Laptop keys, touch keys and Fine Tuning can be used
to evaluate a candidate, but audition events are ephemeral and cannot leak into project material.

After `Use sound`:

- one canonical source is committed with the chosen reproducible instrument state;
- melodic `notes` or the V4 equivalent is exactly empty;
- choosing only a drum kit leaves canonical drum events exactly empty;
- no song instance is placed automatically;
- the editor opens at the source's performance range and shows a concise empty-state invitation;
- no note may exist above, below or to the right of the visible viewport;
- the commit remains one Undo step that removes the complete newly added source.

An explicit named rhythm selection is different: its visible event set is copied into the new drum
source in the same final commit. The source then owns those events and the user can freely edit
them. A later catalog update cannot change that project.

Production factories must make the distinction impossible to blur:

```text
createEmptyUserProject / commitEmptySourceFromDraft
  -> no authored note/event/instance content

instantiateStarterProject(starterContentId, newProjectId)
  -> validated clone of explicitly authored bundled content

applyDrumPattern(sourceId, patternRevision)
  -> explicit command that copies visible editable events
```

Test fixtures and Storybook/prototype data may contain notes only under namespaced fixture helpers;
they cannot be imported by the production New/Start-from-sound route.

### Start from example — a real editable project copy

Selecting `Начать с примера`:

1. loads and validates a bundled starter manifest and canonical project asset;
2. allocates a fresh project ID and fresh persistence identity;
3. retains musical IDs and references only as required inside that new copy, remapping them
   deterministically if global uniqueness requires it;
4. opens the project as `Новый проект · не сохранён`, with no file handle and no false
   `Сохранено` claim;
5. establishes the populated template as the initial Undo baseline, so the user cannot Undo the
   act of loading into a blank document;
6. starts with playback stopped and all voices released;
7. saves later through the ordinary target-specific Save flow.

Closing an unsaved edited copy uses the normal unsaved-project warning. Reopening the starter
creates another independent copy; changes to one copy never affect another. The bundled template
itself never appears in Recent Projects. A saved user copy does.

The entry action must remain reachable with keyboard, screen reader, touch and at 200% zoom. It has
a concise description such as `Открыть готовую песню и разобрать её по кирпичикам`; it is not
presented as another kind of `Начать со звука`.

## Example song brief

### Musical target

The first example is an original instrumental miniature composed specifically for Tiempio:

- approximately 16–24 bars and 45–75 seconds;
- one stable meter and key, with a memorable but deliberately uncomplicated form;
- four or five clearly audible sources: Drums, Bass, Harmony/Pad, Melody/Lead and optionally a
  restrained Texture;
- a readable arc such as intro → groove → fuller statement → release;
- enough space for each instrument to be understood without making the mix sound like a tutorial;
- no external sample, imported MIDI phrase, stock audio loop or recording dependency.

The final title, notes and arrangement are chosen during content authoring. Working names are not
product commitments and must not imitate or advertise the style of a named artist or song.

### What the project must teach by example

Without a modal walkthrough, the open project must visibly demonstrate:

- the same source brick placed more than once as linked instances;
- a source edit propagating to every linked instance;
- a loop-resized instance, a local trim or split and an intentional arrangement gap;
- at least one source with a deliberate pause inside its repeating cycle;
- instruments entering and leaving at different song positions;
- independently editable notes, velocities and drum hits that are all discoverable in their saved
  source viewports;
- a balanced full-song playback through the ordinary lower transport.

The arrangement must remain understandable when the lower song dock is collapsed and reopened.
No explanatory overlay may block experimentation. Small contextual copy may point to linked
instances, but every claim must be derived from real project state.

### Sound and mix acceptance

The example uses only instrument/kit revisions that passed the Stage 8 perceptual sound-quality
freeze. It must pass deterministic offline analysis and human listening on both engine targets:

- no clipping, stuck voices, discontinuity clicks or limiter-dependent loudness trick;
- useful headroom and comparable perceived level between sections;
- no source masks another so completely that its brick becomes misleading;
- stable mono fold-down and no painful resonant or alias-heavy passage across the authored range;
- native and Web/WASM renders remain within the existing parity tolerance;
- creator listening confirms that the track feels like music worth opening, not a technical test.

The acceptance render is evidence only. The shipped source of truth is the editable project, not a
pre-rendered audio file.

The later [`STAGE-13-AUDIO-EXPORT.md`](STAGE-13-AUDIO-EXPORT.md) phase must render this same
editable project through the production Export workspace; it cannot ship or substitute the
acceptance WAV as a hard-coded user export.

## Starter-content and project architecture

Bundled starter content is immutable application content, not project-session authority:

```text
StarterContentCatalog
  manifestRevision
  examples[]
    contentId
    contentRevision
    titleKey / descriptionKey
    projectAssetPath
    projectSchemaVersion
    minimumInstrumentCatalogRevision
    rightsRecordPath
    contentHash
  drumPatterns[]
    patternId
    patternRevision
    titleKey / descriptionKey
    meter and resolution
    cycleTicks
    authored events and velocities
    rightsRecordPath
```

Rules:

- the catalog is validated and frozen at application build time;
- assets use the ordinary current project schema and validation limits;
- `ProjectSession` only receives a cloned validated snapshot and never retains a mutable pointer to
  the catalog;
- a starter revision pins resolved instrument state, so a later preset retune does not silently
  change the shipped example without a reviewed content-revision bump;
- all event IDs, source references and song placements satisfy the same V4 integrity checks as
  saved user work;
- malformed or incompatible starter content fails closed with a specific diagnostic and leaves the
  current project untouched;
- Desktop and Web consume byte-identical catalog assets where target packaging permits; hashes and
  revision metadata prove which content was opened;
- the catalog and example remain bounded by bundle, parse, render-plan and memory budgets.

Starter loading is an application command/workflow, not an engine command. The engine sees only the
ordinary compiled render plan after the new `ProjectSession` is valid.

## Originality, rights and provenance gate

`Без посягательств на авторские права` is implemented as documented original authorship and
licensed ownership, not as the unverifiable promise that no similar sequence has ever existed.
Musical composition and a particular sound recording are distinct works, so the rights record must
cover both the authored composition/project data and any retained promotional or acceptance render.
See the [U.S. Copyright Office overview](https://www.copyright.gov/register/pa-sr.html) and
[Circular 50](https://www.copyright.gov/circs/circ50.pdf). WIPO also treats musical compositions as
protected expression and describes originality as independent creation rather than copying; see
[WIPO copyright protection guidance](https://www.wipo.int/en/web/copyright/protection).

The baseline policy is a human-authored, clean-room Tiempio composition:

- compose from scratch for this product;
- do not import samples, MIDI, stems, loops or remembered transcriptions;
- do not request or market imitation `in the style of` a named artist or identifiable work;
- retain dated project versions, authorship/commission terms and contributor grants or assignment;
- list every source asset and confirm that all sound is generated by reviewed Tiempio instruments;
- retain hashes of the approved project and evidence render;
- perform a documented melodic/rhythmic similarity search and independent listening review before
  release; any recognizable quotation is rewritten and reviewed again;
- obtain jurisdiction-appropriate legal review before commercial release when residual uncertainty
  is material.

If generative AI is ever used, the rights record must disclose exactly what it produced and what a
human selected, arranged or rewrote; this is an exception requiring separate product/legal review,
not the default content workflow. The U.S. Copyright Office states that mere prompting is not
sufficient human authorship, while human-authored expressive selection or modification may matter;
see its [January 2025 copyrightability report announcement](https://www.copyright.gov/newsnet/2025/1060.html).

Required `rightsRecord` fields include content/revision IDs, title, composer/arranger/producer,
creation and approval dates, ownership/license basis, source inventory, excluded third-party
materials, AI-use declaration, reviewer names, similarity-review notes and hashes. This is an
engineering release gate, not a substitute for legal advice.

## Expanded drum-pattern library

### Catalog scope

Retain and re-audit Straight, Sparse, Driving and Broken. Author six additional editable patterns,
for a target catalog of ten. The following are working musical jobs, not final localized names:

1. Four-on-floor — stable dance pulse;
2. Half-time — spacious backbeat;
3. Offbeat — syncopated forward movement;
4. Shuffle — clearly swung, triplet-feeling motion;
5. Rolling — tom/percussion-led continuity;
6. Minimal — restrained pulse with deliberate air.

At least one new pattern should use more than one bar when the musical idea benefits from it. None
may be a renamed density variation of another. Every pattern is deterministic, synthesized by the
existing drum engine and editable hit by hit.

### Mathematical and listening-quality method

For every candidate, retain a machine-readable profile:

- onset vector per voice and accent/velocity vector;
- density by voice and bar;
- inter-onset interval distribution;
- syncopation/off-beat score and downbeat/backbeat strength;
- repetition length, swing compatibility and silence distribution;
- pairwise distance from every retained pattern after normalization.

These metrics detect duplicates, unbalanced density and misleading labels; they do not decide
whether a groove feels good. Candidates are also auditioned at slow, project-default and fast
tempos, with every retained drum kit/character and in representative Bass/Harmony mixes. A
level-matched creator panel rates immediate musical usefulness, label fit, editability and desire
to keep playing. Weak or redundant candidates are rewritten; the release still ships six approved
additions rather than padding the catalog with failed candidates.

Applying a pattern is one named project command and one Undo step. It replaces or merges only after
an explicit user choice with clear copy; no pattern is silently injected by `Use kit` or
`Начать со звука`.

## Implementation order

**Integration branch:** `feature/starter-content` created from the completed Stage 10 integration
branch. Each bounded stage uses its own branch and merges back sequentially:

1. `fix/empty-start-material` — split production empty factories from fixture/example factories,
   remove hidden initial notes/events/instances and add honest empty editor states;
2. `feature/curated-drum-patterns` — version the catalog, retain/re-audit four patterns, author and
   validate six additions, and implement explicit editable application;
3. `feature/original-example-composition` — compose, mix, validate and freeze the original canonical
   example plus its rights record;
4. `feature/example-project-home-flow` — add the Home action, immutable catalog loader, fresh-copy
   semantics, localization, persistence state and responsive/accessibility behavior;
5. `feature/starter-content-acceptance` — run cross-target audio, durability, UX, performance,
   provenance and visual evidence before handing the result to Stage 12 and final Stage 15 audit.

The example composition is not authored against temporary Stage 6 clips. It is created only with
the completed V4 source/instance commands and is regenerated/reviewed if those commands change.

## Edge cases and failure policy

- `Начать с примера` is clicked while another project has unsaved changes: use the ordinary guarded
  project-replacement flow; never replace silently.
- The button is activated repeatedly or by double-click: create one project session and one copy.
- The bundled manifest, hash or project schema is invalid: keep the current project and show one
  actionable starter-content error.
- The example requests an unavailable instrument revision: do not substitute a different sound
  silently.
- The user saves, closes and reopens an example copy after the application catalog updates: the
  saved copy keeps its resolved sounds and content.
- The same pattern is applied twice, applied to the wrong source type or applied at a project limit:
  validate before mutation and keep one truthful Undo boundary.
- An empty synth source is opened after sound audition: no held audition note or audition event is
  present in the project or engine plan.
- The empty editor is scrolled far away: it remains empty; scrolling cannot materialize content.
- A test/demo fixture is accidentally imported into production creation: static dependency and
  production-route tests fail.
- Localization, reduced motion, phone layout or 200% zoom changes Home and pattern geometry but not
  starter content or project bytes.

## Verification and retained evidence

### Automated

- production `Новый трек` and `Начать со звука` tests assert zero notes, drum events and song
  instances until an explicit content command;
- a full-domain scan proves there are no hidden out-of-viewport production placeholders;
- fixture-boundary tests prevent demo helpers/assets from entering blank creation paths;
- starter manifest schema/hash tests and a deterministic clone golden test;
- repeated opening proves fresh project/persistence identities and independent mutations;
- initial-history test proves template population is not an Undo entry;
- save/reopen/recovery tests prove an edited example is an ordinary V4 project;
- catalog property tests cover IDs, revisions, meter/resolution, limits and pattern distances;
- pattern command tests cover replace/merge choice, Undo/Redo and saved-project independence from
  later catalog revisions;
- native/Web offline render and scheduling parity for the complete song and every drum pattern;
- bundle and startup budget checks include the starter catalog explicitly.

### Human and visual

- Light/Dark Home, empty editor and expanded pattern-list witnesses at standard, constrained,
  tablet, phone and 200% zoom sizes;
- keyboard, screen-reader, touch and reduced-motion walkthrough;
- level-matched sound/mix review of the example on representative speakers and headphones;
- blind rhythm review across tempos and kits, retaining score sheets and revision decisions;
- a first-time-user session proving the example explains linked sources and song instances without
  requiring a tutorial overlay;
- signed rights/provenance and similarity-review record for the released content revision.

## Definition of done

- `Начать со звука` produces a visible, playable instrument with honestly empty authored material;
  no hidden or placeholder note/event/instance exists.
- `Начать с примера` opens one beautiful, original, fully editable and independently saveable
  project that exercises real linked bricks and song playback without autoplay or network access.
- The example has a complete provenance/rights record covering composition data and any retained
  render, and no unreviewed third-party or AI-generated material.
- Straight, Sparse, Driving and Broken remain stable, and six additional distinct rhythms pass
  mathematical, engine, listening and editability acceptance.
- Desktop and Web load, play, edit, save and reopen the same starter content through ordinary
  architecture, with no demo-only authority or catalog-driven mutation of user projects.
- Stage 15 can map every criterion above to executable tests or retained evidence.
