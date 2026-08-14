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
	resolveSynthPatch,
	synthPresetCatalog,
	updateDeepBassMacro,
	type SemanticSynthMacros,
	type SynthMacroId
} from './index.js'

const macroIds: readonly SynthMacroId[] = ['brightness', 'hardness', 'dirt', 'length', 'width']

function withMacro(
	macros: SemanticSynthMacros,
	macro: SynthMacroId,
	value: number
): SemanticSynthMacros {
	return { ...macros, [macro]: value }
}

function assertMonotonic(
	values: readonly number[],
	direction: 'up' | 'down',
	message: string
): void {
	for (let index = 1; index < values.length; index += 1) {
		const previous = values[index - 1]!
		const current = values[index]!
		assert.equal(direction === 'up' ? current >= previous : current <= previous, true, message)
	}
}

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

	it('resolves explicit family-specific key and velocity expression', () => {
		const bass = createSynthInstrument('bass.deep').resolvedPatch
		const lead = createSynthInstrument('lead.glass').resolvedPatch
		const pluck = createSynthInstrument('pluck.glass').resolvedPatch
		assert.notDeepEqual(bass.expression, lead.expression)
		assert.ok(pluck.filter.keyTracking > bass.filter.keyTracking)
		assert.ok(pluck.expression.filterOctaves > bass.expression.filterOctaves)
		assert.equal(Object.isFrozen(bass.expression), true)
	})

	it('owns one frozen effective macro profile per preset', () => {
		for (const definition of synthPresetCatalog) {
			assert.equal(Object.isFrozen(definition.mapping), true, definition.id)
			assert.equal(
				resolveSynthPatch(definition.id, definition.defaultMacros).oscillator.secondary
					.level,
				definition.seed.secondaryLevel,
				definition.id
			)
		}
		assert.notDeepEqual(
			synthPresetCatalog.find(({ id }) => id === 'bass.deep')?.mapping,
			synthPresetCatalog.find(({ id }) => id === 'pad.soft')?.mapping
		)
	})

	it('keeps every semantic macro direction truthful across every preset', () => {
		const steps = Array.from({ length: 11 }, (_, index) => index / 10)
		for (const definition of synthPresetCatalog) {
			const patches = Object.fromEntries(
				macroIds.map((macro) => [
					macro,
					steps.map((value) =>
						resolveSynthPatch(
							definition.id,
							withMacro(definition.defaultMacros, macro, value)
						)
					)
				])
			) as Record<SynthMacroId, ReturnType<typeof resolveSynthPatch>[]>
			assertMonotonic(
				patches.brightness.map(({ filter }) => filter.cutoffHz),
				'up',
				`${definition.id} brightness cutoff`
			)
			assertMonotonic(
				patches.hardness.map(({ amplifier }) => amplifier.attackMs),
				'down',
				`${definition.id} hardness attack`
			)
			assertMonotonic(
				patches.dirt.map(({ drive }) => drive),
				'up',
				`${definition.id} dirt drive`
			)
			assertMonotonic(
				patches.length.map(({ amplifier }) => amplifier.releaseMs),
				'up',
				`${definition.id} length release`
			)
			assertMonotonic(
				patches.width.map(({ stereoWidth }) => stereoWidth),
				'up',
				`${definition.id} width stereo`
			)
		}
	})

	it('keeps continuous macro sweeps bounded without abrupt parameter jumps', () => {
		const steps = Array.from({ length: 101 }, (_, index) => index / 100)
		for (const definition of synthPresetCatalog) {
			for (const macro of macroIds) {
				const patches = steps.map((value) =>
					resolveSynthPatch(
						definition.id,
						withMacro(definition.defaultMacros, macro, value)
					)
				)
				for (let index = 1; index < patches.length; index += 1) {
					const previous = patches[index - 1]!
					const current = patches[index]!
					assert.ok(
						Math.max(current.filter.cutoffHz, previous.filter.cutoffHz) /
							Math.max(
								40,
								Math.min(current.filter.cutoffHz, previous.filter.cutoffHz)
							) <
							1.12,
						`${definition.id} ${macro} cutoff continuity`
					)
					assert.ok(
						Math.abs(20 * Math.log10(current.outputGain / previous.outputGain)) < 0.3,
						`${definition.id} ${macro} gain continuity`
					)
					assert.ok(
						Math.abs(
							current.oscillator.secondary.level - previous.oscillator.secondary.level
						) < 0.03,
						`${definition.id} ${macro} secondary continuity`
					)
				}
			}
		}
	})

	it('keeps extreme semantic values finite and bounded for every character', () => {
		for (const definition of synthPresetCatalog) {
			for (let corner = 0; corner < 32; corner += 1) {
				const instrument = createSynthInstrument(definition.id, {
					brightness: corner & 1 ? 1 : 0,
					hardness: corner & 2 ? 1 : 0,
					dirt: corner & 4 ? 1 : 0,
					length: corner & 8 ? 1 : 0,
					width: corner & 16 ? 1 : 0
				})
				assert.ok(instrument.resolvedPatch.filter.cutoffHz >= 40)
				assert.ok(instrument.resolvedPatch.filter.cutoffHz <= 18_000)
				assert.ok(instrument.resolvedPatch.filter.keyTracking >= 0)
				assert.ok(instrument.resolvedPatch.filter.keyTracking <= 1.5)
				assert.ok(instrument.resolvedPatch.expression.amplitudeAmount >= 0)
				assert.ok(instrument.resolvedPatch.expression.amplitudeAmount <= 1)
				assert.ok(instrument.resolvedPatch.expression.attackScale >= 0)
				assert.ok(instrument.resolvedPatch.expression.attackScale <= 2)
				assert.ok(instrument.resolvedPatch.expression.filterOctaves >= 0)
				assert.ok(instrument.resolvedPatch.expression.filterOctaves <= 4)
				assert.ok(instrument.resolvedPatch.expression.velocityCurve >= 0.25)
				assert.ok(instrument.resolvedPatch.expression.velocityCurve <= 4)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.level >= 0)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.level <= 1)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.detuneCents >= -100)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.detuneCents <= 100)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.semitoneOffset >= -24)
				assert.ok(instrument.resolvedPatch.oscillator.secondary.semitoneOffset <= 24)
				assert.ok(instrument.resolvedPatch.outputGain > 0)
				assert.ok(
					instrument.resolvedPatch.outputGain <= definition.mapping.outputGainCeiling
				)
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
