import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layerId, noteId, projectTick, ProjectSession } from '../../../project-core/src/index.js'
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
		assert.equal(projections.pianoRoll.startTick, 0)
		assert.equal(projections.drums.rows[0]?.activeSteps.includes(0), true)
		assert.equal(projections.drums.rows.length, 5)
		assert.equal(projections.drums.rows[0]?.selectedVariantId, 'kick.deep')
		assert.deepEqual(
			projections.drums.rows[3]?.variants.map(({ id }) => id),
			['openHat.air', 'openHat.short', 'openHat.bright']
		)
		assert.equal(projections.drums.density, 0.38)
		assert.equal(projections.drums.swing, 0.08)
		assert.equal(projections.drums.startTick, 0)
		assert.equal(projections.drums.totalTicks, 3840)
		assert.equal(projections.arrangement.layers.flatMap((layer) => layer.instances).length, 11)
		assert.equal(projections.arrangement.endTick, 153_600)
		assert.equal(projections.sculpt.soundName, 'Glass')
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

	it('projects the selected synth family, its characters and committed macro values', () => {
		const session = new ProjectSession(createSeedProject())
		const selected = layerId('layer.melody')
		let projections = projectStudio(session.getSnapshot(), selected)
		assert.equal(projections.sculpt.familyName, 'Lead')
		assert.equal(projections.sculpt.presetId, 'lead.glass')
		assert.equal(projections.sculpt.characters.length, 7)
		assert.equal(projections.sculpt.characters[1]?.id, 'lead.neon')

		session.dispatch({
			type: 'layer.character.select',
			baseRevision: 0,
			layerId: selected,
			presetId: 'lead.neon'
		})
		session.dispatch({
			type: 'layer.macro.commit',
			baseRevision: 1,
			layerId: selected,
			macro: 'brightness',
			value: 0.31
		})
		projections = projectStudio(session.getSnapshot(), selected)
		assert.equal(projections.sculpt.soundName, 'Neon')
		assert.equal(projections.sculpt.presetId, 'lead.neon')
		assert.equal(projections.sculpt.dimensions.find(({ id }) => id === 'brightness')?.value, 31)
	})

	it('keeps every canonical chromatic note visible in the piano-roll range', () => {
		const session = new ProjectSession(createSeedProject())
		const melody = session.getSnapshot().project.layers[0]
		const material = melody?.material
		const sourceNote = material?.kind === 'midi' ? material.notes[0] : undefined
		assert.ok(melody)
		assert.ok(material?.kind === 'midi')
		assert.ok(sourceNote)
		if (melody === undefined || material?.kind !== 'midi' || sourceNote === undefined) return
		session.dispatch({
			type: 'note.update',
			baseRevision: 0,
			layerId: melody.id,
			noteId: noteId(sourceNote.id),
			pitch: 73,
			startTick: sourceNote.startTick,
			durationTicks: sourceNote.durationTicks,
			velocity: sourceNote.velocity
		})

		const note = projectStudio(session.getSnapshot(), melody.id).pianoRoll.notes[0]
		assert.equal(note?.pitchValue, 73)
		assert.equal(note?.pitch, 'C♯5')
		assert.equal(note?.row, 54)
	})

	it('derives beat and bar timing from the project-wide meter', () => {
		const seed = createSeedProject()
		const session = new ProjectSession({
			...seed,
			transport: {
				...seed.transport,
				meterMap: [{ tick: projectTick(0), numerator: 3, denominator: 8 }]
			}
		})
		const pianoRoll = projectStudio(session.getSnapshot(), layerId('layer.melody')).pianoRoll
		assert.equal(pianoRoll.meterNumerator, 3)
		assert.equal(pianoRoll.meterDenominator, 8)
		assert.equal(pianoRoll.ticksPerBeat, 480)
		assert.equal(pianoRoll.ticksPerBar, 1440)
		assert.equal(
			projectStudio(session.getSnapshot(), layerId('layer.melody')).arrangement.totalBars,
			153_600 / 1440
		)
	})

	it('projects each selected layer performance palette without moving existing notes', () => {
		const session = new ProjectSession(createSeedProject())
		const melodyId = layerId('layer.melody')
		const before = session
			.getSnapshot()
			.project.layers.flatMap((layer) =>
				layer.material.kind === 'midi' ? layer.material.notes.map(({ pitch }) => pitch) : []
			)
		session.dispatch({
			type: 'layer.performance.set',
			baseRevision: 0,
			layerId: melodyId,
			performance: { key: { tonic: 11, mode: 'major' }, octave: 4 }
		})
		const snapshot = session.getSnapshot()
		const after = snapshot.project.layers.flatMap((layer) =>
			layer.material.kind === 'midi' ? layer.material.notes.map(({ pitch }) => pitch) : []
		)
		const projections = projectStudio(snapshot, melodyId)
		assert.deepEqual(after, before)
		assert.equal(projections.transport.palette.name, 'B major')
		assert.equal(projections.transport.octave, 4)
		assert.deepEqual(projections.pianoRoll.palette.noteNames, [
			'B',
			'C#',
			'D#',
			'E',
			'F#',
			'G#',
			'A#'
		])
		const bass = projectStudio(snapshot, layerId('layer.bass'))
		assert.equal(bass.transport.palette.name, 'A minor')
		assert.equal(bass.transport.octave, 2)
	})

	it('projects arrangement removal from the typed song-instance command', () => {
		const session = new ProjectSession(createSeedProject())
		const before = projectStudio(session.getSnapshot(), layerId('layer.bass'))
		const bass = session.getSnapshot().project.layers.find((layer) => layer.id === 'layer.bass')
		const main = session
			.getSnapshot()
			.project.song.instances.find(
				(instance) => instance.sourceLayerId === bass?.id && instance.startTick === 30_720
			)
		assert.ok(bass)
		assert.ok(main)
		if (bass === undefined || main === undefined) return
		assert.equal(
			before.arrangement.layers
				.find((layer) => layer.id === bass.id)
				?.instances.some((instance) => instance.id === main.id),
			true
		)
		session.dispatch({
			type: 'song-instance.delete',
			baseRevision: 0,
			instanceId: main.id
		})
		const after = projectStudio(session.getSnapshot(), bass.id)
		assert.equal(
			after.arrangement.layers
				.find((layer) => layer.id === bass.id)
				?.instances.some((instance) => instance.id === main.id),
			false
		)
	})

	it('keeps empty-project details truthful', () => {
		const session = new ProjectSession({
			...createSeedProject(),
			layers: [],
			sections: [],
			song: { instances: [] }
		})
		const projections = projectStudio(session.getSnapshot(), null)
		assert.equal(projections.context.layerId, null)
		assert.equal(projections.context.labelKey, 'context.noLayer')
		assert.equal(projections.context.soundEditable, false)
		assert.equal(projections.context.energy, 0)
	})
})
