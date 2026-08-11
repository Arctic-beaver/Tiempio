# Pre-Phase-6 product discovery

## Working agreement and gate

This is a living discussion log for product and UX ideas that the user requires before Phase 6.
Entries distinguish an initial idea from a recommended direction and an explicitly approved
decision. Recording an item here does not authorize implementation.

Phase 6 remains gated until every approved item in this document has an implementation plan, is
implemented and verified, and passes the applicable packaged manual acceptance.

Status vocabulary:

- `Discussing` - the product problem is retained but material choices remain open.
- `Recommended` - a concrete direction is recorded for user review, but is not yet approved.
- `Approved` - the user accepted the behavior and it may enter an implementation plan.
- `Deferred` - deliberately outside the pre-Phase-6 gate.
- `Rejected` - retained only to prevent the same unsuitable direction from returning unnoticed.

## D-001 - Scale-aware performance keyboard and song palette

Status: `Approved for implementation planning`. The song-wide ownership and UI direction below are
accepted pre-Phase-6 scope. Real-time recording into the Piano Roll remains a separate open product
decision and is not implied by this approval.

### Approved decisions

- One tonic plus scale/mode applies to the whole song for the first delivery.
- Pitched instruments inherit the song palette instead of choosing unrelated keys independently.
- Each instrument may still have its own useful octave and pitch range.
- Per-instrument keys, polytonality and section-level key changes/modulation are outside this first
  decision and must not appear accidentally in its UI.
- This approved item must be planned, implemented and accepted before Phase 6.

### Approved product intent

- Physical `A-L` keys must remain playable notes.
- The playable octave must move up and down through visible controls and scoped Up/Down arrows.
- A beginner should be able to choose a palette such as B major or A minor and receive a keyboard
  mapping whose notes belong to that scale, rather than memorizing compatible pitches.
- A discoverable expanded `A-Z` physical keyboard becomes a scale-aware performance surface.
- The interface should distinguish foundational notes from notes that form pleasant chords.
- Choosing a scale should play a concise preview through the currently chosen instrument so the
  label is understood as a playable configuration and musical character.

### Approved UI direction

Use one consistent `Song palette` control rather than separate theory controls scattered across
instruments.

#### Entry points and screen flow

1. In the first-sound flow, place `Choose the song palette` immediately after sound selection. This
   lets the preview use the instrument the user just chose and turns an abstract label into an
   audible choice.
2. Do not force theory knowledge or an empty decision. Preselect a safe default and provide one
   sentence: `This changes which notes your computer keyboard plays. You can change it later.`
3. In the normal project shell, show one quiet top-bar chip such as
   `B major · Open and luminous`. Every pitched layer sees the same chip because the palette belongs
   to the song.
4. Activating the chip opens one application-owned palette panel. Reuse the same panel in onboarding
   and later editing; do not invent a second settings representation.

#### Palette panel layout

Use a two-region composition on ordinary desktop widths and stack it on compact windows:

- left: a short, scrollable palette list with theory name plus plain-language character;
- right: selected palette name/description, `Hear palette`/`Stop`, octave controls, the physical
  keyboard map, a small harmonic legend and three chord suggestions;
- footer: one clear `Use B major` action and the truthful note
  `Existing notes stay where they are` when the project already contains notes.

Do not show the entire circle of fifths, notation staff, sharps/flats matrix or modal theory on this
first surface. A later `Learn why` disclosure may explain intervals without blocking selection.

#### Keyboard surface

The default first view should show the guaranteed home-row instrument
`A S D F G H J K L`, with the resulting pitch printed on every key. This is the smallest mapping a
beginner can understand immediately and preserves the already learned Tiempio gesture.

The wider A-Z keyboard uses an explicit `Full keyboard` expansion rather than silently adding
invisible keys. Its approved spatial model is:

- home row A-L: the central melodic range;
- upper letter row: the same song scale in a higher register;
- lower letter row: the same song scale in a lower register;
- all rows progress left-to-right through scale degrees and visually align repeated tonic notes.

