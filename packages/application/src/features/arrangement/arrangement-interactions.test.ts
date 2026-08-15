import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	arrangementGestureResult,
	arrangementTickAtPoint,
	snapArrangementTick,
	splitOffsetForTick
} from './arrangement-interactions.js'

const instance = Object.freeze({
	id: 'instance.one',
	sourceLayerId: 'layer.one',
	startTick: 960,
	durationTicks: 1920,
	sourceOffsetTicks: 240
})

describe('linked arrangement interactions', () => {
	it('maps bounded pointer positions and optional grid snapping to song time', () => {
		assert.equal(arrangementTickAtPoint(150, 100, 200, 3840), 960)
		assert.equal(arrangementTickAtPoint(-10, 100, 200, 3840), 0)
		assert.equal(arrangementTickAtPoint(400, 100, 200, 3840), 3840)
		assert.equal(snapArrangementTick(721, 240), 720)
	})

	it('moves and loop-resizes without changing source identity or offset', () => {
		assert.deepEqual(arrangementGestureResult(instance, 'move', -480, 240), {
			startTick: 480,
			durationTicks: 1920,
			sourceOffsetTicks: 240
		})
		assert.deepEqual(arrangementGestureResult(instance, 'resize-right', 720, 240), {
			startTick: 960,
			durationTicks: 2640,
			sourceOffsetTicks: 240
		})
	})

	it('left-trims with continuous phase and keeps one positive grid step', () => {
		assert.deepEqual(arrangementGestureResult(instance, 'resize-left', 480, 240), {
			startTick: 1440,
			durationTicks: 1440,
			sourceOffsetTicks: 720
		})
		assert.deepEqual(arrangementGestureResult(instance, 'resize-left', 4000, 240), {
			startTick: 2640,
			durationTicks: 240,
			sourceOffsetTicks: 1920
		})
	})

	it('accepts only a snapped split strictly inside the selected instance', () => {
		assert.equal(splitOffsetForTick(instance, 1700, 240), 720)
		assert.equal(splitOffsetForTick(instance, 960, 240), null)
		assert.equal(splitOffsetForTick(instance, 3000, 240), null)
	})
})
