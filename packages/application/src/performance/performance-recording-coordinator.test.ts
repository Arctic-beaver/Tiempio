import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
	EngineCommandPayloadByType,
	EngineEventPayloadByType
} from '../../../contracts/src/index.js'
import { ProjectSession } from '../../../project-core/src/index.js'
import { createSeedProject } from '../project/seed-project.js'
import {
	PerformanceRecordingCoordinator,
	type PerformanceRecordingEngineSink
} from './performance-recording-coordinator.js'

class RecordingEngineProbe implements PerformanceRecordingEngineSink {
	readonly noteOffs: EngineCommandPayloadByType['recording-note-off'][] = []
	readonly noteOns: EngineCommandPayloadByType['recording-note-on'][] = []
	readonly starts: EngineCommandPayloadByType['start-recording'][] = []
	readonly stops: EngineCommandPayloadByType['stop-recording'][] = []
	accept = true

	async noteOff(payload: EngineCommandPayloadByType['recording-note-off']): Promise<boolean> {
		this.noteOffs.push(payload)
		return this.accept
	}

	async noteOn(payload: EngineCommandPayloadByType['recording-note-on']): Promise<boolean> {
		this.noteOns.push(payload)
		return this.accept
	}

	async start(payload: EngineCommandPayloadByType['start-recording']): Promise<boolean> {
		this.starts.push(payload)
		return this.accept
	}

	async stop(payload: EngineCommandPayloadByType['stop-recording']): Promise<boolean> {
		this.stops.push(payload)
		return this.accept
	}
}

function state(
	recordingId: string,
	phase: 'count-in' | 'recording',
	sourceTick: number,
	countInBeatsRemaining = 0
): EngineEventPayloadByType['recording-state'] {
	return {
		countInBeatsRemaining,
		recordingId,
		samplePosition: sourceTick * 25,
		sourceTick,
		state: phase
	}
}

function input(
	recordingId: string,
	auditionId: string,
	phase: 'note-on' | 'note-off',
	sourceTick: number
): EngineEventPayloadByType['recording-input-applied'] {
	return {
		auditionId,
		phase,
		pitch: 48,
		recordingId,
		samplePosition: sourceTick * 25,
		sourceTick,
		velocity: 104
	}
}

function stopped(
	recordingId: string,
	stopTick: number,
	reason: EngineEventPayloadByType['recording-stopped']['reason'] = 'stopped'
): EngineEventPayloadByType['recording-stopped'] {
	return {
		reason,
		recordingId,
		samplePosition: stopTick * 25,
		stopTick
	}
}

function setup(options: { readonly releaseInputs?: () => void } = {}): {
	readonly coordinator: PerformanceRecordingCoordinator
	readonly diagnostics: string[]
	readonly engine: RecordingEngineProbe
	readonly releases: string[]
	readonly session: ProjectSession
} {
	const engine = new RecordingEngineProbe()
	const session = new ProjectSession(createSeedProject())
	const releases: string[] = []
	const diagnostics: string[] = []
	const coordinator = new PerformanceRecordingCoordinator({
		engine,
		onDiagnostic: (message) => diagnostics.push(message),
		onReleased: () => releases.push('released'),
		releaseInputs: options.releaseInputs
	})
	coordinator.bindSession(session)
	return { coordinator, diagnostics, engine, releases, session }
}

