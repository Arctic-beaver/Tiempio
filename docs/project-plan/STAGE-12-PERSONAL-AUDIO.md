# Stage 12 — personal audio, `Мой звук` and microphone recording

## Status and placement

**Status:** approved planning baseline; implementation has not started.

This phase begins after Stage 10 linked-brick architecture and Stage 11 starter content. It must
finish before Stage 13 audio export and Stage 15 acceptance:

```text
Stage 10 -> Stage 11 -> Stage 12 personal audio -> Stage 13 export -> Stage 14 responsive -> Stage 15 acceptance
```

The UI already presents `Мой звук · Перетащить аудиофайл` in the first-layer and contextual
brick-creation flow, but no runtime plan previously made that action real. An enabled primary action
cannot remain a prototype-only promise at skeleton acceptance. This gate also adds a separate
`Запись` role for audio captured directly in Tiempio.

### Mandatory user design review before recorder implementation

The recording screen is **not design-approved yet**. Before any recorder UI/runtime implementation
branch starts, the team must discuss the flow with the product owner/user, record the decisions in
this document and the AS-TO-BE UX path, update the repository prototype/UI reference, and receive
explicit approval. An implementation based only on the provisional requirements below is blocked.

The review must decide at minimum:

- exact separate-screen composition and relationship to the persistent brick list/lower song;
- Record, pause, Stop, discard, retry and `Use recording` control hierarchy;
- whether the first version records a standalone phrase only or can record while brick preview or
  the lower song plays, and how the chosen start position/count-in is displayed;
- metronome/count-in defaults and whether pre-roll is retained or excluded;
- input-device choice, level meter, clipping warning and permission recovery;
- direct monitoring policy, headphone warning and feedback prevention;
- waveform growth, elapsed time, maximum duration, scrolling/zoom and mobile/tablet layout;
- what Stop means for the transient take and when one grouped project Undo entry is created;
- keyboard/touch shortcuts, accidental-record prevention, focus and screen-reader announcements.

Architecture work may prepare the shared portable-audio asset seam, but no product decision above
may be silently chosen by an engineer in order to start the recorder.

This phase is deliberately different from Stage 16 interchange import:

- `Мой звук` accepts one local audio file inside the ordinary create-brick flow and asks whether it
  is a **sound used as an instrument** or a **recorded audio phrase**;
- `Запись` captures a new voice, acoustic instrument or other input as an **audio phrase** through a
  dedicated recorder screen;
- `Импорт` converts MIDI, aligned stems or material from another DAW into multiple sources and song
  instances.

The two flows reuse one validated portable-audio-asset foundation, but they do not share navigation,
copy or commit semantics.

## Product outcome

A user can choose `Мой звук`, select or drop one supported local audio file and explicitly choose:

- `Инструмент из звука` — map one sound across the keyboard so its notes can be drawn and recorded;
- `Аудиофраза` — preserve a hummed melody, vocal take, played phrase or field recording as one
  continuous waveform with its original timing.

After trim and audition, `Use sound` creates the matching normal source brick. Both variants can be
arranged, saved, reopened and exported on Desktop and Web, but only the sample instrument is driven
by MIDI notes. Tiempio never claims that an audio phrase has become editable notes.

The project contains the validated audio asset. It does not depend on the original absolute path,
browser file handle or continued presence of the source file.

Alternatively, a user can select `Запись`, grant an explicit microphone/audio-input permission,
record a new take and create the same `AudioPhraseSource` without first producing an external file.
Imported and recorded phrases share editing, arrangement, persistence and export behavior; only
acquisition and its permissions differ.

## Scope boundary

### Initial supported input

The first production boundary is intentionally narrow and truthful:

- one user-selected local RIFF/WAVE file per creation draft;
- mono or stereo;
- uncompressed 16-, 24- or 32-bit integer PCM, plus reviewed 32-bit float only when every decoded
  sample is finite;
- 44.1 or 48 kHz;
- separate measured Stage 12 ceilings for encoded bytes, decoded frames and duration: a short
  sample-instrument limit and a larger, bounded audio-phrase limit supported by segmented/streaming
  target evidence rather than loading an arbitrary recording into callback memory;
- normalized display name and bounded metadata; unknown chunks are skipped only when RIFF bounds
  prove that doing so is safe.

MP3, AAC/M4A, FLAC, AIFF, video, archives, URLs, cloud libraries, multisamples, automatic slicing,
arbitrary long recordings and time stretching are not silently accepted. Additional codecs require
a separate decoder, licensing, security, parity and resource-budget decision. The picker and drop
target name the currently supported format before selection.

### Required semantic split

