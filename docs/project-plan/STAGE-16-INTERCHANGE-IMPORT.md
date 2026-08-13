# Stage 16 — MIDI, audio stems and safe DAW migration

## Status and placement

**Status:** approved planning baseline; implementation has not started.

This is the first post-foundation interchange stage. It begins only after Stage 15 has accepted the V4
source/instance architecture, starter content, personal audio and audio export. Import introduces
batch hostile external files and lossy mapping from other music tools, so it must not be folded into
Stage 6 Web runtime or Stage 10 song work. It reuses the already accepted `AudioAssetV1`,
`AudioPhraseSource`, WAV validator/decoder and fixed-audio scheduler.

The initial delivery supports:

- opening another person's validated `.tiempio` file through the existing Open flow;
- importing Standard MIDI Files (`.mid`, type 0 and type 1) as editable Tiempio sources and song
  instances;
- importing a bounded folder/set of aligned PCM WAV stems as audio sources;
- a guided `Перенос из другой DAW` workflow, including explicit Ableton Live instructions based on
  officially exported MIDI clips and WAV stems.

It does **not** parse Ableton `.als`, Live Clips, device racks, Max for Live devices, plug-in state or
other undocumented proprietary project formats.

## Legal and interoperability decision

Processing files that a user created or is authorized to use is a normal interoperability feature.
Ableton's official manual says that Live can export Standard MIDI files and audio intended for use
with other digital audio applications; it also documents rendering `All Individual Tracks` to
equal-length stems. See the official
[Live file/export manual](https://www.ableton.com/en/manual/managing-files-and-sets/) and
[stem-transfer guide](https://help.ableton.com/hc/en-us/articles/360000843404-Importing-and-exporting-stems).

Direct `.als` support is not approved. Ableton's current EULA prohibits reverse engineering,
decompiling and creating derivative works from the Ableton Product, subject to applicable-law
limits; see [Ableton EULA §5](https://www.ableton.com/en/eula/). Ableton also explains that an `.als`
contains references while samples, plug-ins and devices may live elsewhere, so an `.als` alone is
not a portable complete project; see its
[project-transfer guidance](https://help.ableton.com/hc/en-us/articles/209071909-Transferring-Projects-to-another-computer).

Therefore Tiempio takes the conservative route:

- no `.als` parser, decompressor, schema inference, Live installation scanning or UI automation;
- no Ableton logo, implied partnership or claim of full-fidelity Live project conversion;
- no extraction of Ableton factory content, presets, devices, plug-ins or protected demo songs;
- no bundled reverse-engineered fixtures or third-party `.als` parsing library;
- direct support can be reconsidered only after an official documented interchange API/format,
  written permission from Ableton, or jurisdiction-specific counsel approves a concrete design.

The import page states that users must own or have permission to use the composition, MIDI and
audio they select. Import does not grant rights to third-party samples, loops, performances or
plug-ins. Ableton's EULA places additional limits on isolated factory materials and demo songs, so
the migration guide recommends rendered original compositions/tracks and never encourages
extracting stock content. This policy is an engineering gate, not legal advice.

## Navigation and terminology

`Импорт` is a separate top-level destination in the outer application rail, visually paired with
`Экспорт` and distinct from `Открыть проект`:

- `Открыть` loads an existing `.tiempio` project without conversion;
- `Импорт` converts supported external musical/audio data into a new or existing Tiempio project;
- `Экспорт` renders a Tiempio song to audio.

The three actions use different labels, icons, tooltips and screen-reader names. Import never uses
Save/Download language. On compact phone/tablet layouts it may move into the shared navigation
drawer/bar while retaining the same semantic route.

Opening Import does not discard the current project. Returning restores source selection, per-brick
viewport, song dock and inspector state. With no project, the user can create a new project from the
import. With an open project, the first choice is explicit:

- `Создать новый проект из файлов`;
- `Добавить в текущий проект`.

Replacing a project with unsaved changes always uses the ordinary guarded close/replacement flow.

## Import workspace

### Entry choices

The first screen offers only supported routes:

1. `Проект Tiempio (.tiempio)` — delegates to Open and explains that no conversion occurs;
2. `MIDI (.mid)` — editable notes, velocities and supported timeline metadata;
3. `Аудиодорожки (.wav)` — aligned rendered tracks with original sound;
4. `Перенос из Ableton Live` — an instruction-led MIDI/stem route, not direct `.als` opening.

Unsupported files fail before project mutation with a specific reason and a supported alternative.
There is no generic `Все файлы` picker that accepts arbitrary extensions and fails later.

### Staged draft, preview and atomic commit

Import is a resumable application draft, not immediate mutation:

```text
InterchangeImportDraft
  draftId / targetProjectId?
  sourceKind and opaque selected handles
  decoded metadata summary
  tempo/meter/key decisions
  track mappings[]
  warnings / blocking failures
  estimated project/assets/render-plan cost
  state: selecting | analysing | mapping | ready | committing | failed
```

Selection and analysis create no project revision, dirty state, recovery snapshot or Undo entry.
The user sees track names, lengths, note/event counts, channels, sample formats and any dropped or
unsupported data before committing. `Импортировать` dispatches one bounded grouped transaction. In
an existing project, one Undo removes the entire imported batch; in a newly created project, the
imported snapshot becomes the new project's initial baseline rather than hundreds of synthetic Undo
steps.

Failure before or during validation exposes no half-created sources/assets. A target project
revision conflict returns to the ready mapping draft so the user can review/retry.

## Standard MIDI import

### Supported data

Initial support is Standard MIDI File type 0 and type 1 with bounded:

- tracks and channels;
- note-on/note-off including velocity-zero note-off convention;
- note pitch, start, duration and note-on velocity;
- tempo meta events;
- time-signature meta events;
- track names and end-of-track;
- sustain pedal only if the import policy deterministically resolves held-note durations;
- format division in PPQ ticks; SMPTE division is rejected initially with an explicit reason.

SysEx, plug-in/instrument definitions, lyrics, proprietary meta events, MPE, aftertouch, arbitrary
CC automation, program changes and bank selects are not silently treated as supported. The summary
lists ignored data by type/count. Future importers may add them through versioned capability rules.

### Mapping to bricks and song

- Type 0 channels are proposed as separate bricks where channel semantics are usable.
- Type 1 tracks are proposed as separate bricks, with channel splitting available when needed.
- General MIDI channel 10 may be proposed as Drums, but the user confirms the mapping.
- Other tracks are proposed as Bass, Harmony, Melody or generic melodic bricks using range,
  polyphony and name heuristics; a heuristic is a suggestion, never hidden canonical truth.
- MIDI program numbers may suggest a Tiempio sound family but cannot claim to reproduce the source
  DAW instrument.
- Each imported musical track becomes one source brick plus finite song instance placements; shared
  repeated phrases are linked only when exact event identity/repetition can be proven.
- Tempo and meter are imported into a new project. Adding to an existing project requires an
  explicit choice to keep the current transport map or adopt compatible imported values.
- Notes retain exact rational musical time as far as project PPQ permits; conversion uses one
  documented rounding policy and reports any lossy quantization.

The mapping page allows rename, role/sound choice, track exclude and merge/split before commit.
All imported notes remain visible and editable; no event may be placed invisibly outside source
bounds or silently dropped because it lies outside a recommended instrument range.

## PCM WAV stem import

### Supported audio boundary

Initial audio import accepts local uncompressed PCM WAV only, with bounded:

- mono or stereo;
- 16-, 24- or 32-bit integer PCM and reviewed 32-bit float if the decoder validates finite samples;
- 44.1 or 48 kHz initially;
- channel count, frames, duration, aggregate bytes and number of stems;
- RIFF chunk count/size and metadata length.

Compressed audio, AIFF, FLAC, MP3, video, warped clips and arbitrary codecs require later explicit
decoder/security plans. A supported source rate is preserved or converted once by the reviewed
offline resampler; no browser/native decoder discrepancy may silently alter timing.

Every stem becomes an `AudioPhraseSource` with a content-addressed project asset and a finite song
instance. Stage 16 adds batch alignment/import metadata; it does not introduce a third personal-audio
type. All selected stems start at the same chosen origin, preserving leading silence and equal
alignment. The user supplies or confirms tempo, meter and optional key. Initial stems do not
time-stretch when project tempo changes; the UI clearly labels them `фиксированное аудио`.

Audio import copies bytes into the bounded `.tiempio` asset store or target-owned content-addressed
storage according to project-format policy. It never depends on an absolute external path after a
successful portable import. If the project format cannot safely contain the aggregate size, commit
is blocked before copying with a specific size/action message.

### MIDI and stem pairing

When names suggest both MIDI and a rendered stem for one source, the wizard asks what the user
wants:

- `Редактируемые ноты` — import MIDI and choose a Tiempio sound;
- `Исходное звучание` — import the stem as fixed audio;
- `Оба` — create two clearly named sources, with one initially muted to prevent accidental doubling.

Tiempio never claims that MIDI can reproduce Ableton instruments/effects or that a stem remains
note-editable.

## Guided Ableton Live migration

The page provides version-neutral instructions derived from Ableton's official workflow:

1. Open the user's own Live Set in Ableton Live.
2. For audio fidelity, select the complete Arrangement and use `Export Audio/Video` with
   `All Individual Tracks`, identical Render Start/Length, WAV, Normalize off and a shared sample
   rate. Preserve leading silence so files remain aligned.
3. For editable notes, export required MIDI clips as Standard MIDI files. Live exports MIDI clips,
   not a complete Set as one universal MIDI project, so the user may need multiple files.
4. Import the WAV/MIDI files into Tiempio, enter/confirm BPM and meter, review track mappings and
   commit.

The wizard explains fidelity before file selection:

| Live concept | Tiempio migration result |
| --- | --- |
| MIDI notes and velocities | Editable when exported as Standard MIDI |
| Live instrument/effects/rack/plug-in | Not converted; choose Tiempio sound or use rendered stem |
| Audio result of a track | Preserved by WAV stem within PCM/sample-rate limits |
| Arrangement position | Preserved by equal-length stems from tick/time zero; MIDI clip placement is user-reviewed |
| Session View launching | Not preserved as live launch behavior |
| Automation, warp, groove, follow actions | Heard in rendered stem where applicable; not editable unless separately supported |
| Return/Main processing | Depends on Ableton export choice and is disclosed, never inferred |

Tiempio does not detect whether Live is installed, launch it, control it or read its preferences.
All file selection is initiated by the user.

## Application, project and runtime architecture

### Import coordinator

`InterchangeImportCoordinator` owns the transient draft, decoder jobs, target project revision,
mapping decisions and atomic commit. It consumes focused `ApplicationRuntime.import` capabilities:

- select MIDI files or WAV stems through target-owned opaque handles;
- read bounded byte ranges/streams;
- inspect metadata without loading the full payload when possible;
- decode into neutral versioned MIDI/audio intermediate records;
- cancel, report progress and clean exact task-owned temporary resources.

Format decoders cannot dispatch project commands. A separate pure mapper validates intermediate
records against current project/source/asset ceilings and produces one proposed command group.

### Neutral intermediate data

```text
ImportedMidiDocument
  format / division / tempoMap / meterMap
  tracks[] / warnings[] / sourceHash

ImportedAudioAsset
  channels / sampleRate / sampleFormat / frames
  contentHash / boundedMetadata / sourceHandle

ImportProposal
  targetProjectRevision?
  newProjectMetadata?
  source creations / asset creations / song instances
  transport decision / warnings / limits
```

Intermediate data is immutable, bounded and target-neutral. Project IDs/event IDs allocate only at
commit. File names and external paths are presentation metadata and cannot become canonical asset
identity.

### Desktop and Web

- Desktop main owns native file/folder dialogs, paths and bounded streaming; renderer sees opaque
  handles and neutral records only.
- Web uses user-activated file inputs/File System Access handles and Worker-based bounded parsing;
  it never pretends directory access exists when unsupported.
- Neither target uploads files, scans the filesystem, searches for Ableton installations or sends
  project names/content to analytics.
- MIDI parsing is shared deterministic code. WAV validation/decoding produces the same canonical
  samples and hashes within the defined numeric contract.
- Large copying, decode, resample and archive writes run off the UI thread with progress and
  cancellation.

## Security and rights policy

- Validate magic bytes and internal structure; never trust extension or MIME alone.
- Enforce per-file and aggregate byte/frame/event/track/chunk/metadata limits before allocation.
- Reject non-finite samples, arithmetic overflow, overlapping/out-of-bounds chunks, malformed MIDI
  variable-length quantities, runaway events and unsupported encodings.
- Archives are not accepted in the initial route, avoiding nested compression and traversal risk.
- Imported names are normalized as display text and never interpreted as paths or HTML.
- Content hashes deduplicate only exact bytes; they do not prove ownership.
- Before commit the user confirms `Я создала эти материалы или имею право их использовать`.
- A rights warning is retained in UX/evidence, not serialized as a false legal warranty.
- No DRM, Ableton authorization, plug-in licensing or protected-content boundary is bypassed.

## Implementation order

**Integration branch:** `feature/interchange-import`, created from the accepted Stage 15 integration
branch.

1. `feature/import-workspace-and-contracts` — left-rail route, coordinator, neutral schemas,
   target selection and hostile-file limits;
2. `feature/standard-midi-import` — shared SMF parser, tempo/meter/event conversion, mapping and
   deterministic project proposals;
3. `feature/aligned-stem-mapping` — batch origin/alignment metadata and finite phrase instances over
   the accepted portable-audio domain;
4. `feature/pcm-wav-stem-import` — native/Web streaming validation through the shared decoder,
   aligned stem proposal and portable asset commit;
5. `feature/daw-migration-assistant` — Ableton-safe official-export instructions, MIDI/stem pairing,
   fidelity and rights disclosure without `.als` access;
6. `feature/interchange-import-integration` — Desktop/Web save/reopen/recovery, export of migrated
   projects, security fuzz/property suites and retained UX/audio evidence.

Each branch is reviewed and integrated sequentially. Resource-intensive decoding, resampling,
archive, native/WASM and package/browser checks run only through the single-lock fail-fast lifecycle
owner with bounded timeouts, heartbeats, signal propagation and exact task-owned cleanup.

## Failure and edge cases

- User selects `.als`, `.alp`, `.adg`, `.alc` or a plug-in preset: reject before parsing and show the
  supported Ableton MIDI/stem instructions.
- A MIDI note lacks note-off, overlaps the same pitch/channel or crosses track end: apply the
  documented bounded repair/rejection policy and report it.
- Tempo/meter maps conflict with an existing project: never overwrite silently.
- MIDI PPQ exceeds project precision or notes exceed supported pitch/time: report rounding/clamp
  proposal before commit; destructive loss requires explicit approval or rejection.
- Stems have unequal duration/start assumptions: show alignment differences and require an origin
  decision rather than trimming leading silence automatically.
- Stem sample rates/channels differ: preflight every conversion and aggregate cost.
- Duplicate file selection or identical content hashes: deduplicate only with user-visible mapping.
- User cancels during read/decode/resample/copy/commit: no half source, asset, temp file, worker or
  process survives.
- Browser permission disappears, disk fills or project archive ceiling is reached: keep the draft
  and expose a specific retry/reduce action.
- Project changes while mapping: revalidate against the new revision before atomic commit.
- Plug-in-produced audio or licensed loops are present in stems: Tiempio cannot infer rights; the
  confirmation and local-only processing remain explicit.
- React Strict Mode/remount cannot duplicate picker, decoder or commit.

## Verification

### Automated

- SMF type 0/1 golden fixtures for notes, velocities, running status, tempo/meter, multi-track,
  overlaps, sustain policy and rounding;
- malformed/fuzzed MIDI limits, variable-length overflow and deterministic native/Web proposals;
- PCM16/24/32 and reviewed float WAV fixtures across mono/stereo and 44.1/48 kHz;
- malformed RIFF/chunk/finiteness/size-bomb cases and cross-target sample/hash parity;
- mapping tests for type/channel split, drum suggestion, role suggestion and explicit exclusions;
- atomic new-project/existing-project commit plus one-step Undo/Redo;
- reuse of the Stage 12 audio-phrase project format, save/reopen/recovery and content-addressed
  deduplication without a parallel asset/source representation;
- imported source/instance render-plan and subsequent Tiempio WAV export;
- no `.als` dependency/parser/import route, Ableton installation scan, path leak or network transfer;
- cancellation and exact cleanup at every asynchronous boundary;
- bundle, parse/decode, memory, archive and UI long-task budgets.

### Human and visual

- Light/Dark Import rail and all select/analyse/map/ready/progress/failure states;
- standard, constrained, tablet, phone and 200% zoom layouts;
- keyboard, screen reader, touch, reduced motion and focus-return walkthrough;
- migration of rights-controlled Ableton test projects via official MIDI/stem exports;
- A/B of Ableton rendered stems before/after Tiempio import with alignment proof;
- review showing exactly which musical data remains editable and which sound is fixed audio;
- legal/product sign-off on wording, trademark presentation and absence of direct `.als` support.

## Definition of done

- `Импорт`, `Открыть` and `Экспорт` are distinct understandable application destinations.
- Another person's validated `.tiempio` opens normally; Standard MIDI becomes editable Tiempio
  bricks/song instances; bounded aligned WAV stems become portable fixed-audio sources.
- Ableton users have a documented, tested migration path through Live's official MIDI and stem
  exports without direct `.als` parsing, installation scanning or automation.
- Every lossy mapping or unsupported source concept is disclosed before atomic commit.
- Desktop and Web parse, map, save, reopen, recover and play the same imported canonical content
  within defined limits, locally and without path/rights leakage.
- Hostile, oversized, cancelled or failed imports leave no partial project mutation or task-owned
  resource.
- No unsupported proprietary-project importer is advertised or implemented without a new legal and
  technical approval gate.
