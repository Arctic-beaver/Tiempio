import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	offscreenSourceNotes,
	sourceCanvasTicks,
	sourceViewportWindowFromPixels,
	sourceViewportLimits,
	SourceViewportStore,
	tickAtSourcePointer
} from './source-viewport.js'

describe('source editor semantic viewport', () => {
	it('retains independent bounded semantic state per source layer', () => {
		const store = new SourceViewportStore()
		const bass = store.update(
			'layer.bass',
			{ pitchAnchor: 36 },
			{
				manualPlayheadTick: 3840,
				timeAnchorTick: 1920,
				pitchAnchor: 33,
				horizontalZoom: 1.5,
				verticalZoom: 1.25
			}
		)
		const lead = store.get('layer.lead', { pitchAnchor: 72 })
		assert.equal(store.get('layer.bass', { pitchAnchor: 60 }), bass)
		assert.equal(lead.pitchAnchor, 72)
		assert.equal(lead.manualPlayheadTick, 0)
		assert.notEqual(lead, bass)

		const bounded = store.update(
			'layer.bass',
			{ pitchAnchor: 36 },
			{
				manualPlayheadTick: Number.MAX_SAFE_INTEGER,
				pitchAnchor: -20,
				horizontalZoom: 100,
				verticalZoom: 0
			}
		)
		assert.equal(bounded.manualPlayheadTick, sourceViewportLimits.maximumSourceTick)
		assert.equal(bounded.pitchAnchor, 0)
		assert.equal(bounded.horizontalZoom, 4)
		assert.equal(bounded.verticalZoom, 0.65)
	})

	it('reports only canonical off-screen notes intersecting visible source time', () => {
		const notes = [
			{ id: 'above', pitchValue: 84, startTick: 480, durationTicks: 480 },
			{ id: 'below', pitchValue: 24, startTick: 960, durationTicks: 480 },
			{ id: 'later', pitchValue: 96, startTick: 8000, durationTicks: 480 },
			{ id: 'visible', pitchValue: 60, startTick: 0, durationTicks: 480 }
		]
		const result = offscreenSourceNotes(notes, {
			startTick: 0,
			endTick: 3840,
			highestPitch: 72,
			lowestPitch: 48
		})
		assert.deepEqual(
			result.above.map(({ id }) => id),
			['above']
		)
		assert.deepEqual(
			result.below.map(({ id }) => id),
			['below']
		)
	})

	it('derives independent musical time and pitch windows from transient pixels', () => {
		assert.deepEqual(
			sourceViewportWindowFromPixels({
				canvasTicks: 15_360,
				canvasWidth: 1536,
				clientHeight: 308,
				clientWidth: 442,
				keysWidth: 58,
				rowHeight: 26,
				rulerHeight: 48,
				scrollLeft: 442,
				scrollTop: 828
			}),
			{ startTick: 3840, endTick: 7680, highestPitch: 97, lowestPitch: 85 }
		)
	})

	it('grows source time in bounded chunks without mutating material', () => {
		assert.equal(
			sourceCanvasTicks(3840, { manualPlayheadTick: 0, timeAnchorTick: 0 }, 3840),
			61_440
		)
		assert.equal(
			sourceCanvasTicks(3840, { manualPlayheadTick: 120_000, timeAnchorTick: 90_000 }, 3840),
			184_320
		)
	})

	it('maps continuous playhead dragging to bounded unsnapped ticks', () => {
		assert.equal(tickAtSourcePointer(250, 0, 1000, 15_360), 3840)
		assert.equal(tickAtSourcePointer(-20, 0, 1000, 15_360), 0)
		assert.equal(tickAtSourcePointer(2000, 0, 1000, 15_360), 15_360)
	})
})