The file type does not reveal the user's intent. A five-second recording may be a single sustained
sound, a vocal melody or a rhythmic phrase. Duration or pitch analysis may recommend an option but
cannot choose silently. The ready draft therefore asks `Как использовать запись?`:

- `Инструмент из звука` — one source sound is transposed and triggered by notes;
- `Аудиофраза` — the complete performance remains fixed audio;
- `Импорт дорожек` — a link to the later top-level interchange workspace when Stage 16 exists, not
  an enabled Stage 12 batch promise.

Changing this choice before `Use sound` changes only the draft and preview. Converting an already
committed brick between sample instrument and audio phrase is a later explicit conversion command,
not an implicit editor toggle.

`Запись` is a separate role, not a third answer to `Как использовать запись?`: the user chooses it
before any file picker because the application needs an explicit, contextual permission gesture and
a dedicated capture screen. After capture, the take enters the same audio-phrase trim/preview draft.

### Instrument-from-sound behavior

The imported file becomes a `SampleInstrumentSource`, not a fixed song stem:

- `Root note` defines the pitch at which the sample plays without transposition; the default is C4
  and any future pitch detector may only offer a dismissible suggestion;
- `One shot` keeps playing the selected sample after note-off and suits hits/percussion;
- `While held` releases when the key, touch or recorded note ends and suits pitched material;
- pitch follows the ordinary note grid around the root through one reviewed resampler;
- a bounded attack/release envelope prevents clicks without altering the stored source bytes;
- no hidden normalization, denoising, tempo detection or destructive processing changes the sound.

The first version may cap the transposition range if objective alias/quality evidence cannot approve
the full MIDI range. Out-of-quality-range keys are visibly unavailable rather than producing
misleading or unpleasant output.

Stage 16 stem import later creates batches of the same fixed-audio source class with shared
alignment metadata. It reuses the accepted phrase scheduler, audio asset, WAV validation, decode and
archive foundations but does not pretend a stem is a keyboard instrument or a personal one-file
phrase flow.

### Recorded-audio-phrase behavior

`Аудиофраза` creates a finite `AudioPhraseSource` and `AudioBrickMaterial`:

- the original relative timing, overlaps, breaths and silence inside the selected trim are retained;
- the upper editor is a waveform timeline, not a piano roll or fake note transcription;
- trim start/end and non-destructive gain are editable; the selected region defines source material;
- the brick may carry an explicit silent tail for a pause between repeats, using the same source-pause
  concept as synth/drum bricks;
- an arrangement instance starts at its authored song tick, then plays fixed sample time; resizing
  the right edge repeats the selected audio region gaplessly plus any explicit source pause;
- changing project tempo moves tick-anchored instance starts but does not time-stretch, pitch-shift or
  rewrite the recorded phrase; the UI labels it `фиксированное аудио`;
- the source preview cursor follows its own frame position and remains still while that brick's
  preview speaker is disabled.

Automatic melody-to-MIDI transcription, pitch correction, beat detection, tempo warping, slicing,
noise removal and vocal isolation are outside this gate. A future transcription must create a
separate reviewable derived brick and preserve the original audio; it may never silently replace it.

## AS-TO-BE user flow

### Entry and context preservation

`Мой звук` remains a role in the approved first-layer screen and the inline `Добавить кирпичик`
card. `Запись` appears beside it as another clear role. Neither opens the future top-level `Импорт`
workspace.

- In an empty project, selecting it replaces only the central first-step prompt with the personal-
  sound draft.
- In a non-empty project, the inline draft row remains among the existing brick rows. Existing
  bricks, their editors and the lower song remain reachable.
- Leaving the draft for an existing brick suspends it; `Continue` restores the same file analysis,
  trim and settings.
- `Cancel` releases preview voices and transient handles and returns to the previous context without
  a project revision, dirty state, recovery snapshot or Undo entry.

### Selection and analysis

The draft offers one clear drop target plus `Выбрать WAV`. Drop and picker use the same handler.
After selection, the UI shows explicit states:

1. `Проверяем файл` — bounded header/chunk validation and metadata inspection;
2. `Готовим звук` — off-UI-thread decode/resample and waveform-peak generation;
3. `Как использовать запись?` — explicit sample-instrument/audio-phrase choice;
4. `Настрой свой звук` or `Настрой аудиофразу` — matching preview and controls;
5. typed failure with `Выбрать другой файл` and no partial project mutation.

The UI shows file name, duration, channel mode, sample rate and any supported conversion. It never
shows a raw native path. Analysis does not create a canonical asset.

### Personal-audio editor

The sound-chooser center becomes a compact waveform editor using the same serious visual language:

