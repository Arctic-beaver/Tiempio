import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createDrumEvent,
	createLayer,
	createMidiMaterial,
	createMidiNote,
	createProject,
	createProjectFromCommand,
	createSection,
	createSongInstance,
	layerId,
	noteId,
	previewBassMacro,
	ProjectSession,
	ProjectSessionError,
	songInstanceId
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
	it('prepares and commits a multi-command transaction as one observable undo unit', () => {
		const session = new ProjectSession(
			createProject({ projectId: 'project.transaction', title: 'Transaction' })
		)
		let publications = 0
		session.subscribe(() => (publications += 1))
		const prepared = session.prepareTransaction([
			{
				type: 'layer.add',
				baseRevision: 0,
				id: 'layer.transaction',
				name: 'Bass',
				role: 'bass'
			},
			{
				type: 'layer.performance.set',
				baseRevision: 1,
				layerId: layerId('layer.transaction'),
				performance: { key: { tonic: 2, mode: 'minor' }, octave: 3 }
			}
		])

		assert.equal(session.getSnapshot().revision, 0)
		assert.equal(session.getSnapshot().dirty, false)
		assert.equal(session.getSnapshot().project.layers.length, 0)
		assert.equal(prepared.revision, 2)
		assert.equal(prepared.project.layers.length, 1)
		assert.equal(publications, 0)

		const committed = session.commitTransaction(prepared)
		assert.equal(committed.revision, 2)
		assert.equal(committed.project.layers.length, 1)
		assert.equal(publications, 1)
		const undone = session.undo(2)
		assert.equal(undone.project.layers.length, 0)
		assert.equal(undone.canRedo, true)
		const redone = session.redo(3)
		assert.equal(redone.project.layers.length, 1)
	})

	it('creates a fully configured synth layer at the atomic add boundary', () => {
		const session = new ProjectSession(
			createProject({ projectId: 'project.configured-layer', title: 'Configured layer' })
		)
		session.dispatch({
			type: 'layer.add',
			baseRevision: 0,
			id: 'layer.configured',
			name: 'Configured',
			role: 'harmony',
			synth: {
				presetId: 'pluck.wood',
				macros: {
					brightness: 0.2,
					hardness: 0.3,
					dirt: 0.1,
					length: 0.8,
					width: 0.4
				},
				performance: { key: { tonic: 7, mode: 'major' }, octave: 4 }
			}
		})
		const layer = session.getSnapshot().project.layers[0]
		assert.equal(layer?.source.type, 'synth')
		if (layer?.source.type !== 'synth') throw new Error('Expected a synth layer.')
		assert.equal(layer.source.instrument.presetId, 'pluck.wood')
		assert.equal(layer.source.instrument.macros.brightness, 0.2)
		assert.deepEqual(layer.source.performance, {
			key: { tonic: 7, mode: 'major' },
			octave: 4
		})
	})

	it('rejects invalid, stale, foreign and reused prepared transactions atomically', () => {
		const session = new ProjectSession(
			createProject({ projectId: 'project.transaction', title: 'Transaction' })
		)
		expectSessionError(() => session.prepareTransaction([]), 'INVALID_COMMAND')
		expectSessionError(
			() =>
				session.prepareTransaction([
					{
						type: 'layer.add',
						baseRevision: 1,
						id: 'layer.stale',
						name: 'Stale',
						role: 'bass'
					}
				]),
			'STALE_REVISION'
		)
		assert.equal(session.getSnapshot().project.layers.length, 0)

		const discarded = session.prepareTransaction([
			{
				type: 'layer.add',
				baseRevision: 0,
				id: 'layer.discarded',
				name: 'Discarded',
				role: 'bass'
			}
		])
		assert.equal(session.discardTransaction(discarded), true)
		expectSessionError(() => session.commitTransaction(discarded), 'INVALID_COMMAND')

		const stale = session.prepareTransaction([
			{
				type: 'layer.add',
				baseRevision: 0,
				id: 'layer.prepared',
				name: 'Prepared',
				role: 'bass'
			}
		])
		session.dispatch({
			type: 'layer.add',
			baseRevision: 0,
			id: 'layer.newer',
			name: 'Newer',
			role: 'melody'
		})
		expectSessionError(() => session.commitTransaction(stale), 'STALE_REVISION')
		assert.deepEqual(
			session.getSnapshot().project.layers.map(({ id }) => id),
			['layer.newer']
		)

		const other = new ProjectSession(
			createProject({ projectId: 'project.other', title: 'Other' })
		)
		const foreign = other.prepareTransaction([
			{
				type: 'layer.add',
				baseRevision: 0,
				id: 'layer.foreign',
				name: 'Foreign',
				role: 'bass'
			}
		])
		expectSessionError(() => session.commitTransaction(foreign), 'INVALID_COMMAND')
		other.commitTransaction(foreign)
		expectSessionError(() => other.commitTransaction(foreign), 'INVALID_COMMAND')
	})

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
			layers: [{ ...layer, source: { ...layer.source, instrument: reordered } }]
		})
		const snapshot = session.dispatch({
			type: 'layer.character.select',
			baseRevision: 0,
			layerId: layer.id,
			presetId: 'bass.deep'
		})
		assert.equal(snapshot.revision, 0)
	})

	it('commits sound and performance mapping atomically through undo and redo', () => {
		const session = createBassSession()
		const configured = session.dispatch({
			type: 'layer.sound.configure',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			presetId: 'bass.deep',
			performance: { key: { tonic: 1, mode: 'major' }, octave: 4 }
		})
		assert.equal(configured.revision, 2)
		const layer = configured.project.layers[0]
		assert.equal(layer?.source.type, 'synth')
		if (layer?.source.type !== 'synth') return
		assert.deepEqual(layer.source.performance, {
			key: { tonic: 1, mode: 'major' },
			octave: 4
		})

		const undone = session.undo(2)
		const undoneLayer = undone.project.layers[0]
		assert.equal(undoneLayer?.source.type, 'synth')
		if (undoneLayer?.source.type === 'synth') {
			assert.deepEqual(undoneLayer.source.performance, {
				key: { tonic: 9, mode: 'minor' },
				octave: 2
			})
		}

		const redone = session.redo(3)
		const redoneLayer = redone.project.layers[0]
		assert.equal(redoneLayer?.source.type, 'synth')
		if (redoneLayer?.source.type === 'synth') {
			assert.deepEqual(redoneLayer.source.performance, layer.source.performance)
		}
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
			type: 'source.material.extend',
			baseRevision: 6,
			layerId: layerId('layer.drums'),
			throughTick: 3840
		})
		const event = createDrumEvent({ id: 'event.kick', instrument: 'kick', step: 0 })
		session.dispatch({
			type: 'drum-event.toggle',
			baseRevision: 7,
			layerId: layerId('layer.drums'),
			eventWhenAdded: event
		})
		const removed = session.dispatch({
			type: 'drum-event.toggle',
			baseRevision: 8,
			layerId: layerId('layer.drums'),
			eventWhenAdded: event
		})
		assert.equal(removed.project.transport.tempoMap[0]?.bpm, 124)
		assert.deepEqual(removed.project.transport.key, { tonic: 7, mode: 'minor' })
		assert.equal(removed.project.sections[0]?.id, 'section.main')
		const drumMaterial = removed.project.layers[1]?.material
		assert.deepEqual(drumMaterial?.kind === 'drum' ? drumMaterial.events : null, [])
	})

	it('applies drum character, density, swing and voice changes deterministically', () => {
		const session = new ProjectSession(
			createProject({ projectId: 'project.drums', title: 'Drums' })
		)
		session.dispatch({
			type: 'layer.add',
			baseRevision: 0,
			id: 'layer.drums',
			name: 'Drums',
			role: 'rhythm'
		})
		session.dispatch({
			type: 'source.material.extend',
			baseRevision: 1,
			layerId: layerId('layer.drums'),
			throughTick: 3840
		})
		const patterned = session.dispatch({
			type: 'drum.pattern.set',
			baseRevision: 2,
			layerId: layerId('layer.drums'),
			character: 'driving'
		})
		const firstEvents = patterned.project.layers[0]?.material
		assert.equal(firstEvents?.kind === 'drum' ? firstEvents.character : null, 'driving')
		assert.ok(firstEvents?.kind === 'drum' && firstEvents.events.length > 0)

		const denser = session.dispatch({
			type: 'drum.density.set',
			baseRevision: 3,
			layerId: layerId('layer.drums'),
			density: 0.82
		})
		const denseClip = denser.project.layers[0]?.material
		assert.ok(
			denseClip?.kind === 'drum' &&
				firstEvents?.kind === 'drum' &&
				denseClip.events.length > firstEvents.events.length
		)
		assert.equal(
			new Set(denseClip?.kind === 'drum' ? denseClip.events.map((event) => event.id) : [])
				.size,
			denseClip?.kind === 'drum' ? denseClip.events.length : 0
		)

		session.dispatch({
			type: 'drum.swing.set',
			baseRevision: 4,
			layerId: layerId('layer.drums'),
			swing: 0.2
		})
		const voiced = session.dispatch({
			type: 'drum.voice.select',
			baseRevision: 5,
			layerId: layerId('layer.drums'),
			instrument: 'kick',
			variantId: 'kick.tight'
		})
		const layer = voiced.project.layers[0]
		assert.equal(layer?.source.type, 'drum')
		if (layer?.source.type === 'drum') {
			assert.equal(layer.source.voiceVariants.kick, 'kick.tight')
			assert.equal(layer.source.resolvedPatch.voices.kick.variantId, 'kick.tight')
		}
		const finalClip = layer?.material
		assert.equal(finalClip?.kind === 'drum' ? finalClip.swing : null, 0.2)
		const undone = session.undo(6).project.layers[0]
		assert.equal(
			undone?.source.type === 'drum' ? undone.source.voiceVariants.kick : null,
			'kick.deep'
		)
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
			type: 'note.add',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			instanceWhenMissing: createSongInstance({
				id: 'instance.bass',
				sourceLayerId: layerId('layer.bass'),
				startTick: 0,
				durationTicks: 3840
			}),
			note: createMidiNote({ id: 'note.bass', pitch: 36, startTick: 0, durationTicks: 480 })
		})
		session.dispatch({
			type: 'note.move',
			baseRevision: 2,
			layerId: layerId('layer.bass'),
			noteId: noteId('note.bass'),
			pitch: 38,
			startTick: 480
		})
		session.dispatch({
			type: 'note.resize',
			baseRevision: 3,
			layerId: layerId('layer.bass'),
			noteId: noteId('note.bass'),
			durationTicks: 960
		})
		const transposed = session.dispatch({
			type: 'material.transpose-octave',
			baseRevision: 4,
			layerId: layerId('layer.bass'),
			direction: 1
		})
		const clip = transposed.project.layers[0]?.material
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
			baseRevision: 5,
			layerId: layerId('layer.bass'),
			noteId: noteId('note.bass')
		})
		const deletedClip = deleted.project.layers[0]?.material
		assert.equal(deletedClip?.kind, 'midi')
		assert.deepEqual(deletedClip?.kind === 'midi' ? deletedClip.notes : null, [])
	})

	it('creates a first song instance with its first source note in one revision', () => {
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
			instanceWhenMissing: createSongInstance({
				id: 'instance.first',
				sourceLayerId: layerId('layer.bass'),
				startTick: 0,
				durationTicks: 3840
			}),
			note
		})
		assert.equal(created.revision, 2)
		const clip = created.project.layers[0]?.material
		assert.equal(clip?.kind, 'midi')
		assert.deepEqual(clip?.kind === 'midi' ? clip.notes : null, [note])
		assert.equal(created.project.song.instances[0]?.id, 'instance.first')
		const undone = session.undo(2).project
		assert.deepEqual(
			undone.layers[0]?.material.kind === 'midi' ? undone.layers[0].material.notes : null,
			[]
		)
		assert.deepEqual(undone.song.instances, [])
	})

	it('groups source-note begin and finalize as one undoable press gesture', () => {
		const session = createBassSession()
		const historyGroup = 'performance.note.pointer-1'
		session.dispatch(
			{
				type: 'source.note.begin',
				baseRevision: 1,
				layerId: layerId('layer.bass'),
				instanceWhenMissing: createSongInstance({
					id: 'instance.performance',
					sourceLayerId: layerId('layer.bass'),
					startTick: 0,
					durationTicks: 3840
				}),
				note: createMidiNote({
					id: 'note.performance',
					pitch: 43,
					startTick: 120,
					durationTicks: 1
				})
			},
			{ historyGroup }
		)
		const finalized = session.dispatch(
			{
				type: 'source.note.finalize',
				baseRevision: 2,
				layerId: layerId('layer.bass'),
				noteId: noteId('note.performance'),
				endTick: 600
			},
			{ historyGroup }
		)
		session.endHistoryGroup(historyGroup)
		const material = finalized.project.layers[0]?.material
		assert.equal(material?.kind === 'midi' ? material.notes[0]?.durationTicks : null, 480)
		const undone = session.undo(3).project
		assert.deepEqual(
			undone.layers[0]?.material.kind === 'midi' ? undone.layers[0].material.notes : null,
			[]
		)
		assert.deepEqual(undone.song.instances, [])
	})

	it('preserves an existing cycle by consuming tail rest before extending it', () => {
		const base = createProject({ projectId: 'project.tail-rest', title: 'Tail rest' })
		const layer = {
			...createLayer({ id: 'layer.tail-rest', name: 'Tail rest', role: 'bass' }),
			material: createMidiMaterial({
				materialLengthTicks: 960,
				tailRestTicks: 960
			})
		}
		const session = new ProjectSession({ ...base, layers: [layer] })
		let snapshot = session.dispatch({
			type: 'source.material.extend',
			baseRevision: 0,
			layerId: layer.id,
			throughTick: 1440
		})
		assert.deepEqual(snapshot.project.layers[0]?.material, {
			kind: 'midi',
			materialLengthTicks: 1440,
			tailRestTicks: 480,
			notes: []
		})
		snapshot = session.dispatch({
			type: 'source.material.extend',
			baseRevision: 1,
			layerId: layer.id,
			throughTick: 2400
		})
		assert.equal(snapshot.project.layers[0]?.material.tailRestTicks, 0)
	})

	it('updates note timing, pitch, duration and velocity in one history entry', () => {
		const session = createBassSession()
		session.dispatch({
			type: 'note.add',
			baseRevision: 1,
			layerId: layerId('layer.bass'),
			instanceWhenMissing: createSongInstance({
				id: 'instance.edit',
				sourceLayerId: layerId('layer.bass'),
				startTick: 0,
				durationTicks: 3840
			}),
			note: createMidiNote({
				id: 'note.edit',
				pitch: 36,
				startTick: 0,
				durationTicks: 480,
				velocity: 80
			})
		})
		const updated = session.dispatch({
			type: 'note.update',
			baseRevision: 2,
			layerId: layerId('layer.bass'),
			noteId: noteId('note.edit'),
			pitch: 48,
			startTick: 240,
			durationTicks: 960,
			velocity: 127
		})
		const clip = updated.project.layers[0]?.material
		assert.deepEqual(clip?.kind === 'midi' ? clip.notes[0] : null, {
			id: 'note.edit',
			pitch: 48,
			startTick: 240,
			durationTicks: 960,
			velocity: 127
		})
		const undone = session.undo(3).project.layers[0]?.material
		assert.deepEqual(undone?.kind === 'midi' ? undone.notes[0] : null, {
			id: 'note.edit',
			pitch: 36,
			startTick: 0,
			durationTicks: 480,
			velocity: 80
		})
	})

	it('trims, splits and explicitly varies linked instances without copying ordinary placements', () => {
		const base = createProject({ projectId: 'project.linked-arrangement', title: 'Linked' })
		const source = {
			...createLayer({ id: 'layer.linked', name: 'Linked phrase', role: 'melody' }),
			material: createMidiMaterial({
				materialLengthTicks: 960,
				notes: [
					createMidiNote({
						id: 'note.linked',
						pitch: 64,
						startTick: 120,
						durationTicks: 480
					})
				]
			})
		}
		const original = createSongInstance({
			id: 'instance.linked',
			sourceLayerId: source.id,
			startTick: 100,
			durationTicks: 1000,
			sourceOffsetTicks: 50
		})
		const session = new ProjectSession({
			...base,
			layers: [source],
			song: { instances: [original] }
		})

		session.dispatch({
			type: 'song-instance.trim-left',
			baseRevision: 0,
			instanceId: original.id,
			startTick: 200,
			durationTicks: 900,
			sourceOffsetTicks: 150
		})
		session.dispatch({
			type: 'song-instance.split',
			baseRevision: 1,
			instanceId: original.id,
			rightInstanceId: songInstanceId('instance.linked.right'),
			splitOffsetTicks: 400
		})
		assert.deepEqual(session.getSnapshot().project.song.instances, [
			{ ...original, startTick: 200, durationTicks: 400, sourceOffsetTicks: 150 },
			{
				...original,
				id: 'instance.linked.right',
				startTick: 600,
				durationTicks: 500,
				sourceOffsetTicks: 550
			}
		])

		const variation = {
			...source,
			id: layerId('layer.linked.variation'),
			name: 'Linked phrase variation',
			material: createMidiMaterial({
				materialLengthTicks: 960,
				notes: [
					createMidiNote({
						id: 'note.linked.variation',
						pitch: 64,
						startTick: 120,
						durationTicks: 480
					})
				]
			})
		}
		session.dispatch({
			type: 'layer.duplicate-as-variation',
			baseRevision: 2,
			sourceLayerId: source.id,
			layer: variation,
			instance: createSongInstance({
				id: 'instance.linked.variation',
				sourceLayerId: variation.id,
				startTick: 1200,
				durationTicks: 400
			})
		})
		assert.equal(session.getSnapshot().project.layers.length, 2)
		assert.equal(session.getSnapshot().project.song.instances.length, 3)
		assert.equal(session.getSnapshot().project.layers[0]?.material.kind, 'midi')
		assert.equal(session.getSnapshot().project.layers[1]?.material.kind, 'midi')
		assert.equal(session.undo(3).project.layers.length, 1)
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
