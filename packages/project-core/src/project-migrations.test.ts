import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createLayer,
	createProject,
	loadProjectDocument,
	previousProjectSchemaVersion,
	projectSchemaVersion
} from './index.js'

describe('project migrations', () => {
	it('migrates the legacy v0 transport deterministically', () => {
		const result = loadProjectDocument({
			schemaVersion: 0,
			projectId: 'project.legacy',
			title: 'Legacy',
			tempo: 122,
			key: { tonic: 7, mode: 'minor' }
		})
		assert.equal(result.status, 'loaded')
		if (result.status !== 'loaded') return
		assert.equal(result.migratedFromSchemaVersion, 0)
		assert.equal(result.project.transport.tempoMap[0]?.bpm, 122)
		assert.deepEqual(result.project.transport.meterMap[0], {
			tick: 0,
			numerator: 4,
			denominator: 4
		})
	})

	it('migrates v1 pitched layers to explicit per-instrument performance mappings', () => {
		const project = createProject({ projectId: 'project.v1', title: 'Previous' })
		const layer = createLayer({ id: 'layer.v1', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const result = loadProjectDocument({
			...project,
			schemaVersion: previousProjectSchemaVersion,
			layers: [
				{
					...layer,
					source: { type: 'synth', instrument: layer.source.instrument }
				}
			]
		})
		assert.equal(result.status, 'loaded')
		if (result.status !== 'loaded') return
		assert.equal(result.migratedFromSchemaVersion, previousProjectSchemaVersion)
		const migrated = result.project.layers[0]
		assert.equal(migrated?.source.type, 'synth')
		if (migrated?.source.type === 'synth') {
			assert.deepEqual(migrated.source.performance, {
				key: { tonic: 9, mode: 'minor' },
				octave: 2
			})
		}
	})

	it('reports future schemas as unsupported instead of destructively loading them', () => {
		const result = loadProjectDocument({ schemaVersion: projectSchemaVersion + 1 })
		assert.equal(result.status, 'unsupported')
		if (result.status === 'unsupported') {
			assert.equal(result.schemaVersion, projectSchemaVersion + 1)
		}
	})

	it('reports future resolved patch models as unsupported', () => {
		const project = createProject({ projectId: 'project.future-patch', title: 'Future patch' })
		const layer = createLayer({ id: 'layer.bass', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const futureLayer = {
			...layer,
			source: {
				...layer.source,
				instrument: {
					...layer.source.instrument,
					resolvedPatch: {
						...layer.source.instrument.resolvedPatch,
						patchModelVersion: 2
					}
				}
			}
		}
		const result = loadProjectDocument({ ...project, layers: [futureLayer] })
		assert.equal(result.status, 'unsupported')
		if (result.status === 'unsupported') assert.equal(result.patchVersion, 2)
	})
})
