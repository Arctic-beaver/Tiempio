import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	assetId,
	createCleanPulseDrumSource,
	createDeepBassInstrument,
	createLayer,
	createProject,
	createSynthInstrument,
	deepBassDefaultMacros,
	drumVoiceVariantCatalog,
	resolveDeepBassPatch,
	synthPresetCatalog,
	updateDeepBassMacro
} from './index.js'

describe('project model factories', () => {
	it('creates an owned, deeply frozen canonical project', () => {
		const project = createProject({ projectId: 'project.demo', title: 'Demo' })
		assert.equal(project.transport.ticksPerQuarter, 960)
		assert.equal(project.transport.tempoMap[0]?.bpm, 108)
		assert.deepEqual(project.transport.key, { tonic: 9, mode: 'minor' })
		assert.equal(Object.isFrozen(project), true)
		assert.equal(Object.isFrozen(project.transport.loop), true)
		assert.equal(Object.isFrozen(project.layers), true)
	})

	it('resolves the Deep Bass preset deterministically and persists the resolved patch', () => {
		const first = createDeepBassInstrument()
		const second = createDeepBassInstrument({ ...deepBassDefaultMacros })
		assert.deepEqual(first, second)
		assert.deepEqual(first.resolvedPatch, resolveDeepBassPatch(first.macros))

		const changed = updateDeepBassMacro(first, 'brightness', 0.9)
		assert.notDeepEqual(changed.resolvedPatch, first.resolvedPatch)
		assert.equal(first.macros.brightness, deepBassDefaultMacros.brightness)
		assert.equal(Object.isFrozen(first.resolvedPatch.filter), true)
	})

	it('resolves all 27 catalog characters into finite bounded patches', () => {
		assert.equal(synthPresetCatalog.length, 27)
		assert.equal(new Set(synthPresetCatalog.map((definition) => definition.id)).size, 27)
		assert.deepEqual(
			Object.fromEntries(
				['bass', 'lead', 'pad', 'pluck', 'texture'].map((family) => [
					family,
					synthPresetCatalog.filter((definition) => definition.family === family).length
				])
			),
			{ bass: 6, lead: 7, pad: 5, pluck: 4, texture: 5 }
		)
		for (const definition of synthPresetCatalog) {
			const instrument = createSynthInstrument(definition.id)
			assert.equal(instrument.family, definition.family)
			assert.equal(instrument.presetId, definition.id)
			assert.equal(
				JSON.stringify(instrument.resolvedPatch).includes('null'),
				false,
				definition.id
			)
			for (const value of Object.values(instrument.resolvedPatch.oscillator)) {
				if (typeof value === 'number')
					assert.equal(Number.isFinite(value), true, definition.id)
			}
		}
	})

	it('keeps extreme semantic values finite and bounded for every character', () => {
		for (const definition of synthPresetCatalog) {
			for (const value of [0, 1]) {
				const instrument = createSynthInstrument(definition.id, {
					brightness: value,
					hardness: value,
					dirt: value,
					length: value,
					width: value
				})
				assert.ok(instrument.resolvedPatch.filter.cutoffHz >= 40)
				assert.ok(instrument.resolvedPatch.filter.cutoffHz <= 18_000)
				assert.ok(instrument.resolvedPatch.outputGain >= 0.18)
				assert.ok(instrument.resolvedPatch.outputGain <= 0.9)
			}
		}
	})

	it('resolves one reviewed procedural patch for every drum voice variant', () => {
		assert.equal(drumVoiceVariantCatalog.length, 15)
		const source = createCleanPulseDrumSource()
		assert.deepEqual(Object.keys(source.resolvedPatch.voices), [
			'kick',
			'clap',
			'closedHat',
			'openHat',
			'perc'
		])
		assert.equal(source.resolvedPatch.voices.kick.variantId, 'kick.deep')
	})

	it('creates each pitched layer with a stable default performance mapping', () => {
		const layer = createLayer({ id: 'layer.performance', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		assert.deepEqual(layer.source.performance, {
			key: { tonic: 9, mode: 'minor' },
			octave: 2
		})
		assert.equal(Object.isFrozen(layer.source.performance.key), true)
	})

	it('excludes reference material from export by construction', () => {
		const reference = createLayer({
			id: 'layer.reference',
			name: 'Reference',
			role: 'reference',
			assetId: assetId('asset.reference')
		})
		assert.equal(reference.exportIncluded, false)
		assert.equal(reference.source.type, 'reference')
	})
})
