import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layerId, ProjectSession } from '../../../project-core/src/index.js'
import { projectStudio } from './projectors.js'
import { createSeedProject } from './seed-project.js'

function surfaceRevisions(projections: ReturnType<typeof projectStudio>): readonly number[] {
	return [
		projections.home.revision,
		projections.layers.revision,
		projections.context.revision,
		projections.pianoRoll.revision,
		projections.drums.revision,
		projections.arrangement.revision,
		projections.sculpt.revision
	]
}

describe('studio project projections', () => {
	it('projects all seven musical surfaces from one session revision', () => {
		const session = new ProjectSession(createSeedProject())
		const projections = projectStudio(session.getSnapshot(), layerId('layer.melody'))
		assert.deepEqual(surfaceRevisions(projections), [0, 0, 0, 0, 0, 0, 0])
		assert.equal(projections.home.recentPieces[0]?.name, 'Velvet Morning')
		assert.equal(projections.layers.items.length, 4)
		assert.equal(projections.pianoRoll.notes.length, 2)
		assert.equal(projections.drums.rows[0]?.activeSteps.includes(0), true)
		assert.equal(projections.arrangement.sections.length, 4)
		assert.equal(projections.sculpt.soundName, 'Deep')
	})

	it('reflects a semantic command everywhere without creating presentation revisions', () => {
		const session = new ProjectSession(createSeedProject())
		const selected = layerId('layer.melody')
		session.dispatch({
			type: 'layer.gain.set',
			baseRevision: 0,
			layerId: selected,
			gain: 1.4
		})
		const projections = projectStudio(session.getSnapshot(), selected)
		assert.deepEqual(surfaceRevisions(projections), [1, 1, 1, 1, 1, 1, 1])
		assert.equal(projections.context.energy, 70)

		const selectionOnly = projectStudio(session.getSnapshot(), layerId('layer.bass'))
		assert.equal(selectionOnly.revision, 1)
		assert.equal(selectionOnly.layers.activeLayerId, 'layer.bass')
		assert.equal(session.getSnapshot().revision, 1)
	})

	it('projects arrangement removal from the typed clip command', () => {
		const session = new ProjectSession(createSeedProject())
		const before = projectStudio(session.getSnapshot(), layerId('layer.bass'))
		assert.ok(before.arrangement.layers[2]?.sections.includes('section.main'))
		const bass = session.getSnapshot().project.layers.find((layer) => layer.id === 'layer.bass')
		const main = bass?.clips.find((clip) => clip.sectionId === 'section.main')
		assert.ok(bass)
		assert.ok(main)
		if (bass === undefined || main === undefined) return
		session.dispatch({
			type: 'clip.delete',
			baseRevision: 0,
			layerId: bass.id,
			clipId: main.id
		})
		const after = projectStudio(session.getSnapshot(), bass.id)
		assert.equal(after.arrangement.layers[2]?.sections.includes('section.main'), false)
	})

	it('keeps empty-project details truthful', () => {
		const session = new ProjectSession({
			...createSeedProject(),
			layers: [],
			sections: []
		})
		const projections = projectStudio(session.getSnapshot(), null)
		assert.equal(projections.context.layerId, null)
		assert.equal(projections.context.labelKey, 'context.noLayer')
		assert.equal(projections.context.soundEditable, false)
		assert.equal(projections.context.energy, 0)
	})
})