This is more learnable than alphabetical pitch assignment because physical left-to-right position,
not the printed letter, represents ascending pitch. The surface must redraw local printed characters
when reliable layout labels are available, while events continue to use physical codes.

There is one unavoidable conflict: plain `Z` and `X` cannot simultaneously be playable notes and
unmodified Ableton-style octave commands. The approved default is:

- every displayed letter, including Z/X in `Full keyboard`, remains a note;
- visible Up/Down controls and physical Arrow Up/Down shift the entire keyboard octave;
- a possible future remappable `Ableton-style layout` may reserve Z/X for octave switching, but then
  the UI must visibly remove their note assignment. It is not required by this approved delivery.
  Never make one key secretly perform both actions.

#### Approved interactive screen keyboard

The displayed performance keys are real playable controls, not a decorative visualization. This is
required for mouse, pen and tablet use and for teaching the physical laptop mapping.

One shared scale-and-octave mapping owns every input source:

- physical laptop `KeyboardEvent.code` keydown/keyup;
- mouse or pen pointer down/release on a displayed key;
- independent touch pointers for multi-touch chords;
- future MIDI input, if added, through the same held-note presentation contract.

Every displayed key shows the combined held-input state. Pressing physical `KeyA`, clicking the A
key or touching its tablet key immediately depresses/highlights that same on-screen control. The
visual state remains active while any source still holds it. Releasing one source must not clear the
key if another finger or physical key is still holding the same mapped pitch.

The active treatment layers on top of the approved harmonic role instead of replacing it:

- a small physical depression/offset;
- brighter fill and bounded glow;
- a non-color active marker or edge change for forced-color/accessibility modes;
- no looping animation or large outline that obscures tonic/current-chord guidance.

The visual represents `input is held`, not proof that sound reached the output device. Audio
availability remains a separate truthful status. Visual feedback starts without waiting for an
engine round trip, while note-on/note-off uses the same source identity and pitch mapping.

Pointer/touch behavior must use press/release semantics rather than a delayed `click`:

- pointer down starts the note and captures that pointer;
- pointer up stops it;
- pointer cancel, lost capture, app blur, page visibility loss, palette/octave/instrument change and
  audio loss release the affected input-source-held notes safely;
- every touch pointer has an independent audition identity, enabling chords;
- mouse input accepts only the primary button;
- browser scrolling/zoom gestures are suppressed only inside the active keyboard region, not across
  the entire application.

The component is reused in three contexts rather than reimplemented:

1. the existing first-sound audition surface;
2. the `Song palette` panel, where the selected scale can be heard and explored;
3. a project `Play` surface/drawer for tablet performance after palette selection.

For tablets, the nine-key A-L core remains the immediately readable default. `Full keyboard` renders
three distinct physical rows instead of squeezing 26 controls into one line. Touch targets must be
at least 48 by 48 CSS pixels, with pitch/role more prominent than laptop letters on touch-first
layouts. Prefer landscape composition for the expanded keyboard, but keep the core playable in
portrait without horizontal clipping.

The first approved behavior is audition/performance input. Whether these same events are recorded
as timed Piano Roll notes remains the separate recording decision below; clickable controls must not
silently create project notes before Record mode is explicitly designed and armed.

`Discussing`: when a held finger slides into another key, either transfer that pointer from the old
note to the new one for glissando-like play, or require lift-and-retouch for each note. Both are
feasible, but the choice affects accidental notes, chord stability and tablet feel.

#### Harmonic guidance

Keep the keyboard itself calm. Use exactly three semantic states:

- `Home note`: the song tonic, strongest warm glow plus a home marker;
- `Current chord`: two or three additional notes with a softer related glow plus point markers;
- `Other palette note`: ordinary neutral playable key.

Below the keyboard, show at most three beginner-facing suggestions such as
`Home · B major · A + D + G`, `Lift · E major · F + H + K`, and
`Tension · F# major · G + J + L`. Selecting or auditioning a suggestion changes the current-chord
highlight; it does not insert or record notes. The technical chord name remains visible, but the
plain-language role leads.