- draggable start/end trim handles with numerical duration;
- whole-file overview and zoom for precise trim;
- for an instrument: `Root note`, `One shot / While held`, non-destructive gain and short
  attack/release controls;
- for an audio phrase: waveform Play/Stop, fixed-duration ruler and explicit source-tail pause;
- for an instrument, computer keyboard and screen keyboard audition through the same note-input
  router as built-ins; phrase audition uses its own unambiguous Play control;
- visible current voice/note feedback and a dedicated `Stop preview` action;
- `Reset` restores draft settings, not the project;
- a primary `Use sound` action remains clearly separate from audition.

For instrument intent, fine-tuning, picker, trim and waveform focus must not disable A–J keyboard
audition. Text inputs and real application shortcuts remain protected by the focus-safe audition
classifier. Audio-phrase shortcuts are named separately and cannot collide with note keys.

### Provisional recorder screen contract — requires approval

Activating `Запись` opens a dedicated central recorder screen while the real brick list remains
visible/reachable and the lower song follows the approved disclosure rules. This is a provisional
functional contract, not final visual design.

- No microphone permission is requested on hover, app launch or role-card focus. A named
  `Разрешить микрофон`/`Выбрать вход` gesture starts target permission and capability negotiation.
- The screen shows the truthful selected/default input, a live level meter, clipping state, elapsed
  time, current take state and an unmistakable red Record control visually distinct from Play.
- Monitoring is off by default to avoid speaker feedback. Enabling it, if approved and supported,
  is explicit and warns to use headphones; unavailable low-latency monitoring is not faked.
- Recording begins on the engine/capture clock at the approved boundary, not at the first detected
  sound. Initial silence, breaths and pauses are retained unless the user trims them later.
- The waveform grows from received frames. Capture continues linearly and never wraps or overwrites
  earlier frames at a brick boundary.
- Stop closes the active capture stream/take boundary but does not pretend to save the project. The
  captured take becomes a transient review draft with Play, trim, retry/discard and `Use recording`.
- Retry cannot destroy the previous take without an explicit choice; the exact multi-take UI and
  retention limit are decided in the mandatory design review.
- `Use recording` performs the one grouped commit that creates an `AudioPhraseSource`; Cancel or
  discard before that commit leaves no project revision or Undo entry.

If recording against existing brick preview or the lower song is approved for the first version,
the implementation must capture engine-clock start, input-clock frames and calibrated capture
latency in one mapping. The raw take remains continuous audio; compensation adjusts its declared
origin, never destructively cuts content. If this cannot be proven on both targets, the UI must
offer standalone recording first rather than claim sample-accurate in-context capture.

### Commit and Undo

`Use sound` is enabled only after successful analysis, decoded-buffer readiness and runtime
capability confirmation. One grouped project command then:

1. writes or references one content-addressed portable audio asset;
2. creates either one `SampleInstrumentSource` with empty MIDI material or one `AudioPhraseSource`
   with finite audio material;
3. selects the new brick and opens its normal note or waveform editor according to the chosen type;
4. publishes the newest render plan.

The new sample-instrument brick contains no hidden notes or song instances. An audio phrase contains
the explicitly selected waveform region as its authored source material but still receives no
automatic song instance. One Undo removes the entire brick and its reference to the asset; Redo
restores it. Orphan bytes are retained only while required for Redo and are omitted/garbage-collected
by the reviewed save/asset policy, never from the audio callback.

## Project and engine architecture

### Canonical records

```text
AudioAsset
  assetId / contentHash / encodedByteLength
  channels / sourceSampleRate / sourceSampleFormat / sourceFrames
  canonicalSampleRate / canonicalFrames
  decoderVersion / resamplerVersion

SampleInstrumentSource
  assetId
  rootPitch
  trimStartFrame / trimEndFrame
  playbackMode: oneShot | whileHeld
  gain
  attackFrames / releaseFrames
  maxTransposeDown / maxTransposeUp

AudioPhraseSource
  assetId
  trimStartFrame / trimEndFrame
  gain
  attackFrames / releaseFrames
  timeBehavior: fixedSamples

AudioBrickMaterial
  materialFrames
  tailRestFrames
```

The sample-instrument layer keeps ordinary `MidiBrickMaterial`; its notes and recorded velocity drive
sample voices. The audio-phrase layer keeps `AudioBrickMaterial`; it has no invented notes. The asset
identity is content-derived, while filename and original path are presentation metadata only.
Derived waveform peaks are rebuildable cache data.

The `.tiempio` archive stores validated encoded bytes or one explicitly versioned canonical PCM
representation according to the measured archive/performance decision. It must never serialize an
external path as required content. The chosen representation, decoder and resampler versions are
part of deterministic compatibility evidence.

