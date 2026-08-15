import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	assetId,
	createLayer,
	createDrumMaterial,
	createDrumEvent,
	createMidiMaterial,
	createMidiNote,
	createProject,
	createSection,
	createSongInstance,
	layerId,
	projectLimits,
	sectionId,
	validateProjectDocument
} from './index.js'

function issueCodes(value: unknown): readonly string[] {
	const result = validateProjectDocument(value)
	assert.equal(result.ok, false)
	return result.ok ? [] : result.issues.map((entry) => entry.code)
}

function reorderSerializableKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reorderSerializableKeys)
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, reorderSerializableKeys(entry)])
	)
}

describe('project validation', () => {
	it('treats serializable object key order as non-semantic', () => {
		const project = createProject({ projectId: 'project.key-order', title: 'Key order' })
		const synth = createLayer({ id: 'layer.synth', name: 'Synth', role: 'melody' })
		const drums = createLayer({ id: 'layer.drums', name: 'Drums', role: 'rhythm' })
		const result = validateProjectDocument(
			reorderSerializableKeys({ ...project, layers: [synth, drums] })
		)
		assert.equal(result.ok, true)
	})

	it('accepts an out-of-scale MIDI note because scale is advisory', () => {
		const project = createProject({ projectId: 'project.scale', title: 'Scale' })
		const note = createMidiNote({
			id: 'note.c-sharp',
			pitch: 61,
			startTick: 0,
			durationTicks: 240
		})
		const material = createMidiMaterial({
			materialLengthTicks: 960,
			notes: [note]
		})
		const layer = {
			...createLayer({ id: 'layer.melody', name: 'Melody', role: 'melody' }),
			material
		}
		const result = validateProjectDocument({ ...project, layers: [layer] })
		assert.equal(result.ok, true)
		if (result.ok) assert.equal(Object.isFrozen(result.project.layers[0]?.material), true)
	})

	it('requires a bounded performance mapping for every pitched layer', () => {
		const project = createProject({ projectId: 'project.mapping', title: 'Mapping' })
		const layer = createLayer({ id: 'layer.mapping', name: 'Mapping', role: 'melody' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		assert.ok(
			issueCodes({
				...project,
				layers: [
					{
						...layer,
						source: {
							...layer.source,
							performance: { ...layer.source.performance, octave: 7 }
						}
					}
				]
			}).includes('INVALID_VALUE')
		)
	})

	it('rejects mismatched synth families and non-authoritative resolved patches', () => {
		const project = createProject({ projectId: 'project.synth-patch', title: 'Synth patch' })
		const layer = createLayer({ id: 'layer.synth-patch', name: 'Lead', role: 'melody' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		assert.ok(
			issueCodes({
				...project,
				layers: [
					{
						...layer,
						source: {
							...layer.source,
							instrument: { ...layer.source.instrument, family: 'bass' }
						}
					}
				]
			}).includes('INCOMPATIBLE_SOURCE')
		)
		assert.ok(
			issueCodes({
				...project,
				layers: [
					{
						...layer,
						source: {
							...layer.source,
							instrument: {
								...layer.source.instrument,
								resolvedPatch: {
									...layer.source.instrument.resolvedPatch,
									outputGain: 0.2
								}
							}
						}
					}
				]
			}).includes('INVALID_VALUE')
		)
	})

	it('rejects drum variants that belong to another voice', () => {
		const project = createProject({ projectId: 'project.drum-patch', title: 'Drum patch' })
		const layer = createLayer({ id: 'layer.drum-patch', name: 'Drums', role: 'rhythm' })
		assert.equal(layer.source.type, 'drum')
		if (layer.source.type !== 'drum') return
		assert.ok(
			issueCodes({
				...project,
				layers: [
					{
						...layer,
						source: {
							...layer.source,
							voiceVariants: {
								...layer.source.voiceVariants,
								kick: 'clap.clean'
							}
						}
					}
				]
			}).includes('INVALID_VALUE')
		)
	})

	it('rejects duplicate IDs and missing references', () => {
		const project = createProject({ projectId: 'project.references', title: 'References' })
		const first = createLayer({ id: 'layer.duplicate', name: 'First', role: 'bass' })
		const second = {
			...createLayer({ id: 'layer.second', name: 'Second', role: 'melody' }),
			id: first.id
		}
		assert.ok(issueCodes({ ...project, layers: [first, second] }).includes('DUPLICATE_ID'))

		const reference = createLayer({
			id: 'layer.reference',
			name: 'Reference',
			role: 'reference',
			assetId: assetId('asset.missing')
		})
		assert.ok(issueCodes({ ...project, layers: [reference] }).includes('MISSING_REFERENCE'))
	})

	it('rejects section cycles and song instances with unknown source layers', () => {
		const project = createProject({ projectId: 'project.sections', title: 'Sections' })
		const first = createSection({
			id: 'section.first',
			name: 'First',
			startTick: 0,
			lengthTicks: 960,
			parentSectionId: sectionId('section.second')
		})
		const second = createSection({
			id: 'section.second',
			name: 'Second',
			startTick: 960,
			lengthTicks: 960,
			parentSectionId: first.id
		})
		assert.ok(issueCodes({ ...project, sections: [first, second] }).includes('CYCLE'))

		const instance = createSongInstance({
			id: 'instance.orphan',
			sourceLayerId: layerId('layer.missing'),
			startTick: 0,
			durationTicks: 960
		})
		assert.ok(
			issueCodes({ ...project, song: { instances: [instance] } }).includes(
				'MISSING_REFERENCE'
			)
		)
	})

	it('rejects non-finite values, empty durations and timeline overflow', () => {
		const project = createProject({ projectId: 'project.time', title: 'Time' })
		assert.ok(
			issueCodes({
				...project,
				transport: {
					...project.transport,
					tempoMap: [{ tick: 0, bpm: Number.NaN }]
				}
			}).includes('INVALID_VALUE')
		)

		const layer = createLayer({ id: 'layer.time', name: 'Time', role: 'bass' })
		const instance = createSongInstance({
			id: 'instance.overflow',
			sourceLayerId: layer.id,
			startTick: projectLimits.maxTick,
			durationTicks: 1
		})
		const nonEmptyLayer = {
			...layer,
			material: createMidiMaterial({ materialLengthTicks: 1 })
		}
		assert.ok(
			issueCodes({
				...project,
				layers: [nonEmptyLayer],
				song: { instances: [instance] }
			}).includes('INVALID_TIMELINE')
		)
		assert.ok(
			issueCodes({
				...project,
				layers: [nonEmptyLayer],
				song: { instances: [{ ...instance, startTick: 0, durationTicks: 0 }] }
			}).includes('INVALID_VALUE')
		)
	})

	it('rejects drum events whose musical offset falls outside source material', () => {
		const project = createProject({ projectId: 'project.drum-time', title: 'Drum time' })
		const material = createDrumMaterial({
			materialLengthTicks: 1,
			events: [createDrumEvent({ id: 'event.late', instrument: 'kick', step: 1 })]
		})
		const layer = {
			...createLayer({ id: 'layer.drums', name: 'Drums', role: 'rhythm' }),
			material
		}
		assert.ok(issueCodes({ ...project, layers: [layer] }).includes('INVALID_TIMELINE'))
	})

	it('retains authored source offsets when a linked source cycle becomes shorter', () => {
		const project = createProject({ projectId: 'project.offset', title: 'Offset' })
		const layer = {
			...createLayer({ id: 'layer.offset', name: 'Offset', role: 'bass' }),
			material: createMidiMaterial({ materialLengthTicks: 960 })
		}
		const instance = createSongInstance({
			id: 'instance.offset',
			sourceLayerId: layer.id,
			startTick: 0,
			durationTicks: 960,
			sourceOffsetTicks: 3_840
		})
		assert.equal(
			validateProjectDocument({
				...project,
				layers: [layer],
				song: { instances: [instance] }
			}).ok,
			true
		)
	})
})