Do not permanently color every scale degree differently. That would create decorative noise and
would still not truthfully explain which notes belong to the current chord.

#### Preview behavior

- Start only after deliberate palette selection or `Hear palette`; never on hover.
- Immediately stop the previous preview when another palette, instrument or project playback starts.
- Use the selected instrument and play tonic, one ascending octave and tonic resolution in roughly
  2.5-3.5 seconds.
- Change the control to `Stop` while previewing and show the current key lighting on the keyboard.
- Offer chord-suggestion audition separately from the scale preview.
- Keep preview outside project state, Undo/Redo and recording.

#### Changing an existing song

Opening the top-bar chip later uses the same panel. Applying another palette changes future
scale-aware input only. If existing pitched notes are present, show the persistent sentence
`Existing notes will not move`. Do not interrupt with a confirmation dialog for this non-destructive
operation. A future explicit transpose/refit command must be separate, previewable and undoable.

#### Compact and accessible behavior

- Stack palette list above the keyboard instead of shrinking key labels below readability.
- The key map may wrap into clearly separated rows but must not horizontally clip.
- Pair every glow with text/shape, preserve visible focus and announce tonic/chord roles.
- Stop and release all held notes when the panel closes, focus leaves the performance surface, the
  palette/octave changes or audio becomes unavailable.

### Musical model and ownership rationale

In most tonal music, pitched instruments share the same harmonic context at a given moment. Bass,
chords, melody and pads may use different subsets, chord tones, passing notes or intentional
chromatic notes, but giving every beginner-facing instrument an unrelated key would commonly create
clashes. Simultaneous independent keys are valid as deliberate polytonality, but that is an advanced
composition technique rather than a safe default.

The project model must continue to permit chromatic notes. The existing canonical model correctly
treats the key as advisory, which preserves imported material, passing tones, borrowed chords and
future advanced workflows. Beginner safety belongs in the performance/input mapping, not in a
validator that destroys or rejects out-of-scale project content.

Approved ownership split for the first delivery:

- song: tonic plus scale/mode;
- instrument/session: playable octave and pitch range;
- pitched layers: derive their scale-aware mapping from the song palette;
- drums/noise: do not expose irrelevant pitch-scale controls.

Future advanced options may include chromatic input or explicit modulation, but not a silent
per-instrument divergence from the song palette.

### Terminology and beginner presentation

The UI should not equate `scale`, `key`, `harmony` and `mood` as if they were identical:

- a scale is the available pitch collection;
- a key adds a tonal home and functional relationships;
- harmony is the sequence of chords/relationships used over time;
- mood also depends on tempo, rhythm, register, articulation and timbre.

Lead with the approved `Song palette` label, show an evocative description, and keep the exact
theory label visible but secondary, for example
`Open and luminous - B major`. The copy should promise a useful palette, not guarantee one universal
emotion. A short optional explanation can reveal `B is the home note; the keyboard now stays inside
this scale`.

Note names and enharmonic spelling must be localized carefully. The Russian presentation may say
`Си мажор` while retaining an optional compact international `B major` label where useful.

### Physical keyboard mapping

All note input must use physical `KeyboardEvent.code` values so the same key positions work under
English, Russian, Spanish and other layouts. Visible keycaps should explain physical positions and,
where the platform exposes a reliable layout map, may additionally show the user's local printed
character.

Approved core mapping:

- keep the home-row `A S D F G H J K L` as consecutive degrees of the chosen scale;
- continue into the next octave after the seventh degree, so the mapping always has a tonal center
  and never requires the user to know sharps or flats;
- use the upper letter row for a higher scale-aware register and the lower letter row for a lower
  register when `Full keyboard` is expanded;
- activate unmodified letter notes only while an explicit performance surface owns focus, so text
  fields, dialogs and global shortcuts remain usable;
- release every held audition note before changing octave, scale, instrument, focus or audio device.

Example home-row mapping:

