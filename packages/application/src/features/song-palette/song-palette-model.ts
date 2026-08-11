import type { EnginePreviewEvent } from '../../../../contracts/src/index.js'
import {
	songPalette,
	type BeginnerChordSuggestion,
	type SongPalette,
	type SongPaletteInput
} from '../../../../music-theory/src/index.js'

export const performanceOctaveMinimum = 1
export const performanceOctaveMaximum = 6

export const availableSongPalettes: readonly SongPalette[] = Object.freeze(
	(['major', 'minor'] as const).flatMap((mode) =>
		Array.from({ length: 12 }, (_, tonic) => songPalette({ mode, tonic }))
	)
)

function ascendingPitch(tonicMidi: number, tonicPitchClass: number, pitchClass: number): number {
	return tonicMidi + ((pitchClass - tonicPitchClass + 12) % 12)
}

function chordPitches(
	palette: SongPalette,
	chord: BeginnerChordSuggestion,
	tonicMidi: number
): readonly number[] {
	let previous = -1
	return Object.freeze(
		chord.pitchClasses.map((pitchClass) => {
			let pitch = ascendingPitch(tonicMidi, palette.tonic, pitchClass)
			while (pitch <= previous) pitch += 12
			previous = pitch
			return pitch
		})
	)
}

export function palettePreviewProgram(
	paletteInput: SongPaletteInput,
	tonicMidi: number
): readonly EnginePreviewEvent[] {
	const palette = songPalette(paletteInput)
	const scale = palette.pitchClasses.map((pitchClass) =>
		ascendingPitch(tonicMidi, palette.tonic, pitchClass)
	)
	const home = palette.chords[0]
	if (home === undefined) return Object.freeze([])
	const homePitches = chordPitches(palette, home, tonicMidi)
	return Object.freeze([
		Object.freeze({ offsetMs: 0, durationMs: 300, pitches: homePitches, velocity: 94 }),
		...scale.map((pitch, index) =>
			Object.freeze({
				offsetMs: 360 + index * 250,
				durationMs: 210,
				pitches: Object.freeze([pitch]),
				velocity: 100
			})
		),
		Object.freeze({
			offsetMs: 2_110,
			durationMs: 280,
			pitches: Object.freeze([tonicMidi + 12]),
			velocity: 104
		}),
		Object.freeze({ offsetMs: 2_460, durationMs: 500, pitches: homePitches, velocity: 96 })
	])
}

export function chordPreviewProgram(
	paletteInput: SongPaletteInput,
	chord: BeginnerChordSuggestion,
	tonicMidi: number
): readonly EnginePreviewEvent[] {
	const palette = songPalette(paletteInput)
	return Object.freeze([
		Object.freeze({
			offsetMs: 0,
			durationMs: 650,
			pitches: chordPitches(palette, chord, tonicMidi),
			velocity: 98
		})
	])
}