describe('PerformanceRecordingCoordinator', () => {
	it('commits one overdub pass as one undoable and redoable history group', async () => {
		const { coordinator, engine, releases, session } = setup()
		const original = session.getSnapshot().project
		assert.equal(
			await coordinator.start({ layerId: 'layer.bass', startTick: 4_800, countInBars: 1 }),
			true
		)
		const recordingId = engine.starts[0]?.recordingId ?? ''
		assert.equal(engine.starts[0]?.projectRevision, 0)
		assert.equal(coordinator.acceptState(state(recordingId, 'count-in', 0, 4)), true)
		assert.equal(session.getSnapshot().revision, 0)
		assert.equal(coordinator.acceptState(state(recordingId, 'recording', 4_800)), true)
		assert.equal(
			coordinator.acceptInput(input(recordingId, 'performance-1', 'note-on', 4_800)),
			true
		)
		assert.equal(coordinator.acceptState(state(recordingId, 'recording', 5_760)), true)
		assert.equal(
			coordinator.acceptInput(input(recordingId, 'performance-1', 'note-off', 6_000)),
			true
		)
		assert.equal(coordinator.acceptStopped(stopped(recordingId, 6_500)), true)

		const recorded = session.getSnapshot()
		const bass = recorded.project.layers.find((layer) => layer.id === 'layer.bass')
		assert.equal(bass?.material.kind, 'midi')
		assert.equal(bass?.material.materialLengthTicks, 6_500)
		assert.equal(bass?.material.kind === 'midi' ? bass.material.notes.length : 0, 3)
		assert.equal(recorded.recovery.needed, true)
		assert.equal(recorded.canUndo, true)
		assert.equal(coordinator.getSnapshot().lastPass?.noteCount, 1)
		assert.deepEqual(releases, ['released'])

		session.undo(recorded.revision)
		assert.equal(session.getSnapshot().project, original)
		session.redo(session.getSnapshot().revision)
		const redoneBass = session
			.getSnapshot()
			.project.layers.find((layer) => layer.id === 'layer.bass')
		assert.equal(redoneBass?.material.materialLengthTicks, 6_500)
	})

	it('keeps count-in cancellation mutation-free and ignores stale recording IDs', async () => {
		const { coordinator, engine, session } = setup()
		await coordinator.start({ layerId: 'layer.bass', startTick: 960 })
		const recordingId = engine.starts[0]?.recordingId ?? ''
		assert.equal(coordinator.acceptState(state('recording.stale', 'recording', 960)), false)
		assert.equal(
			coordinator.acceptInput(input('recording.stale', 'performance-1', 'note-on', 960)),
			false
		)
		assert.equal(coordinator.acceptState(state(recordingId, 'count-in', 0, 4)), true)
		assert.equal(coordinator.acceptStopped(stopped(recordingId, 960, 'interrupted')), true)
		assert.equal(session.getSnapshot().revision, 0)
		assert.equal(session.getSnapshot().canUndo, false)
		assert.equal(coordinator.getSnapshot().lastPass, null)
	})

	it('persists a silent range extension and closes held notes at a trusted failure tick', async () => {
		const { coordinator, engine, session } = setup()
		await coordinator.start({ layerId: 'layer.bass', startTick: 5_000, countInBars: 0 })
		let recordingId = engine.starts[0]?.recordingId ?? ''
		coordinator.acceptState(state(recordingId, 'recording', 5_000))
		coordinator.acceptStopped(stopped(recordingId, 7_000))
		assert.equal(
			session.getSnapshot().project.layers.find((layer) => layer.id === 'layer.bass')
				?.material.materialLengthTicks,
			7_000
		)
		session.undo(session.getSnapshot().revision)

		await coordinator.start({ layerId: 'layer.bass', startTick: 100, countInBars: 0 })
		recordingId = engine.starts[1]?.recordingId ?? ''
		coordinator.acceptState(state(recordingId, 'recording', 100))
		coordinator.acceptInput(input(recordingId, 'performance-2', 'note-on', 100))
		coordinator.acceptState(state(recordingId, 'recording', 340))
		assert.equal(coordinator.failAtLastTrustedTick(), true)
		assert.equal(coordinator.getSnapshot().phase, 'recovery-required')
		const bass = session.getSnapshot().project.layers.find((layer) => layer.id === 'layer.bass')
		const recoveredNote =
			bass?.material.kind === 'midi'
				? bass.material.notes.find((note) => note.startTick === 100 && note.pitch === 48)
				: undefined
		assert.equal(recoveredNote?.durationTicks, 240)
		assert.equal(coordinator.recover(), true)
		assert.equal(coordinator.getSnapshot().phase, 'idle')
	})

	it('routes stop release before the engine boundary and retains the captured session on switch', async () => {
		let coordinatorReference: PerformanceRecordingCoordinator | null = null
		const { coordinator, engine, session } = setup({
			releaseInputs: () => coordinatorReference?.noteOff('performance-held')
		})
		coordinatorReference = coordinator
		const replacement = new ProjectSession(createSeedProject())
		await coordinator.start({ layerId: 'layer.bass', startTick: 0, countInBars: 0 })
		const recordingId = engine.starts[0]?.recordingId ?? ''
		coordinator.acceptState(state(recordingId, 'recording', 0))
		coordinator.acceptInput(input(recordingId, 'performance-held', 'note-on', 0))
		coordinator.bindSession(replacement)
		assert.equal(coordinator.stop(), true)
		assert.equal(engine.noteOffs[0]?.auditionId, 'performance-held')
		assert.equal(engine.stops[0]?.recordingId, recordingId)
		coordinator.acceptStopped(stopped(recordingId, 480))
		assert.equal(session.getSnapshot().revision > 0, true)
		assert.equal(replacement.getSnapshot().revision, 0)
	})
})