- A minor: `A=A`, `S=B`, `D=C`, `F=D`, `G=E`, `H=F`, `J=G`, `K=A`, `L=B`;
- B major: `A=B`, `S=C#`, `D=D#`, `F=E`, `G=F#`, `H=G#`, `J=A#`, `K=B`, `L=C#`.

The full A-Z mapping requires an exact physical-key diagram before implementation. The product
choice is already approved: the rows are parallel lower, central and higher scale-aware registers,
not alphabetical pitch assignment or hidden chord triggers. The diagram must still prove every
physical code, repeated tonic alignment and remaining transport/recording shortcut space.

### Octave controls

Expose visible `octave down` and `octave up` buttons on the performance surface and support:

- Up/Down arrows as the keyboard controls while the performance surface owns focus;
- application shortcut settings for remapping the octave commands without taking Z/X away from the
  approved note surface by default.

Do not bind octave arrows globally. In the Piano Roll, arrows already move a selected note; the
active focus scope must make the meaning unambiguous. The UI should show the resulting register,
such as `Octave 3` or `A2-A4`, and announce changes accessibly.

### Scale and chord colors

Color describes a hierarchy rather than claiming that every same-colored combination is always
pleasant. The approved three-level language is:

1. tonic/home note: strongest project accent and a distinct non-color marker;
2. tones in the currently suggested chord: a lighter related glow plus a shared shape/marker;
3. other in-scale notes: neutral but clearly playable treatment.

If chromatic input is enabled later, out-of-scale notes remain visible with a subdued treatment
rather than disappearing. Color alone is insufficient: labels, point/halo shape, contrast and
screen-reader text must carry the same meaning in Light, Dark and forced-color modes.

Chord highlighting follows an explicit current chord or selected chord suggestion. Scale membership
alone cannot truthfully say which notes form the pleasant chord at every moment. The beginner-facing
chord suggestions use plain-language roles such as `Home`, `Lift`, `Tension` and `Reflective`, with
the technical chord name visible as secondary information.

### Scale preview

After a deliberate palette selection, preview it once through the currently selected instrument. Do
not autoplay repeatedly on hover or keyboard navigation.

The approved initial timing target is approximately 2.5-3.5 seconds:

- briefly establish the tonic or tonic chord;
- play one ascending octave at an even, readable pace;
- resolve to the tonic and stop;
- expose Replay and immediate Stop controls;
- selecting another palette cancels the previous preview before starting the new one.

The preview is audition state, not project content, history or recorded notes. It must not change the
playhead, dirty the project or overlap uncontrolled with project playback. If audio is unavailable,
the choice remains possible and the UI explains that preview will be available when output recovers.

A scale run communicates pitch color but not a complete mood. After testing, a very short tonic
chord or cadence may prove more informative than extending the run; duration and sequence require
user listening acceptance with several contrasting palettes and instruments.

### Placement in the creation flow

Do not block project creation with a theory exam. Give new projects a clearly stated default palette
and make the selector available during the first-sound flow and later in the project top bar.
Choosing the sound first allows palette previews to use the instrument the user cares about. The
control explains that the choice affects every pitched performance keyboard and can be changed
later.

Changing the song palette must define two separate actions:

- `Change keyboard palette`: remap future performance input while preserving existing notes;
- a future explicit `Transpose/fit existing music` operation: preview and transform existing notes
  as one undoable command.

Never silently move existing project notes when the palette changes.

### Failure modes and compatibility risks

- Held notes can stick when the palette or octave changes unless note-off is sent first.
- A-Z performance input can collide with text fields, settings capture, transport and editor
  shortcuts without strict focus scopes.
- Mapping consecutive scale degrees makes melodies safe but adjacent keys do not automatically form
  triads; chord guidance requires a separate truthful layer.
- Automatic scale preview can become repetitive, overlap playback or sound like a project edit.
- Different instruments have different useful registers; the same octave number must not force every
  preset into an unusable range.
- Changing a palette after notes exist can be mistaken for automatic transposition.
- Color-only harmonic guidance fails accessibility and can become visually noisy in dense editors.
- Imported or intentionally chromatic projects must remain valid even when beginner input is locked.
- Physical, mouse and multiple touch sources can hold the same pitch concurrently; source-counted
  held state must prevent early note-off and stale visual release.
