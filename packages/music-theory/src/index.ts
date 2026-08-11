export const musicTheoryModelVersion = 1 as const

export type ScaleMode = 'major' | 'minor'
export type ChordRole = 'home' | 'lift' | 'tension'
export type PerformanceLayout = 'compact' | 'full'
export type PerformanceRow = 'compact' | 'upper' | 'home' | 'lower'

export interface SongPaletteInput {
	readonly mode: ScaleMode
	readonly tonic: number
}

export interface BeginnerChordSuggestion {
	readonly degreeIndices: readonly number[]
	readonly name: string
	readonly noteNames: readonly string[]
	readonly pitchClasses: readonly number[]
	readonly role: ChordRole
}

export interface SongPalette {
	readonly character: 'open' | 'reflective'
	readonly chords: readonly BeginnerChordSuggestion[]
	readonly mode: ScaleMode
	readonly name: string
	readonly noteNames: readonly string[]
	readonly pitchClasses: readonly number[]
	readonly tonic: number
	readonly tonicName: string
}

export interface PerformanceKeyMapping {
	readonly code: string
	readonly degreeIndex: number
	readonly label: string
	readonly midi: number
	readonly noteName: string
	readonly octave: number
	readonly row: PerformanceRow
	readonly tonic: boolean
}

export interface PerformanceMappingOptions {
	readonly layout: PerformanceLayout
	readonly rotation: number
	readonly tonicMidi: number
}

export const compactPerformanceCodes = Object.freeze([
	'KeyA',
	'KeyS',
	'KeyD',
	'KeyF',
	'KeyG',
	'KeyH',
	'KeyJ'
] as const)

