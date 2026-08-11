import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	transportBeatPresentation,
	transportPositionPercent,
	transportRulerMarkers
} from './transport-presentation.js'

describe('transport presentation', () => {
	it('projects the engine tick across the active loop', () => {
		assert.equal(transportPositionPercent(960, 0, 3840), 25)
		assert.equal(transportPositionPercent(2880, 960, 4800), 50)
	})

	it('clamps positions outside the loop', () => {
		assert.equal(transportPositionPercent(-1, 0, 3840), 0)
		assert.equal(transportPositionPercent(4800, 0, 3840), 100)
	})

	it('falls back to the beginning for invalid ranges', () => {
		assert.equal(transportPositionPercent(960, 960, 960), 0)
		assert.equal(transportPositionPercent(Number.NaN, 0, 3840), 0)
	})
})

describe('meter-aware transport presentation', () => {
	const meterMap = [
		{ tick: 0, numerator: 4, denominator: 4 },
		{ tick: 3840, numerator: 3, denominator: 8 }
	]

	it('derives bar and beat from the authoritative absolute tick', () => {
		assert.deepEqual(transportBeatPresentation(2880, meterMap, 960), {
			bar: 1,
			beat: 4,
			denominator: 4,
			numerator: 4,
			ticksPerBeat: 960
		})
		assert.deepEqual(transportBeatPresentation(4320, meterMap, 960), {
			bar: 2,
			beat: 2,
			denominator: 8,
			numerator: 3,
			ticksPerBeat: 480
		})
	})

	it('builds bounded absolute seek markers with a downbeat reset at meter changes', () => {
		const markers = transportRulerMarkers(0, 5280, meterMap, 960, 'beat')
		assert.deepEqual(
			markers.map(({ tick, bar, beat, downbeat }) => ({ tick, bar, beat, downbeat })),
			[
				{ tick: 0, bar: 1, beat: 1, downbeat: true },
				{ tick: 960, bar: 1, beat: 2, downbeat: false },
				{ tick: 1920, bar: 1, beat: 3, downbeat: false },
				{ tick: 2880, bar: 1, beat: 4, downbeat: false },
				{ tick: 3840, bar: 2, beat: 1, downbeat: true },
				{ tick: 4320, bar: 2, beat: 2, downbeat: false },
				{ tick: 4800, bar: 2, beat: 3, downbeat: false }
			]
		)
	})
})