- Pointer cancellation, window blur, device loss or remapping during a touch chord can leave stuck
  notes unless every source identity has a bounded release path.
- A single-row 26-key layout would create unusably small tablet targets; the expanded keyboard must
  preserve three rows and the 48-by-48 minimum.

### Separate open decision

1. Is the first delivery a live audition keyboard only, or must it also record a timed performance
   into the Piano Roll before Phase 6?
2. Does dragging a held finger across keys transfer the note continuously, or must every note start
   with a fresh touch?

### Acceptance outline

- identical physical mappings under English, Russian, Spanish and a non-Latin/IME layout;
- no stuck notes across octave, palette, instrument, focus and audio-device changes;
- octave buttons plus all approved shortcuts stay scoped and remappable;
- every generated beginner-mode pitch belongs to the selected scale across the supported range;
- mouse, pen, multi-touch and physical keys drive the same visible held state without early release;
- tablet controls meet the minimum touch target and play chords in portrait/core and
  landscape/expanded layouts;
- pointer cancel, lost capture, blur, remapping and audio loss leave no stuck sound or active key;
- scale preview is bounded, cancellable, non-overlapping and never mutates project/history;
- song palette remains truthful across save/reopen and does not silently transpose notes;
- tonic/chord/scale hierarchy works without color in Light, Dark and forced-color modes;
- packaged listening acceptance compares multiple major/minor or modal palettes across contrasting
  instruments before timing and copy are considered final.

## D-002 - Usable bars, beats and metronome

Status: `Discussing`. The need for an optional beginner-helpful metronome and immediately useful bar
structure is accepted. The concrete UI direction below is recommended for user approval.

### Product rationale

Bars are required, but not as decorative vertical lines. They provide the shared time structure for:

- a readable playhead position and musical location;
- metronome accents and future recording count-in;
- loops, repeat ranges and arrangement sections;
- snapping and keyboard movement by grid, beat or bar;
- copying and comparing phrases of predictable length;
- explaining where a musical idea begins, repeats and resolves.

Removing bars would make the interface initially cleaner but would force Tiempio to invent less
truthful replacements for every later timing operation. The beginner-friendly solution is progressive
visual hierarchy and useful interaction, not hiding musical time.

The UI must distinguish four concepts without expecting theory knowledge:

- tempo/BPM: how fast the pulse runs;
- beat: the pulse the user can count or tap;
- bar: a repeating group of beats, initially four;
- grid: the smaller editing subdivisions used for note placement.

Changing grid density must never change tempo, meter or the audible metronome.

### Recommended transport UI

Add one application-owned metronome toggle beside Play in the shared transport. It uses a metronome
icon, an accessible `Metronome on/off` label and a truthful pressed state. Avoid an unmodified letter
shortcut because A-Z belongs to performance input; the command remains remappable in Keyboard
Shortcuts.

Next to or inside the transport, show a compact visual beat indicator derived from the current meter:

- `4/4` displays four small points;
- the current point brightens on each beat;
- the first point has a stronger accent and a distinct shape/ring, not color alone;
- another meter changes the number and accent pattern instead of preserving four decorative dots;
- reduced-motion mode changes fill/contrast without a scaling or flashing pulse.

The indicator is not a second playhead and must remain visually quiet when transport is stopped. It
teaches the relationship between `4 beats in each bar`, the audible clicks and the ruler without a
modal tutorial.

### Recommended metronome behavior

- Off by default for ordinary playback; the user explicitly enables it.
- While enabled and transport is running, play one short stronger accent on the first beat and a
  softer click on the remaining beats.
- Schedule clicks from the native audio/transport clock with the same tempo and meter as the project;
  never use renderer timers for audible timing.
- Stop immediately and reset its visual phase when transport stops.
- Seek and loop changes recompute the actual project beat. Do not invent a first-beat accent merely
  because a loop restarted in the middle of a bar.