### Draft and coordinator authority

`PersonalSoundImportCoordinator` owns exactly one bounded transient draft:

```text
PersonalSoundDraft
  draftId / projectId / targetRevision
  opaqueInputHandle
  state: selecting | inspecting | decoding | ready | committing | failed
  validatedMetadata / derivedPeaks
  intent: sampleInstrument | audioPhrase
  trim / rootPitch? / playbackMode? / tailRestFrames? / gain / envelope
  decoderJobId / generation / warnings
```

It consumes focused `ApplicationRuntime.personalAudio` capabilities for activated selection,
bounded reads, decode/cancel/progress and portable-asset commit. Decoder workers and native jobs emit
neutral records and cannot dispatch project commands. Every callback is bound to draft ID and
generation so a stale decode cannot overwrite a newly selected file.

`AudioCaptureCoordinator` owns one permission/capture/review generation and emits the same validated
canonical audio-phrase draft without passing through a fake file import:

```text
AudioCaptureDraft
  draftId / projectId / targetRevision / generation
  state: permission | ready | countingIn | recording | reviewing | failed
  opaqueInputId / negotiatedChannels / sampleRate
  captureStartFrame / receivedFrames / droppedFrameDiagnostics
  temporaryAssetHandle / derivedPeaks / approvedOriginCompensation
```

Capture buffers are written in bounded segments outside React and outside the output callback.
Permission/session handles, live meters, count-in and unfinished take files are transient. Only
`Use recording` creates the portable `AudioAsset` and `AudioPhraseSource` command group.

### Desktop and Web ownership

- Desktop main owns the native picker, path, opaque input handle, bounded streaming read and exact
  task-owned temporary resources. It also owns native input enumeration/permission, capture-stream
  supervision and opaque temporary-take storage. The sandboxed renderer receives no path,
  unrestricted file API or raw device handle.
- Web uses an activated file input/drop `File` and a Worker for validation/decode. It cannot claim a
  persistent writable handle is required for import. Recording uses an explicit secure-context
  media permission and target-owned capture path; denial, revocation and track end are typed states.
- Both targets use the same WAV structural validator and canonical numeric conversion. Browser
  `decodeAudioData` cannot become an unversioned alternative that changes samples or accepted files.
- No selected bytes, names, hashes, peaks or PCM leave the device or enter analytics/logs.

### Real-time and offline playback

File I/O, hashing, decode, resample and peak creation complete outside the real-time callback.
Before a render plan can reference the source, the engine host registers an immutable bounded sample
buffer under a versioned asset handle. The callback then uses only preallocated voices and bounded
interpolation/envelope state: no allocation, locks, file access, decode or asset lookup by path.

Native and WASM execute the same sample interpolation, fixed-audio scheduling, channel mapping,
gain, envelope and voice-stealing rules. Preview, recorded-note playback, fixed audio phrases, song
instances and offline export all consume the same resolved source/asset contract. Missing or
unacknowledged assets fail the plan with a typed diagnostic; they never substitute silence while
claiming success.

## Security, rights and failure policy

- File selection is always initiated by the user; the application never scans folders.
- Audio-input capture is always initiated by a named user action; permission state and input labels
  are not uploaded, logged as identity or treated as permanent authorization.
- Validate RIFF/WAVE magic, chunk bounds, arithmetic, channel/rate/format, finite float samples,
  duration and decoded-memory cost before allocation and again before commit.
- A renamed non-WAV, truncated file, overlapping/out-of-bounds chunk, decompression code, non-finite
  float, excessive metadata or ceiling violation fails closed.
- Display names are normalized text, never paths or HTML.
- The draft includes concise confirmation that the user created the sound or has permission to use
  it; import does not grant rights to third-party samples.
- Cancel, replacement selection, project close, target reload, worker/native crash, timeout or
  commit conflict removes only proven draft-owned resources and leaves the current project intact.
- Input loss, permission denial/revocation, device removal, channel/rate change, suspended Web audio,
  overrun or disk/memory ceiling stops safely with a recoverable draft when valid captured frames
  exist and an explicit typed failure otherwise; it never claims a complete take after dropped audio.
- If the target project revision changed while analysis ran, final commit is revalidated; it either
  safely rebases the independent new-brick command or asks the user to retry. It never overwrites
  newer work.

## Implementation order

**Integration branch:** `feature/personal-sound-import`, created from the completed starter-content
integration branch.

0. **Product/design gate:** discuss and approve recorder flow with the user; update AS-TO-BE docs,
   prototype reference, shortcuts, responsive states and acceptance decisions before recorder code;