export const fullPerformanceRows = Object.freeze({
	upper: Object.freeze([
		'KeyQ',
		'KeyW',
		'KeyE',
		'KeyR',
		'KeyT',
		'KeyY',
		'KeyU',
		'KeyI',
		'KeyO',
		'KeyP'
	]),
	home: Object.freeze(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL']),
	lower: Object.freeze(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'])
} as const)

const intervalsByMode = Object.freeze({
	major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
	minor: Object.freeze([0, 2, 3, 5, 7, 8, 10])
} as const)

const majorSpellings = Object.freeze([
	Object.freeze(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
	Object.freeze(['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']),
	Object.freeze(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']),
	Object.freeze(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']),
	Object.freeze(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']),
	Object.freeze(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']),
	Object.freeze(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']),
	Object.freeze(['G', 'A', 'B', 'C', 'D', 'E', 'F#']),
	Object.freeze(['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']),
	Object.freeze(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']),
	Object.freeze(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']),
	Object.freeze(['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'])
] as const)

const minorSpellings = Object.freeze([
	Object.freeze(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']),
	Object.freeze(['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B']),
	Object.freeze(['D', 'E', 'F', 'G', 'A', 'Bb', 'C']),
	Object.freeze(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']),
	Object.freeze(['E', 'F#', 'G', 'A', 'B', 'C', 'D']),
	Object.freeze(['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb']),
	Object.freeze(['F#', 'G#', 'A', 'B', 'C#', 'D', 'E']),
	Object.freeze(['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F']),
	Object.freeze(['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F#']),
	Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
	Object.freeze(['Bb', 'C', 'Db', 'Eb', 'F', 'Gb', 'Ab']),
	Object.freeze(['B', 'C#', 'D', 'E', 'F#', 'G', 'A'])
] as const)

const chordDefinitions = Object.freeze([
	Object.freeze({ role: 'home' as const, degree: 0 }),
	Object.freeze({ role: 'lift' as const, degree: 3 }),
	Object.freeze({ role: 'tension' as const, degree: 4 })
])

function assertPitchClass(tonic: number): void {
	if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11) {
		throw new RangeError('Tonic must be an integer pitch class from 0 through 11.')
	}
}

function assertRotation(rotation: number): void {
	if (!Number.isInteger(rotation) || rotation < 0 || rotation > 6) {
		throw new RangeError('Rotation must be an integer from 0 through 6.')
	}
}

function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor
}

function chordQuality(pitchClasses: readonly number[]): 'major' | 'minor' | 'diminished' {
	const root = pitchClasses[0] ?? 0
	const intervals = pitchClasses.map((pitch) => positiveModulo(pitch - root, 12))
	if (intervals[1] === 4 && intervals[2] === 7) return 'major'
	if (intervals[1] === 3 && intervals[2] === 7) return 'minor'
	return 'diminished'
}

function createChord(
	role: ChordRole,
	degree: number,
	pitchClasses: readonly number[],
	noteNames: readonly string[]
): BeginnerChordSuggestion {
	const degreeIndices = Object.freeze([degree, (degree + 2) % 7, (degree + 4) % 7])
	const chordPitchClasses = Object.freeze(degreeIndices.map((index) => pitchClasses[index] ?? 0))
	const chordNoteNames = Object.freeze(degreeIndices.map((index) => noteNames[index] ?? 'C'))
	const quality = chordQuality(chordPitchClasses)
	return Object.freeze({
		role,
		degreeIndices,
		pitchClasses: chordPitchClasses,
		noteNames: chordNoteNames,
		name: `${chordNoteNames[0]} ${quality}`
	})
}

export function songPalette(input: SongPaletteInput): SongPalette {
	assertPitchClass(input.tonic)
	const intervals = intervalsByMode[input.mode]
	const spellings = input.mode === 'major' ? majorSpellings : minorSpellings
	const noteNames = spellings[input.tonic]
	if (noteNames === undefined) throw new RangeError('Unsupported tonic pitch class.')
	const pitchClasses = Object.freeze(
		intervals.map((interval) => positiveModulo(input.tonic + interval, 12))
	)
	const tonicName = noteNames[0]
	return Object.freeze({
		tonic: input.tonic,
		mode: input.mode,
		tonicName,
		name: `${tonicName} ${input.mode}`,
		character: input.mode === 'major' ? 'open' : 'reflective',
		noteNames,
		pitchClasses,
		chords: Object.freeze(
			chordDefinitions.map(({ role, degree }) =>
				createChord(role, degree, pitchClasses, noteNames)
			)
		)
	})
}

export function tonicMidiAtOctave(tonic: number, octave: number): number {
	assertPitchClass(tonic)
	if (!Number.isInteger(octave) || octave < -1 || octave > 9) {
		throw new RangeError('Octave must be an integer from -1 through 9.')
	}
	const midi = (octave + 1) * 12 + tonic
	if (midi > 127) throw new RangeError('The requested tonic is outside the MIDI range.')
	return midi
}

export function rotatePerformanceMapping(rotation: number, direction: -1 | 1): number {
	assertRotation(rotation)
	return positiveModulo(rotation + direction, 7)
}

function physicalLabel(code: string): string {
	return code.startsWith('Key') ? code.slice(3) : code
}

function mapRow(
	palette: SongPalette,
	codes: readonly string[],
	row: PerformanceRow,
	baseTonicMidi: number,
	rotation: number
): readonly PerformanceKeyMapping[] {
	const intervals = intervalsByMode[palette.mode]
	return codes.map((code, index) => {
		const relativeDegree = index - rotation
		const degreeIndex = positiveModulo(relativeDegree, 7)
		const octaveOffset = Math.floor(relativeDegree / 7)
		const midi = baseTonicMidi + (intervals[degreeIndex] ?? 0) + octaveOffset * 12
		if (midi < 0 || midi > 127) {
			throw new RangeError('The performance mapping extends outside the MIDI range.')
		}
		const octave = Math.floor(midi / 12) - 1
		const noteName = palette.noteNames[degreeIndex] ?? palette.tonicName
		return Object.freeze({
			code,
			row,
			midi,
			octave,
			degreeIndex,
			noteName,
			label: `${noteName}${String(octave)}`,
			tonic: degreeIndex === 0
		})
	})
}

export function performanceMapping(
	paletteInput: SongPaletteInput,
	options: PerformanceMappingOptions
): readonly PerformanceKeyMapping[] {
	assertRotation(options.rotation)
	if (!Number.isInteger(options.tonicMidi) || options.tonicMidi < 0 || options.tonicMidi > 127) {
		throw new RangeError('Tonic MIDI pitch must be an integer from 0 through 127.')
	}
	const palette = songPalette(paletteInput)
	if (options.tonicMidi % 12 !== palette.tonic) {
		throw new RangeError('Tonic MIDI pitch must match the palette tonic.')
	}
	if (options.layout === 'compact') {
		return Object.freeze(
			mapRow(palette, compactPerformanceCodes, 'compact', options.tonicMidi, options.rotation)
		)
	}
	return Object.freeze([
		...mapRow(
			palette,
			fullPerformanceRows.upper,
			'upper',
			options.tonicMidi + 12,
			options.rotation
		),
		...mapRow(palette, fullPerformanceRows.home, 'home', options.tonicMidi, options.rotation),
		...mapRow(
			palette,
			fullPerformanceRows.lower,
			'lower',
			options.tonicMidi - 12,
			options.rotation
		)
	])
}

export function performanceKeyLabel(code: string): string {
	return physicalLabel(code)
}