- Expose a restrained metronome popover only when needed, initially containing volume. Sound choice
  and accent customization can remain later scope unless listening tests show the default is tiring.
- If audio is unavailable, never imply that clicks are audible. Keep the toggle state as a user
  preference but show the existing unavailable-audio truth and resume only from a known transport
  boundary after output recovery.
- Metronome enable/disable and volume are presentation/preferences, not project-history entries.

Future Record mode should be able to request a one-bar count-in from this same engine-owned clock.
Count-in policy is not approved until recording itself is designed; do not add a decorative countdown
that cannot arm a real recording boundary.

### Recommended Piano Roll ruler and grid

Keep three clearly different line strengths:

1. bar boundary: most visible line with a numbered header such as `Bar 1`;
2. beat boundary: lighter line aligned with the metronome points;
3. editing subdivision: faint line visible enough for snapping but easy to ignore.

The ruler makes bars useful immediately:

- clicking a bar/beat position seeks the playhead to that musical time;
- the current bar number and beat are highlighted subtly during playback;
- loop length and movement values use plain labels such as `4 bars` and `1 beat`;
- hovering or focusing the quiet `4/4` control explains `4 beats in each bar`;
- the empty editor gives one dismissible first-use hint:
  `Bars group the pulse. Click a number to jump there.`

Do not permanently number every beat or label every subdivision. That would make the grid resemble an
exam. Show detail progressively through hover/focus, the moving playhead, the beat indicator and the
user's current editing resolution.

### Tablet behavior

- Metronome and Play targets meet the same minimum 48-by-48 CSS-pixel touch target as the performance
  keyboard.
- The compact beat indicator remains readable without consuming the width needed by tempo, palette
  and audio truth.
- Tapping the ruler seeks; dragging the playhead is a separate deliberate gesture. A future loop-range
  drag must not collide with either.
- Do not rely on hover to explain bars or meter; tap/focus exposes the same plain-language help.

### Accessibility and safety

- Audible clicks, point fill and first-beat shape carry the same beat information; color alone is
  insufficient.
- Screen readers announce only changes such as `Metronome on`, not every beat.
- Forced-color mode preserves first-beat and current-beat distinction.
- The metronome has bounded gain and a short click envelope to prevent clipping, clicks that ring over
  the instrument or dangerous peaks at high output volume.
- Multiple application surfaces consume one engine transport snapshot; no surface runs an independent
  visual metronome that can drift.

### Failure modes and compatibility risks

- Renderer-timed clicks drift from native audio and become unusable for recording.
- Loop, seek, tempo or meter changes can produce a duplicated/missing click without one authoritative
  scheduler reset.
- Treating a loop boundary as a bar boundary creates false accents.
- Permanently bright bar/beat/subdivision lines make notes harder to read.
- An unmodified metronome shortcut collides with the approved A-Z note surface.
- Resuming after device recovery can click at a stale beat unless it follows the restored transport
  plan and a known clock boundary.
- A visual beat pulse can violate reduced-motion needs or become distracting if implemented as a
  large repeating animation.

### Open decisions

1. Should the metronome remain off by default everywhere, or turn on automatically only when a future
   recording count-in is armed?
2. Is one default click sound and a volume control sufficient before Phase 6, or must users choose
   among a small set of less tiring sounds?
3. Should tapping the compact `4/4` control open meter choices immediately or first show the
   plain-language explanation?

### Acceptance outline after approval

- click audio stays sample-aligned with the engine transport across start, stop, seek, loop, tempo and
  meter changes;
- first-beat accents follow real project bars, not UI loop restarts;
- visual points and Piano Roll beat lines identify the same active beat without renderer drift;
- metronome state never claims audible output while audio is unavailable and resumes cleanly;
- bar, beat and grid line hierarchy remains readable in Light, Dark, forced-color, compact and tablet
  layouts;
- a first-time user can explain what the numbered bars do after using seek and metronome, without
  reading music theory documentation;
- existing note editing, A-Z performance input, transport, Undo/Redo and shared audio do not regress.
