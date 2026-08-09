import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	assetId,
	createDeepBassInstrument,
	createLayer,
	createProject,
	deepBassDefaultMacros,
	resolveDeepBassPatch,
	updateDeepBassMacro
} from './index.js'

describe('project model factories', () => {
	it('creates an owned, deeply frozen canonical project', () => {
		const project = createProject({ projectId: 'project.demo', title: 'Demo' })
		assert.equal(project.transport.ticksPerQuarter, 960)
		assert.equal(project.transport.tempoMap[0]?.bpm, 108)
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
