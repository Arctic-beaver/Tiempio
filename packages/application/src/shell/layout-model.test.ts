import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveShellLayout } from './layout-model.js'

test('compact shell moves both supporting panels into drawers', () => {
	assert.deepEqual(resolveShellLayout(719, 800), {
		widthMode: 'compact',
		heightMode: 'comfortable',
		layersPresentation: 'drawer',
		contextPresentation: 'drawer'
	})
})

test('standard and wide shell expose progressively more context', () => {
	assert.equal(resolveShellLayout(720, 800).layersPresentation, 'panel')
	assert.equal(resolveShellLayout(1199, 800).contextPresentation, 'drawer')
	assert.equal(resolveShellLayout(1200, 800).contextPresentation, 'panel')
})

test('constrained height is independent from width mode', () => {
	assert.equal(resolveShellLayout(1440, 559).heightMode, 'constrained')
	assert.equal(resolveShellLayout(480, 560).heightMode, 'comfortable')
})
