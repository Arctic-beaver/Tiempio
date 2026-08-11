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

	it('accepts the shared deterministic procedural drum fixture', () => {
		const result = validateEngineWireRenderPlan(fixture('unsupported-drum-plan.json'))
		assert.equal(result.ok, true)
		if (result.ok) {
			assert.equal(result.value.layers[0]?.source.type, 'procedural-drums')
			assert.equal(result.value.layers[0]?.events.length, 2)
		}
	})

	it('rejects unordered or unbounded project meter maps', () => {
		const plan = fixture('valid-bass-plan.json') as Record<string, unknown>
		assert.equal(
			validateEngineWireRenderPlan({
				...plan,
				meterMap: [{ tick: 0, numerator: 4, denominator: 3 }]
			}).ok,
			false
		)
		assert.equal(
			validateEngineWireRenderPlan({
				...plan,
				meterMap: [{ tick: 1, numerator: 4, denominator: 4 }]
			}).ok,
			false
		)
		assert.equal(
			validateEngineWireRenderPlan({
				...plan,
				endTick: 8_193 * 960
			}).ok,
			false
		)
	})
})
