import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	compactPerformanceCodes,
	fullPerformanceRows,
	performanceKeyLabel,
	performanceMapping,
	rotatePerformanceMapping,
	songPalette,
	tonicMidiAtOctave,
	type ScaleMode
} from './index.js'

describe('song palettes', () => {
	it('builds seven unique degrees containing the tonic for all 24 palettes', () => {
		for (const mode of ['major', 'minor'] satisfies readonly ScaleMode[]) {
			for (let tonic = 0; tonic < 12; tonic += 1) {
				const palette = songPalette({ tonic, mode })
				assert.equal(palette.noteNames.length, 7)
				assert.equal(new Set(palette.pitchClasses).size, 7)
				assert.equal(palette.pitchClasses[0], tonic)
				assert.equal(palette.chords.length, 3)
				assert.deepEqual(
					palette.chords.map(({ role }) => role),
					['home', 'lift', 'tension']
				)
			}
		}
	})

	it('uses key-aware sharp and flat spellings', () => {
		assert.deepEqual(songPalette({ tonic: 11, mode: 'major' }).noteNames, [
			'B',
			'C#',
			'D#',
			'E',
			'F#',
			'G#',
			'A#'
		])
		assert.deepEqual(songPalette({ tonic: 10, mode: 'minor' }).noteNames, [
			'Bb',
			'C',
			'Db',
			'Eb',
			'F',
			'Gb',
			'Ab'
		])
		assert.equal(songPalette({ tonic: 3, mode: 'minor' }).noteNames.includes('Cb'), true)
	})

	it('names deterministic beginner triads without losing their technical quality', () => {
		const aMinor = songPalette({ tonic: 9, mode: 'minor' })
		assert.deepEqual(
			aMinor.chords.map(({ name, noteNames }) => ({ name, noteNames })),
			[
				{ name: 'A minor', noteNames: ['A', 'C', 'E'] },
				{ name: 'D minor', noteNames: ['D', 'F', 'A'] },
				{ name: 'E minor', noteNames: ['E', 'G', 'B'] }
			]
		)
	})
})

describe('performance mappings', () => {
	it('maps exactly one compact occurrence of every scale degree at every rotation', () => {
		for (let rotation = 0; rotation < 7; rotation += 1) {
			const mapping = performanceMapping(
				{ tonic: 9, mode: 'minor' },
				{ layout: 'compact', rotation, tonicMidi: 57 }
			)
			assert.deepEqual(
				mapping.map(({ code }) => code),
				compactPerformanceCodes
			)
			assert.deepEqual(
				[...mapping.map(({ degreeIndex }) => degreeIndex)].sort(),
				[0, 1, 2, 3, 4, 5, 6]
			)
			assert.equal(mapping.filter(({ tonic }) => tonic).length, 1)
			assert.equal(
				mapping.findIndex(({ tonic }) => tonic),
				rotation
			)
			assert.equal(
				mapping.every((key, index) => index === 0 || key.midi > mapping[index - 1]!.midi),
				true
			)
		}
	})

	it('builds the explicit 26-key full surface in ascending rows and registers', () => {
		const mapping = performanceMapping(
			{ tonic: 11, mode: 'major' },
			{ layout: 'full', rotation: 0, tonicMidi: tonicMidiAtOctave(11, 3) }
		)
		assert.equal(mapping.length, 26)
		assert.deepEqual(
			mapping.filter(({ row }) => row === 'upper').map(({ code }) => code),
			fullPerformanceRows.upper
		)
		assert.deepEqual(
			mapping.filter(({ row }) => row === 'home').map(({ code }) => code),
			fullPerformanceRows.home
		)
		assert.deepEqual(
			mapping.filter(({ row }) => row === 'lower').map(({ code }) => code),
			fullPerformanceRows.lower
		)
		for (const row of ['upper', 'home', 'lower'] as const) {
			const pitches = mapping.filter((key) => key.row === row).map(({ midi }) => midi)
			assert.equal(
				pitches.every((pitch, index) => index === 0 || pitch > pitches[index - 1]!),
				true
			)
		}
		assert.equal(mapping.find(({ code, row }) => code === 'KeyQ' && row === 'upper')?.midi, 71)
		assert.equal(mapping.find(({ code, row }) => code === 'KeyA' && row === 'home')?.midi, 59)
		assert.equal(mapping.find(({ code, row }) => code === 'KeyZ' && row === 'lower')?.midi, 47)
	})

	it('rotates cyclically and rejects mappings that could leave MIDI bounds', () => {
		assert.equal(rotatePerformanceMapping(0, -1), 6)
		assert.equal(rotatePerformanceMapping(6, 1), 0)
		assert.equal(performanceKeyLabel('KeyJ'), 'J')
		assert.throws(
			() =>
				performanceMapping(
					{ tonic: 0, mode: 'major' },
					{ layout: 'compact', rotation: 1, tonicMidi: 0 }
				),
			RangeError
		)
		assert.throws(
			() =>
				performanceMapping(
					{ tonic: 11, mode: 'major' },
					{ layout: 'full', rotation: 0, tonicMidi: 119 }
				),
			RangeError
		)
	})
})