1. `feature/personal-audio-asset-domain` — current `AudioAsset`, sample-instrument/audio-phrase
   current schemas, archive portability, strict validation and grouped command/Undo contract;
2. `feature/bounded-wav-decoder` — shared RIFF validation, deterministic decode/resample/hash/peaks,
   hostile fixtures, ceilings and cancellation;
3. `feature/personal-audio-engine` — native/WASM immutable asset registration, preallocated sample
   voices, fixed-audio scheduling, audition, render-plan and offline parity;
4. `feature/personal-sound-creation-ui` — contextual drop/picker draft, explicit intent choice,
   waveform/trim/root/mode, focus-safe keyboard and accessible responsive states;
5. `feature/personal-audio-capture-runtime` — approved Desktop/Web input capability, bounded segmented
   capture, clock/latency diagnostics, permission lifecycle and temporary-take cleanup;
6. `feature/personal-audio-recorder-ui` — only the explicitly approved separate screen, take review,
   shortcuts and responsive/accessibility behavior;
7. `feature/personal-sound-target-integration` — import/capture durability,
   save/reopen/recovery and exact cleanup;
8. `feature/personal-sound-acceptance` — automated, audio, security, package/browser, touch, memory and
   rights evidence.

Stages remain sequential. Resource-intensive decode, Rust/WASM, package and browser validation runs
through the repository fail-fast lifecycle owner with one lock, bounded per-stage timeouts,
heartbeats, signal forwarding and exact task-owned process-tree cleanup.

## Verification strategy

Automated evidence includes:

- valid mono/stereo and 16/24/32-bit fixtures at 44.1/48 kHz;
- malformed RIFF/chunk arithmetic, renamed formats, non-finite float and limit tests;
- deterministic decoded samples, hashes and peaks across Desktop/Web;
- root-pitch/transposition, one-shot/held, fixed-audio timing, gapless audio-phrase repeat, source
  pause, trim, envelope, velocity and voice-stealing DSP tests;
- no callback allocation/I/O plus native/WASM real-time and offline-render parity;
- draft cancel/reselect/stale generation/project-revision conflict and one-command Undo/Redo;
- archive deduplication, save/reopen/recovery, missing/corrupt asset and non-current-format failures;
- imported-sample participation in keyboard/recording plus audio-phrase participation in fixed-time
  preview; both work in linked song instances and post-gate WAV export;
- microphone permission allow/deny/revoke, no-device/device-loss, input-rate/channel changes,
  clipping/overrun, long bounded take, Stop/retry/discard/commit and project-close cleanup;
- capture starts at the approved clock boundary rather than first sound, retains intended silence
  and, if in-context recording ships, proves documented latency/origin compensation;
- keyboard, touch/pen, screen reader, focus, light/dark, constrained-height, phone and 200% zoom;
- local-only network witness and exact cleanup after every completion/failure/cancel path.

Manual listening evidence covers at least pitched, vocal/noisy and percussive rights-controlled test
sounds at root and accepted transposition edges, level matched against the source. Acceptance rejects
audible clicks, channel inversion, unexplained loudness change, aliasing outside the approved profile
or Desktop/Web character drift.

## Definition of done

- The already visible `Мой звук` action is real in empty and non-empty projects by the end of Stage 12.
- `Запись` is a separate real add-brick role with its own explicitly user-approved recorder screen;
  its implementation cannot begin from this provisional text alone.
- Selecting, analysing, auditioning and cancelling a file never mutates the canonical project.
- The user explicitly chooses sample instrument or audio phrase; duration/pitch heuristics never
  choose on their behalf.
- `Use sound` creates the selected brick in one grouped operation; one Undo removes it.
- A sample instrument starts with empty note material and works with keyboard, note drawing and
  performance recording. An audio phrase preserves the chosen performance and never pretends to be
  editable MIDI.
- Both variants work in linked instances, save/reopen/recovery and offline song export.
- A microphone/input take produces the same canonical audio-phrase brick as imported phrase audio;
  it starts at capture time rather than first detected sound and is not committed until the approved
  `Use recording` action.
- A saved project is portable and does not require the original source path or browser handle.
- Desktop and Web accept the same supported WAV boundary and reproduce the same approved sound.
- Unsupported, hostile, oversized, cancelled or failed files leave no partial source, asset,
  temporary resource, process, Worker, lock or stale engine registration.
- Stage 16 reuses the accepted `AudioPhraseSource`, audio-asset and WAV foundations for batch-aligned
  stems instead of introducing a second incompatible decoder, fixed-audio scheduler or asset identity.
