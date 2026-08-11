import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	clipId,
	createDrumClip,
	createDrumEvent,
	createLayer,
	createMidiClip,
	createMidiNote,
	createProject,
	createProjectFromCommand,
	createSection,
	layerId,
	noteId,
	previewBassMacro,
	ProjectSession,
	ProjectSessionError
} from './index.js'

function createBassSession(historyCapacity = 50): ProjectSession {
	const session = new ProjectSession(
		createProject({ projectId: 'project.session', title: 'Session' }),
		{ historyCapacity }
	)
	session.dispatch({
		type: 'layer.add',
		baseRevision: 0,
		id: 'layer.bass',
		name: 'Bass',
		role: 'bass'
	})
	return session
}

function expectSessionError(operation: () => unknown, code: ProjectSessionError['code']): void {
	assert.throws(operation, (error: unknown) => {
		assert.ok(error instanceof ProjectSessionError)
		assert.equal(error.code, code)
		return true
	})
}

describe('ProjectSession', () => {
	it('advances once for an accepted command and not for a no-op or stale command', () => {
		const session = createBassSession()
		assert.equal(session.getSnapshot().revision, 1)
		assert.equal(session.getSnapshot().dirty, true)

		const same = session.dispatch({
			type: 'layer.mute.set',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			muted: false
		})
		assert.equal(same.revision, 1)
		expectSessionError(
			() =>
				session.dispatch({
					type: 'layer.mute.set',
					baseRevision: 0,
					layerId: layerId('layer.bass'),
					muted: true
				}),
			'STALE_REVISION'
		)
		assert.equal(session.getSnapshot().revision, 1)
	})

	it('keeps macro preview outside project revision and commits resolved state once', () => {
		const session = createBassSession()
		const preview = previewBassMacro(
			session.getSnapshot().project,
			layerId('layer.bass'),
			'brightness',
			0.9
		)
		assert.equal(preview.status, 'ready')
		assert.equal(session.getSnapshot().revision, 1)

		const committed = session.dispatch({
			type: 'layer.macro.commit',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			macro: 'brightness',
			value: 0.9
		})
		assert.equal(committed.revision, 2)
		const layer = committed.project.layers[0]
		assert.equal(layer?.source.type, 'synth')
		if (layer?.source.type === 'synth' && preview.status === 'ready') {
			assert.deepEqual(layer.source.instrument, preview.instrument)
		}
	})

	it('treats a key-reordered loaded Deep preset as a semantic no-op', () => {
		const base = createProject({ projectId: 'project.reordered', title: 'Reordered' })
		const layer = createLayer({ id: 'layer.reordered', name: 'Bass', role: 'bass' })
		assert.equal(layer.source.type, 'synth')
		if (layer.source.type !== 'synth') return
		const instrument = layer.source.instrument
		const reordered = {
			resolvedPatch: instrument.resolvedPatch,
			macros: instrument.macros,
			macroMappingVersion: instrument.macroMappingVersion,
			presetRevision: instrument.presetRevision,
			presetId: instrument.presetId,
			family: instrument.family
		}
		const session = new ProjectSession({
			...base,
			layers: [{ ...layer, source: { type: 'synth', instrument: reordered } }]
		})
		const snapshot = session.dispatch({
			type: 'layer.character.select',
			baseRevision: 0,
			layerId: layer.id,
			presetId: 'bass.deep'
		})
		assert.equal(snapshot.revision, 0)
	})

	it('applies transport, section and drum-grid commands through one reducer', () => {
		const session = createBassSession()
		session.dispatch({ type: 'transport.tempo.set', baseRevision: 1, bpm: 124 })
		session.dispatch({
			type: 'transport.key.set',
			baseRevision: 2,
			key: { tonic: 7, mode: 'minor' }
		})
		session.dispatch({
			type: 'transport.loop.set',
			baseRevision: 3,
			enabled: true,
			startTick: 960,
			endTick: 4800
		})
		const section = createSection({
			id: 'section.main',
			name: 'Main',
			startTick: 960,
			lengthTicks: 3840
		})
		session.dispatch({ type: 'section.add', baseRevision: 4, section })
		session.dispatch({
			type: 'layer.add',
			baseRevision: 5,
			id: 'layer.drums',
			name: 'Drums',
			role: 'rhythm'
		})
		session.dispatch({
			type: 'clip.place',
			baseRevision: 6,
			layerId: layerId('layer.drums'),
			clip: createDrumClip({
				id: 'clip.drums',
				startTick: 960,
				lengthTicks: 3840,
				sectionId: section.id
			})
		})
		const event = createDrumEvent({ id: 'event.kick', instrument: 'kick', step: 0 })
		session.dispatch({
			type: 'drum-event.toggle',
			baseRevision: 7,
			layerId: layerId('layer.drums'),
			clipId: clipId('clip.drums'),
			eventWhenAdded: event
		})
		const removed = session.dispatch({
			type: 'drum-event.toggle',
			baseRevision: 8,
			layerId: layerId('layer.drums'),
			clipId: clipId('clip.drums'),
			eventWhenAdded: event
		})
		assert.equal(removed.project.transport.tempoMap[0]?.bpm, 124)
		assert.deepEqual(removed.project.transport.key, { tonic: 7, mode: 'minor' })
		assert.equal(removed.project.sections[0]?.id, 'section.main')
		const drumClip = removed.project.layers[1]?.clips[0]
		assert.deepEqual(drumClip?.kind === 'drum' ? drumClip.events : null, [])
	})

	it('rejects an invalid create-project command at the command boundary', () => {
		assert.throws(() =>
			createProjectFromCommand({
				type: 'project.create',
				projectId: 'project.invalid',
				title: 'x'.repeat(129)
			})
		)
	})

	it('applies note placement, move, resize, octave transpose and delete atomically', () => {
		const session = createBassSession()
		session.dispatch({
			type: 'clip.place',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			clip: createMidiClip({ id: 'clip.bass', startTick: 0, lengthTicks: 3840 })
		})
		session.dispatch({
			type: 'note.add',
			baseRevision: 2,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.bass'),
			note: createMidiNote({ id: 'note.bass', pitch: 36, startTick: 0, durationTicks: 480 })
		})
		session.dispatch({
			type: 'note.move',
			baseRevision: 3,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.bass'),
			noteId: noteId('note.bass'),
			pitch: 38,
			startTick: 480
		})
		session.dispatch({
			type: 'note.resize',
			baseRevision: 4,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.bass'),
			noteId: noteId('note.bass'),
			durationTicks: 960
		})
		const transposed = session.dispatch({
			type: 'clip.transpose-octave',
			baseRevision: 5,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.bass'),
			direction: 1
		})
		const clip = transposed.project.layers[0]?.clips[0]
		assert.equal(clip?.kind, 'midi')
		if (clip?.kind === 'midi') {
			assert.deepEqual(clip.notes[0], {
				id: 'note.bass',
				pitch: 50,
				startTick: 480,
				durationTicks: 960,
				velocity: 96
			})
		}
		const deleted = session.dispatch({
			type: 'note.delete',
			baseRevision: 6,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.bass'),
			noteId: noteId('note.bass')
		})
		const deletedClip = deleted.project.layers[0]?.clips[0]
		assert.equal(deletedClip?.kind, 'midi')
		assert.deepEqual(deletedClip?.kind === 'midi' ? deletedClip.notes : null, [])
	})

	it('creates a missing MIDI clip with its first note in one revision', () => {
		const session = createBassSession()
		const note = createMidiNote({
			id: 'note.first',
			pitch: 36,
			startTick: 240,
			durationTicks: 480,
			velocity: 80
		})
		const created = session.dispatch({
			type: 'note.add',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.first'),
			clipWhenMissing: createMidiClip({
				id: 'clip.first',
				startTick: 0,
				lengthTicks: 3840
			}),
			note
		})
		assert.equal(created.revision, 2)
		const clip = created.project.layers[0]?.clips[0]
		assert.equal(clip?.kind, 'midi')
		assert.deepEqual(clip?.kind === 'midi' ? clip.notes : null, [note])
		assert.deepEqual(session.undo(2).project.layers[0]?.clips, [])
	})

	it('updates note timing, pitch, duration and velocity in one history entry', () => {
		const session = createBassSession()
		session.dispatch({
			type: 'clip.place',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			clip: createMidiClip({
				id: 'clip.edit',
				startTick: 0,
				lengthTicks: 3840,
				notes: [
					createMidiNote({
						id: 'note.edit',
						pitch: 36,
						startTick: 0,
						durationTicks: 480,
						velocity: 80
					})
				]
			})
		})
		const updated = session.dispatch({
			type: 'note.update',
			baseRevision: 2,
			layerId: layerId('layer.bass'),
			clipId: clipId('clip.edit'),
			noteId: noteId('note.edit'),
			pitch: 48,
			startTick: 240,
			durationTicks: 960,
			velocity: 127
		})
		const clip = updated.project.layers[0]?.clips[0]
		assert.deepEqual(clip?.kind === 'midi' ? clip.notes[0] : null, {
			id: 'note.edit',
			pitch: 48,
			startTick: 240,
			durationTicks: 960,
			velocity: 127
		})
		const undone = session.undo(3).project.layers[0]?.clips[0]
		assert.deepEqual(undone?.kind === 'midi' ? undone.notes[0] : null, {
			id: 'note.edit',
			pitch: 36,
			startTick: 0,
			durationTicks: 480,
			velocity: 80
		})
	})

	it('uses monotonic bounded undo/redo and clears redo after a new command', () => {
		const session = createBassSession(2)
		session.dispatch({
			type: 'layer.gain.set',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			gain: 0.8
		})
		session.dispatch({
			type: 'layer.gain.set',
			baseRevision: 2,
			layerId: layerId('layer.bass'),
			gain: 0.6
		})
		session.dispatch({
			type: 'layer.gain.set',
			baseRevision: 3,
			layerId: layerId('layer.bass'),
			gain: 0.4
		})

		assert.equal(session.undo(4).project.layers[0]?.gain, 0.6)
		assert.equal(session.undo(5).project.layers[0]?.gain, 0.8)
		expectSessionError(() => session.undo(6), 'HISTORY_EMPTY')
		assert.equal(session.redo(6).project.layers[0]?.gain, 0.6)
		session.dispatch({
			type: 'layer.mute.set',
			baseRevision: 7,
			layerId: layerId('layer.bass'),
			muted: true
		})
		assert.equal(session.getSnapshot().canRedo, false)
	})

	it('coalesces repeated edits in one explicit history group', () => {
		const session = createBassSession()
		for (const gain of [0.8, 0.6, 0.4]) {
			session.dispatch(
				{
					type: 'layer.gain.set',
					baseRevision: session.getSnapshot().revision,
					layerId: layerId('layer.bass'),
					gain
				},
				{ historyGroup: 'held-key:gain-down' }
			)
		}
		session.endHistoryGroup('held-key:gain-down')

		assert.equal(session.getSnapshot().project.layers[0]?.gain, 0.4)
		assert.equal(session.undo(session.getSnapshot().revision).project.layers[0]?.gain, 1)
		assert.equal(session.redo(session.getSnapshot().revision).project.layers[0]?.gain, 0.4)
	})

	it('keeps revision N+1 dirty after saving N and tracks recovery independently', () => {
		const session = createBassSession()
		session.beginSave(1, 'target:primary')
		session.beginRecovery(1, 'recovery:one')
		session.dispatch({
			type: 'layer.mute.set',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			muted: true
		})

		const saved = session.acknowledgeSave(1, 'target:primary')
		assert.equal(saved.persistedRevision, 1)
		assert.equal(saved.dirty, true)
		assert.equal(saved.recovery.protectedRevision, 0)
		const recovered = session.acknowledgeRecovery(1, 'recovery:one')
		assert.equal(recovered.recovery.protectedRevision, 1)
		assert.equal(recovered.recovery.needed, true)
		expectSessionError(
			() => session.acknowledgeSave(1, 'target:other'),
			'INVALID_ACKNOWLEDGEMENT'
		)
	})
})
