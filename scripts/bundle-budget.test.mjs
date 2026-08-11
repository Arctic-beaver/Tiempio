import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyShellBundleBudgets, evaluateBundleClass } from './bundle-budget.mjs'

describe('empty-shell bundle budgets', () => {
	it('defines independent initial classes for both targets', () => {
		assert.deepEqual(emptyShellBundleBudgets, {
			'desktop-main': { root: 'dist/desktop/main', maxBytes: 229_376 },
			'desktop-preload': { root: 'dist/desktop/preload', maxBytes: 61_440 },
			'desktop-renderer': { root: 'dist/desktop/renderer', maxBytes: 622_592 },
			web: { root: 'dist/web', maxBytes: 585_728 }
		})
	})

	it('reports remaining attribution budget', () => {
		const result = evaluateBundleClass('desktop-main', [
			{ path: 'index.js', bytes: 1_024 },
			{ path: 'chunk.js', bytes: 2_048 }
		])
		assert.equal(result.passed, true)
		assert.equal(result.remainingBytes, result.maxBytes - 3_072)
	})

	it('fails a bundle class above its initial ceiling', () => {
		const result = evaluateBundleClass('web', [
			{ path: 'assets/web.js', bytes: emptyShellBundleBudgets.web.maxBytes + 1 }
		])
		assert.equal(result.passed, false)
	})
})
