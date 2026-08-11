import assert from 'node:assert/strict'
import test from 'node:test'
import {
	calculateFloatingOverlayPlacement,
	floatingOverlayPathIsOwned
} from './floating-overlay.js'

const anchor = Object.freeze({
	top: 100,
	right: 260,
	bottom: 140,
	left: 100,
	width: 160,
	height: 40
})

test('places a complete panel below its anchor when space is available', () => {
	const placement = calculateFloatingOverlayPlacement({
		anchor,
		panel: { width: 240, height: 200 },
		viewport: { width: 800, height: 600 }
	})
	assert.deepEqual(placement, {
		height: 200,
		left: 100,
		maxHeight: 440,
		side: 'below',
		top: 148,
		width: 240
	})
})

test('flips above and aligns the end edge when more useful space exists there', () => {
	const placement = calculateFloatingOverlayPlacement({
		alignment: 'end',
		anchor: { ...anchor, top: 500, bottom: 540 },
		panel: { width: 240, height: 240 },
		viewport: { width: 800, height: 600 }
	})
	assert.equal(placement.side, 'above')
	assert.equal(placement.top, 252)
	assert.equal(placement.left, 20)
})

test('caps height and shifts horizontally inside the safe viewport inset', () => {
	const placement = calculateFloatingOverlayPlacement({
		anchor: { ...anchor, top: 80, right: 390, bottom: 120, left: 330 },
		minimumWidth: 300,
		panel: { width: 420, height: 800 },
		viewport: { width: 400, height: 300 }
	})
	assert.deepEqual(placement, {
		height: 160,
		left: 12,
		maxHeight: 160,
		side: 'below',
		top: 128,
		width: 376
	})
})

test('keeps an overlay at least as wide as its anchor subject to viewport bounds', () => {
	const placement = calculateFloatingOverlayPlacement({
		anchor: { ...anchor, width: 900, right: 900 },
		panel: { width: 100, height: 40 },
		viewport: { width: 500, height: 300 }
	})
	assert.equal(placement.width, 476)
	assert.equal(placement.left, 12)
})

test('stays inside an offset visual viewport after zoom or an on-screen keyboard shift', () => {
	const placement = calculateFloatingOverlayPlacement({
		anchor: { ...anchor, top: 250, bottom: 290 },
		panel: { width: 200, height: 100 },
		viewport: { left: 50, top: 180, width: 400, height: 260 }
	})
	assert.equal(placement.left, 100)
	assert.equal(placement.top, 298)
	assert.equal(placement.maxHeight, 130)
})

test('treats trigger and portalled panel identities as one event path', () => {
	const trigger = new EventTarget()
	const panel = new EventTarget()
	const outside = new EventTarget()
	assert.equal(floatingOverlayPathIsOwned([outside, panel], [trigger, panel]), true)
	assert.equal(floatingOverlayPathIsOwned([outside], [trigger, panel]), false)
})
