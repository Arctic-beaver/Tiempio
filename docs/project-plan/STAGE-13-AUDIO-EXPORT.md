# Stage 13 — dedicated audio export and deterministic WAV mixdown

## Status and placement

**Status:** approved planning baseline; implementation has not started.

This phase begins after Stage 10 linked-brick composition, Stage 11 starter content and Stage 12
personal-audio import/recording. It precedes Stage 14 responsive adaptation and Stage 15 acceptance
of the whole result. The original example song from
[`STAGE-11-STARTER-CONTENT.md`](STAGE-11-STARTER-CONTENT.md) is the mandatory end-to-end
export fixture.

The existing engine already proves a bounded offline PCM16 WAV sink, and the project model already
stores per-layer export inclusion. What is missing is the production application protocol, target
output handling, user-facing workflow and acceptance evidence. This plan provides them without
reusing the real-time callback or exposing native paths to shared UI.

Relevant visual references:

- [Home and outer navigation rail](../evidence/prototype-visual-reference/light/01-home.png);
- [Linked song composition](../evidence/song-composition-visual-reference/light/06-linked-bricks-song.png).

The Export workspace needs a reviewed Light/Dark prototype delta before UI implementation. It is a
new application destination; it does not alter the approved brick/song composition surface.

## Approved product decisions

1. `Экспорт` is a first-class destination in the outer application rail beside Home, Sounds/Project
   navigation and Settings. It is not hidden in a file menu or inside the lower song dock.
2. On desktop and tablet landscape it remains a labelled icon in the left rail. In constrained
   tablet/phone layouts the same semantic destination may move into the shared navigation drawer or
   compact navigation bar, but it keeps the same name, icon and route.
3. The first production delivery exports the complete arranged song as a stereo WAV mixdown.
4. WAV PCM 24-bit is the quality default; WAV PCM 16-bit is the compatibility option. Supported
   sample rates are 48 kHz by default and 44.1 kHz by explicit choice.
5. MP3, AAC, FLAC, stems, mastering, loudness normalization and cloud publishing are not part of
   this first gate. They are omitted, not shown as fake enabled controls.
6. Export renders the current in-memory project revision, including unsaved changes. It never
   silently falls back to the last file saved on disk.
7. Starting an export captures one immutable project/render-plan snapshot. Edits made afterward do
   not change that job or its filename/metadata; another export is required for the newer revision.
8. The job renders the authored song timeline, not upper brick-preview speaker state. Reference
   sources are always excluded. Persistent song gain, pan, mute, solo and `exportIncluded` state
   determine the effective mix.
9. Export is an offline application task. It does not run inside React, the real-time audio
   callback or the live `AudioWorklet` render callback.
10. Export never changes musical project data, dirty state or Undo history. Changing a persistent
    layer's `exportIncluded` property is a separate named project command before a job starts.

## Export workspace UX

### Navigation and state preservation

The rail action uses a clear tray/arrow audio-export symbol, the visible label or tooltip
`Экспорт`, a truthful selected state and an assistive-technology label. It must not be confused with
Save/Download project copy, which preserves editable `.tiempio` data rather than rendering audio.

Opening Export preserves the live `ProjectSession`. Returning to the source editor restores the
selected brick, its time/pitch viewport, song-dock state and musical-context inspector state. Export
navigation stops no audio merely by opening the page and creates no project command.

With no open project, the destination remains understandable: it shows `Нет песни для экспорта`
and actions to create, open or start from the example. With a project but no arranged audible song
instances, the primary action is disabled with the explicit reason `Сначала добавьте кирпичик в
песню`; brick preview alone is not exportable as a song.

### Workspace layout

The initial Export page contains only decisions the first renderer can honour:

- project title and `Текущая версия`/captured revision status;
- estimated arranged duration and output size;
- `Что экспортируем: Вся песня`;
- included source list with name, role and effective included/muted/solo/reference reason;
- `Формат: WAV`;
- `Разрядность: 24-bit` default or `16-bit`;
- `Частота: 48 kHz` default or `44.1 kHz`;
- bounded release-tail explanation;
- filename field initialized from a sanitized project title;
- one unmistakable primary action: `Экспортировать WAV`.

The page does not expose mastering language such as `commercial loudness`, `streaming ready` or
`make louder`. The first export preserves the engine mix with no hidden normalization or limiter.
If the project can clip, preflight names the affected peak risk and offers `Вернуться к миксу`;
the user may deliberately choose `Экспортировать как есть` through a secondary confirmation. The
engine applies no hidden gain or limiter; non-finite output remains a blocking error.

### Progress, completion and cancellation

An active job shows:

- `Подготовка`, `Рендер`, `Запись файла` and `Готово` stages;
- determinate progress from rendered frames whenever total frames are known;
- elapsed time and a bounded estimate only when reliable;
- the captured revision so later edits cannot be mistaken for part of the render;
- one `Отменить экспорт` action.

Cancel is cooperative between bounded blocks. It removes only the verified task-owned temporary
artifact/Blob, retains no partial success and leaves the project untouched. Completion offers
`Показать в папке` on Desktop when supported and `Скачать ещё раз` on Web while the bounded result
remains available. Starting a new job does not erase the previous completed file.

