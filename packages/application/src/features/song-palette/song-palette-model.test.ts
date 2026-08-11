import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { tonicMidiAtOctave } from '../../../../music-theory/src/index.js'
import {
	availableSongPalettes,
	chordPreviewProgram,
	palettePreviewProgram
} from './song-palette-model.js'

describe('song palette presentation model', () => {
	it('offers every supported tonic and mode exactly once', () => {
		assert.equal(availableSongPalettes.length, 24)
		assert.equal(
			new Set(availableSongPalettes.map(({ mode, tonic }) => `${String(tonic)}:${mode}`))
				.size,
			24
		)
	})

	it('builds one bounded resolved palette phrase in ascending scale order', () => {
		for (const palette of availableSongPalettes) {
			const tonicMidi = tonicMidiAtOctave(palette.tonic, 3)
			const events = palettePreviewProgram(palette, tonicMidi)
			assert.equal(events.length, 10)
			assert.ok(events.every((event) => event.offsetMs + event.durationMs <= 3_500))
			assert.deepEqual(
				events.slice(1, 8).map((event) => event.pitches[0]),
				[...events.slice(1, 8).map((event) => event.pitches[0])].sort(
					(left, right) => (left ?? 0) - (right ?? 0)
				)
			)
			assert.equal(events[8]?.pitches[0], tonicMidi + 12)
		}
	})

	it('keeps every suggested chord ordered and inside MIDI bounds', () => {
		for (const palette of availableSongPalettes) {
			const tonicMidi = tonicMidiAtOctave(palette.tonic, 3)
			for (const chord of palette.chords) {
				const pitches = chordPreviewProgram(palette, chord, tonicMidi)[0]?.pitches ?? []
				assert.equal(pitches.length, 3)
				assert.deepEqual(
					pitches,
					[...pitches].sort((left, right) => left - right)
				)
				assert.ok(pitches.every((pitch) => pitch >= 0 && pitch <= 127))
			}
		}
	})
})
