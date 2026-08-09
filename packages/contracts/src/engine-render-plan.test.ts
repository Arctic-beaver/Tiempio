import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { validateEngineWireRenderPlan } from './engine-render-plan.js'

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(resolve('fixtures/engine-protocol', name), 'utf8'))
}

describe('engine wire render-plan contracts', () => {
	it('accepts the shared deterministic Bass fixture', () => {
		const result = validateEngineWireRenderPlan(fixture('valid-bass-plan.json'))
		assert.equal(result.ok, true)
		if (result.ok) {
			assert.equal(result.value.projectRevision, 7)
			assert.equal(result.value.layers[0]?.events.length, 2)
		}
	})

	it('rejects a source that is reserved for a later engine phase', () => {
		const result = validateEngineWireRenderPlan(fixture('unsupported-drum-plan.json'))
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'engine.unsupported-source')
	})
})
