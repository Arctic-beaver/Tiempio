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

	it('requires the complete bounded current synth expression contract', () => {
		const plan = fixture('valid-bass-plan.json') as {
			layers: Array<{ source: { patch: Record<string, unknown> } }>
		}
		const patch = plan.layers[0]!.source.patch
		delete patch.expression
		assert.equal(validateEngineWireRenderPlan(plan).ok, false)

		const invalidTracking = fixture('valid-bass-plan.json') as {
			layers: Array<{ source: { patch: { filter: Record<string, unknown> } } }>
		}
		invalidTracking.layers[0]!.source.patch.filter.keyTracking = 1.51
		assert.equal(validateEngineWireRenderPlan(invalidTracking).ok, false)
	})

	it('requires one complete bounded secondary oscillator contract', () => {
		const missing = fixture('valid-bass-plan.json') as {
			layers: Array<{ source: { patch: { oscillator: Record<string, unknown> } } }>
		}
		delete missing.layers[0]!.source.patch.oscillator.secondary
		assert.equal(validateEngineWireRenderPlan(missing).ok, false)

		for (const [field, value] of [
			['level', 1.01],
			['detuneCents', 101],
			['semitoneOffset', 25],
			['semitoneOffset', 0.5]
		] as const) {
			const invalid = fixture('valid-bass-plan.json') as {
				layers: Array<{
					source: { patch: { oscillator: { secondary: Record<string, unknown> } } }
				}>
			}
			invalid.layers[0]!.source.patch.oscillator.secondary[field] = value
			assert.equal(validateEngineWireRenderPlan(invalid).ok, false, field)
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