The UI remains responsive and announces stage, failure, cancellation and completion through a
polite live region. Progress is not conveyed only by animation or coral colour. Reduced motion
removes decorative progress motion without hiding numeric/state feedback.

## Musical range and mix contract

### Time range

The first delivery exports one finite range:

```text
start = song tick 0
authoredEnd = maximum finite end tick of included song instances
tail = maximum resolved release/effect tail required by included sources,
       clamped by a versioned safe ceiling
end = authoredEnd + tail
```

The tail is calculated from versioned resolved patch/render-graph data, not by waiting an
unbounded or target-dependent amount of time for floating-point silence. A source that ends early
can release naturally. An empty arrangement, unbounded/corrupt instance or exceeded duration/frame
ceiling fails before file selection or rendering.

Project loop playback state does not truncate export. Upper manual playheads, independent preview
cursors, count-in, record state and transient speaker masks are ignored. Song positions, local
instance trims/splits, loop-resize, arrangement gaps and source pauses are rendered exactly as the
lower song transport defines them.

### Inclusion and level

- Reference-role sources are excluded by project validation and again by render-plan validation.
- `exportIncluded = false` excludes a source even if it is audible in ordinary playback.
- Persistent song mute/solo is resolved once in the captured snapshot and shown in preflight.
- Transient upper preview speaker state never affects export.
- Persistent layer gain and pan apply exactly once.
- No export-only sound substitution, preset upgrade, mastering EQ, normalization or limiter is
  allowed.
- A stale render-plan acknowledgement cannot be exported under a newer captured revision.

The resulting audio must match ordinary song playback within documented offline/real-time numeric
tolerance after accounting for the selected sample rate and PCM quantization.

## Formats and encoding

### Initial WAV contract

- stereo interleaved little-endian RIFF/WAVE;
- PCM signed 24-bit or signed 16-bit;
- 48,000 or 44,100 frames per second;
- correct RIFF, `fmt ` and `data` sizes with bounded metadata;
- deterministic channel order and quantization;
- deterministic TPDF dither for 16-bit conversion if the frozen signal-analysis policy requires
  it; no dither is silently changed between targets or revisions;
- fail before render when the result exceeds classic WAV/RIFF or target output ceilings.

RF64, floating-point WAV, metadata artwork, compressed formats and stems require later explicit
plans. The encoder registry may reserve versioned capability IDs, but the UI cannot advertise
unsupported formats.

## Application and engine architecture

### Application authority

An application-owned `AudioExportCoordinator` owns at most one active job per application session:

```text
AudioExportJob
  jobId
  capturedProjectId / capturedProjectRevision
  capturedRenderPlanRevision / contentHash
  range and effective source inclusion
  format / sampleRate / bitDepth
  sanitizedSuggestedName
  state: preflight | awaiting-destination | rendering | finalizing | complete | failed | cancelled
  progressFrames / totalFrames
  targetResultHandle (opaque)
```

The coordinator validates and captures the project snapshot before opening a destination. It owns
job state, cancellation, stale-event rejection and user-facing diagnostics, but never owns project
content or PCM generation. Job state is transient and is not written into `.tiempio`, recovery or
Undo history.

All progress/result messages include `jobId`, captured revision and monotonically increasing
generation. Late completion from a cancelled/replaced job is ignored and its task-owned output is
cleaned up by the owning target runtime.

### Shared offline-render protocol

`ApplicationRuntime` gains a focused, capability-described `audioExport` group. Its neutral shared
contract includes:

- `capabilities()` for formats, rates, depths, maximum frames/bytes and destination behavior;
- `preflight(request)` returning duration, estimated bytes, warnings or typed blocking reasons;
- `chooseDestination()` through target-owned opaque handles;
- `start(job, renderPlanSnapshot, destinationHandle)`;
- bounded progress/result/error events;
- `cancel(jobId)` and `dispose()`.

The shared compiler creates an export render plan from the captured canonical revision. The Rust
offline renderer drives the same DSP graph in bounded blocks without a real-time backend. Export
does not borrow the currently active mutable live-engine plan and does not require live playback to
be initialized.

### Desktop target

- The renderer receives only an opaque export destination handle.
- Electron main owns the native Save dialog, resolved path, overwrite confirmation and reveal-file
  action.
- A task-scoped native offline renderer writes to an exact sibling temporary file and atomically
  replaces the approved destination only after successful header/data finalization and flush.
- Cancellation, engine crash, window close, timeout and application shutdown remove only the
  verified job-owned temporary file and process tree.
- Existing unrelated files are never deleted or truncated before the destination has been approved.

### Web target

- Offline WASM runs in a dedicated Worker or equivalent bounded non-UI execution context, not on
  the React thread and not in the live AudioWorklet callback.
- When a writable File System Access handle is available, PCM blocks stream to it under the
  browser's permission model.
- Otherwise the runtime produces a bounded Blob and triggers one user-visible Download. It never
  claims native atomic save or exposes a fake filesystem path.
