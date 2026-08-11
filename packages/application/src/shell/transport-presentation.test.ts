import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transportPositionPercent } from './transport-presentation.js'

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
