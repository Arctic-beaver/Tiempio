import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSemanticSliderAdjustmentCode, SemanticSliderGesture } from './semantic-slider-gesture.js'

describe('semantic slider gesture', () => {
	it('commits one dirty pointer gesture and deduplicates its blur fallback', () => {
		const gesture = new SemanticSliderGesture(40)
		assert.equal(gesture.begin('pointer', 40), null)
		assert.equal(gesture.preview(65), true)
		assert.equal(gesture.finish('pointer'), 65)
		assert.equal(gesture.finish(), null)
	})

	it('commits only supported keyboard adjustment sequences', () => {
		const gesture = new SemanticSliderGesture(40)
		assert.equal(isSemanticSliderAdjustmentCode('ArrowRight'), true)
		assert.equal(isSemanticSliderAdjustmentCode('KeyA'), false)
		gesture.begin('keyboard', 40)
		gesture.preview(41)
		assert.equal(gesture.finish('pointer'), null)
		assert.equal(gesture.finish('keyboard'), 41)
		assert.equal(gesture.finish('keyboard'), null)
	})

	it('restores the committed value on cancel without publishing a commit', () => {
		const gesture = new SemanticSliderGesture(25)
		gesture.begin('pointer', 25)
		gesture.preview(80)
		assert.equal(gesture.cancel(), 25)
		assert.equal(gesture.pending, false)
		assert.equal(gesture.finish(), null)
	})

	it('does not turn a no-op round trip into a project command', () => {
		const gesture = new SemanticSliderGesture(25)
		gesture.begin('keyboard', 25)
		gesture.preview(30)
		gesture.preview(25)
		assert.equal(gesture.finish('keyboard'), null)
	})
})