- Preflight refuses jobs that exceed the measured browser memory/output cap and offers an
  actionable lower-size choice such as 16-bit or 44.1 kHz.
- No project/audio bytes are uploaded or sent to a server.

## Failure and concurrency policy

- Export cannot start during count-in or recording. The UI explains that recording must Stop first.
- Opening the Export page during playback is allowed. Starting a job safely stops Tiempio brick
  preview/song playback and releases its voices before offline rendering; external applications in
  Shared Audio continue normally. The project transport position is retained, and export never
  steals the system audio device silently.
- Editing after capture is allowed and marks the job `Экспортируется версия N; есть более новые
  изменения`. The file remains bound to N.
- Project replacement/close while a job is active asks whether to cancel; it never transfers the
  job to the next project.
- Save, recovery and export may observe the same immutable snapshot but cannot share mutable
  destination handles or cleanup ownership.
- Destination permission denial, disk full, read-only path, browser download denial, encoder error,
  cancellation, timeout and worker/native crash have distinct typed failures and retry actions.
- A finalization failure is not reported as a completed export.
- React Strict Mode/remount cannot duplicate the job or destination dialog.
- Application restart does not claim an interrupted job survived; task-owned temporary cleanup is
  audited at next safe startup where the target can prove ownership.

## Implementation order

**Integration branch:** `feature/audio-export`, created from the completed personal-audio
integration branch.

1. `feature/export-contracts-and-preflight` — shared job/capability schemas, revision capture,
   finite-range/tail calculation, size estimates and typed errors;
2. `feature/offline-wav-mixdown` — shared Rust offline graph, PCM24/PCM16 WAV sinks, cancellation,
   metrics and deterministic native/WASM fixtures;
3. `feature/desktop-audio-export` — opaque destination handles, native dialog, job-owned temporary
   output, atomic completion and exact cleanup;
4. `feature/web-audio-export` — Worker/WASM render, streamed handle or bounded Blob download and
   browser capability limits;
5. `feature/export-workspace-ui` — left-rail destination, preflight/options/layer list,
   progress/cancel/completion, responsive and accessibility states;
6. `feature/audio-export-integration` — example-song golden export, real package/browser evidence,
   lifecycle audit and documentation.

Each branch runs focused checks before sequential integration. Resource-intensive offline/native,
WASM, package and browser validation runs only through the single-lock fail-fast lifecycle owner
with per-stage timeout, heartbeat, signal propagation and exact task-owned process cleanup.

## Verification

### Automated

- deterministic short/long PCM16 and PCM24 WAV headers, lengths, hashes and decoded samples;
- 44.1/48 kHz duration, tempo-map, instance-loop, trim/split, arrangement-gap and tail fixtures;
- rights-controlled personal sample-instrument plus imported and microphone-recorded audio-phrase
  fixtures, including fixed-sample timing and explicit source pause;
- full-song example golden plan through native and Web/WASM offline renderers;
- numeric comparison between offline export and ordinary song playback for the same captured plan;
- reference exclusion, `exportIncluded`, mute/solo, gain/pan and transient-preview-mask tests;
- captured-revision/stale-event/edit-during-export tests;
- cancel at preflight, destination, first/middle/final block and finalization;
- size/RIFF ceiling, corrupt range, disk full, permission denial, Blob cap and worker/native crash;
- Desktop path/IPC security, atomic completion and exact temporary cleanup;
- Web main-thread/import boundary, no-network and truthful Download behavior;
- duplicate click, Strict Mode remount, project close/replace and application shutdown;
- filename sanitization across Windows-invalid names, Unicode, empty title and collisions;
- bundle, memory, render duration and UI long-task budgets.

### Human and visual

- Light/Dark Export rail selected/hover/focus/disabled states;
- standard, constrained-height, tablet, phone and 200% zoom workspaces;
- keyboard-only, screen-reader, touch and reduced-motion walkthrough;
- headphones/speakers A/B between song playback and exported example WAV;
- Desktop Save/overwrite/cancel/reveal and Web handle/Download fallback walkthrough;
- interruption audit proving no partial success, owned process, lock, temp file or stale Blob remains.

## Definition of done

- A persistent, understandable `Экспорт` destination exists in the application navigation rail and
  does not disturb the active project/editor state.
- A user can export the current unsaved arranged song to a valid stereo WAV at the selected initial
  quality on packaged Desktop and production Web.
- The job is pinned to one revision, finite range and effective source set; later edits cannot alter
  or be falsely attributed to it.
- Reference tracks and transient brick-preview speaker state never leak into export; song mix and
  inclusion rules are truthful before rendering.
- Imported/recorded portable audio assets render through the same sample/fixed-audio sources used by
  live song playback; export never substitutes an external path, unfinished take or silent fake.
- The same Rust DSP/render-plan authority produces native and Web output within frozen tolerance,
  with no UI-thread or real-time-callback rendering.
- Progress, cancel, typed failure, retry and completion are accessible and leave no partial output
  or task-owned resource behind.
- Unsupported compressed formats, stems and mastering are absent rather than represented by fake
  controls.
- Stage 15 maps every criterion above to executable tests or retained evidence.
