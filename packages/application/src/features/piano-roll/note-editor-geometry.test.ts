import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	editNoteFromPointer,
	geometryForNote,
	noteAtGridPoint,
	resolveOverlappingHandleMode,
	type PianoGridMetrics
} from './note-editor-geometry.js'

const pitches = Array.from({ length: 25 }, (_, row) => 72 - row)
const metrics: PianoGridMetrics = {
	gridTicks: 240,
	height: 650,
	pitchValues: pitches,
	totalTicks: 15_360,
	width: 960
}

describe('piano-roll note geometry', () => {
	it('routes overlapping short-note hit zones to the nearest visual edge', () => {
		const rect = { left: 100, top: 50, width: 20, height: 24 }
		assert.equal(
			resolveOverlappingHandleMode('resize-strength-bottom', 120, 62, rect, 18),
			'resize-end'
		)
		assert.equal(
			resolveOverlappingHandleMode('resize-end', 110, 53, rect, 18),
			'resize-strength-top'
		)
	})
	it('projects canonical note timing and row without preview coordinates', () => {
		assert.deepEqual(
			geometryForNote(
				{
					id: 'note.one',
					pitch: 'C4',
					pitchValue: 60,
					row: 12,
					startTick: 3840,
					durationTicks: 960,
					velocity: 80
				},
				15_360
			),
			{ leftPercent: 25, widthPercent: 6.25, top: 317, height: 16 }
		)
	})

	it('creates exactly one snapped note at a bounded grid point', () => {
		assert.deepEqual(noteAtGridPoint(495, 351, 15, 13, metrics, 960), {
			startTick: 7680,
			durationTicks: 960,
			pitch: 59,
			velocity: 80
		})
	})

	it('moves and resizes against the canonical grid and pitch range', () => {
		const gesture = {
			mode: 'move' as const,
			note: { startTick: 960, durationTicks: 960, pitch: 60, velocity: 80 },
			originClientX: 100,
			originClientY: 100
		}
		assert.deepEqual(editNoteFromPointer(gesture, 160, 48, metrics), {
			startTick: 1920,
			durationTicks: 960,
			pitch: 62,
			velocity: 80
		})
		assert.deepEqual(
			editNoteFromPointer({ ...gesture, mode: 'resize-start' }, 145, 100, metrics),
			{ startTick: 1680, durationTicks: 240, pitch: 60, velocity: 80 }
		)
		assert.deepEqual(
			editNoteFromPointer({ ...gesture, mode: 'resize-end' }, 4000, 100, metrics),
			{ startTick: 960, durationTicks: 14_400, pitch: 60, velocity: 80 }
		)
	})

	it('maps velocity to symmetric bounded thickness and strength dragging', () => {
		const note = {
			startTick: 960,
			durationTicks: 960,
			pitch: 60,
			velocity: 80
		}
		const top = editNoteFromPointer(
			{
				mode: 'resize-strength-top',
				note,
				originClientX: 100,
				originClientY: 100
			},
			100,
			80,
			metrics
		)
		assert.equal(top.velocity, 127)
		assert.deepEqual(
			editNoteFromPointer(
				{
					mode: 'resize-strength-bottom',
					note,
					originClientX: 100,
					originClientY: 100
				},
				100,
				70,
				metrics
			),
			{ ...note, velocity: 1 }
		)
	})
})
