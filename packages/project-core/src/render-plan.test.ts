import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	assetId,
	compileProjectRenderPlan,
	createAssetReference,
	createDrumClip,
	createDrumEvent,
	createLayer,
	createMidiClip,
	createMidiNote,
	createProject,
	type ProjectDocument
} from './index.js'

function renderFixture(): ProjectDocument {
	const base = createProject({ projectId: 'project.render', title: 'Render' })
	const bass = {
		...createLayer({ id: 'layer.bass', name: 'Bass', role: 'bass' }),
		clips: [
			createMidiClip({
				id: 'clip.bass',
				startTick: 960,
				lengthTicks: 1920,
				notes: [
					createMidiNote({
						id: 'note.late',
						pitch: 40,
						startTick: 480,
						durationTicks: 480
					}),
					createMidiNote({
						id: 'note.early',
						pitch: 36,
						startTick: 0,
						durationTicks: 480
					})
				]
			})
		]
	}
	const drums = {
		...createLayer({ id: 'layer.drums', name: 'Drums', role: 'rhythm' }),
		clips: [
			createDrumClip({
				id: 'clip.drums',
				startTick: 0,
				lengthTicks: 3840,
				events: [createDrumEvent({ id: 'event.kick', instrument: 'kick', step: 4 })]
			})
		]
	}
	const asset = createAssetReference({
		id: 'asset.reference',
		contentHash: 'sha256:reference',
		mediaType: 'audio/wav',
		byteLength: 128
	})
	const reference = createLayer({
		id: 'layer.reference',
		name: 'Reference',
		role: 'reference',
		assetId: assetId('asset.reference')
	})
	return { ...base, assets: [asset], layers: [reference, drums, bass] }
}

describe('project render plan', () => {
	it('is deterministic, revision-bound and excludes reference layers', () => {
		const first = compileProjectRenderPlan(renderFixture(), 7)
		const second = compileProjectRenderPlan(renderFixture(), 7)
		assert.equal(first.status, 'ready')
		assert.deepEqual(first, second)
		if (first.status !== 'ready') return
		assert.equal(first.plan.projectRevision, 7)
		assert.deepEqual(
			first.plan.layers.map((layer) => layer.id),
			['layer.bass', 'layer.drums']
		)
		assert.deepEqual(
			first.plan.layers[0]?.events.map((event) => event.startTick),
			[960, 1440]
		)
		assert.equal(Object.isFrozen(first.plan.layers[0]?.source), true)
	})

	it('rejects stale revisions before compiling', () => {
		const result = compileProjectRenderPlan(renderFixture(), 3, 2)
		assert.deepEqual(result, {
			status: 'rejected',
			code: 'STALE_REVISION',
			message: 'Requested revision 2 does not match project revision 3.'
		})
	})

	it('applies solo and mute state to the render boundary', () => {
		const fixture = renderFixture()
		const layers = fixture.layers.map((layer) =>
			layer.id === 'layer.drums' ? { ...layer, solo: true, muted: true } : layer
		)
		const result = compileProjectRenderPlan({ ...fixture, layers }, 1)
		assert.equal(result.status, 'ready')
		if (result.status === 'ready') assert.deepEqual(result.plan.layers, [])
	})
})
