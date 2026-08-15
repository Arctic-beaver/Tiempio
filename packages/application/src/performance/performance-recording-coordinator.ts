import {
	engineProtocolLimits,
	type EngineCommandPayloadByType,
	type EngineEventPayloadByType
} from '../../../contracts/src/index.js'
import {
	createSongInstance,
	defaultTicksPerQuarter,
	layerId,
	midiPitch,
	noteId,
	projectLimits,
	projectTick,
	songInstanceId,
	type ProjectCommand,
	type ProjectSession
} from '../../../project-core/src/index.js'

export type PerformanceRecordingPhase =
	'idle' | 'starting' | 'count-in' | 'recording' | 'stopping' | 'recovery-required'

export interface RecordingLiveNote {
	readonly auditionId: string
	readonly endTick: number | null
	readonly noteId: string
	readonly pitch: number
	readonly startTick: number
	readonly velocity: number
}

export interface RecordedPassSummary {
	readonly endTick: number
	readonly layerId: string
	readonly noteCount: number
	readonly reason: EngineEventPayloadByType['recording-stopped']['reason']
	readonly recordingId: string
	readonly startTick: number
}

export interface PerformanceRecordingSnapshot {
	readonly countInBeatsRemaining: number
	readonly cursorTick: number | null
	readonly lastPass: RecordedPassSummary | null
	readonly layerId: string | null
	readonly liveNotes: readonly RecordingLiveNote[]
	readonly phase: PerformanceRecordingPhase
	readonly recordingId: string | null
	readonly startTick: number | null
}

export interface PerformanceRecordingEngineSink {
	noteOff(payload: EngineCommandPayloadByType['recording-note-off']): Promise<boolean>
	noteOn(payload: EngineCommandPayloadByType['recording-note-on']): Promise<boolean>
	start(payload: EngineCommandPayloadByType['start-recording']): Promise<boolean>
	stop(payload: EngineCommandPayloadByType['stop-recording']): Promise<boolean>
}

export interface PerformanceRecordingCoordinatorOptions {
	readonly engine: PerformanceRecordingEngineSink
	readonly onDiagnostic?: (message: string) => void
	readonly onReleased?: () => void
	readonly releaseInputs?: () => void
}

interface ActiveRecordingNote {
	readonly auditionId: string
	endTick: number | null
	readonly noteId: ReturnType<typeof noteId>
	readonly pitch: number
	readonly startTick: number
	readonly velocity: number
}

interface ActiveRecording {
	enteredRecording: boolean
	readonly historyGroup: string
	readonly id: string
	readonly layerId: ReturnType<typeof layerId>
	lastTrustedTick: number
	mutated: boolean
	nextCheckpointTick: number
	readonly notes: Map<string, ActiveRecordingNote>
	readonly projectRevision: number
	readonly seenInputs: Set<string>
	readonly session: ProjectSession
	readonly startTick: number
}

const idleSnapshot = Object.freeze<PerformanceRecordingSnapshot>({
	countInBeatsRemaining: 0,
	cursorTick: null,
	lastPass: null,
	layerId: null,
	liveNotes: Object.freeze([]),
	phase: 'idle',
	recordingId: null,
	startTick: null
})

function freezeLiveNote(note: ActiveRecordingNote): RecordingLiveNote {
	return Object.freeze({
		auditionId: note.auditionId,
		endTick: note.endTick,
		noteId: note.noteId,
		pitch: note.pitch,
		startTick: note.startTick,
		velocity: note.velocity
	})
}

function freezeSummary(summary: RecordedPassSummary | null): RecordedPassSummary | null {
	return summary === null ? null : Object.freeze({ ...summary })
}

function freezeSnapshot(snapshot: PerformanceRecordingSnapshot): PerformanceRecordingSnapshot {
	return Object.freeze({
		...snapshot,
		lastPass: freezeSummary(snapshot.lastPass),
		liveNotes: Object.freeze(snapshot.liveNotes.map((note) => Object.freeze({ ...note })))
	})
}

function ticksPerBeatAt(session: ProjectSession, tick: number): number {
	const project = session.getSnapshot().project
	const meter = [...project.transport.meterMap].reverse().find((point) => point.tick <= tick)
	const denominator = meter?.denominator ?? 4
	return (defaultTicksPerQuarter * 4) / denominator
}

export class PerformanceRecordingCoordinator {
	readonly #engine: PerformanceRecordingEngineSink
	readonly #listeners = new Set<() => void>()
	readonly #onDiagnostic: (message: string) => void
	readonly #onReleased: () => void
	readonly #releaseInputs: () => void
	#active: ActiveRecording | null = null
	#recordingSequence = 0
	#session: ProjectSession | null = null
	#snapshot = idleSnapshot

	public constructor(options: PerformanceRecordingCoordinatorOptions) {
		this.#engine = options.engine
		this.#onDiagnostic = options.onDiagnostic ?? (() => undefined)
		this.#onReleased = options.onReleased ?? (() => undefined)
		this.#releaseInputs = options.releaseInputs ?? (() => undefined)
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): PerformanceRecordingSnapshot => this.#snapshot

	public bindSession(session: ProjectSession): void {
		this.#session = session
	}

	public blocksPlanPublication(): boolean {
		return this.#active !== null
	}

	public acceptsPerformanceInput(layerIdentity: string): boolean {
		return (
			this.#active?.layerId === layerIdentity &&
			['starting', 'count-in', 'recording'].includes(this.#snapshot.phase)
		)
	}

	public async start(input: {
		readonly countInBars?: number
		readonly layerId: string
		readonly startTick: number
	}): Promise<boolean> {
		const session = this.#session
		if (session === null || this.#active !== null || this.#snapshot.phase !== 'idle')
			return false
		const countInBars = input.countInBars ?? 1
		if (
			!Number.isSafeInteger(input.startTick) ||
			input.startTick < 0 ||
			input.startTick > projectLimits.maxTick ||
			!Number.isSafeInteger(countInBars) ||
			countInBars < 0 ||
			countInBars > engineProtocolLimits.maxRecordingCountInBars
		) {
			return false
		}
		let targetLayerId: ReturnType<typeof layerId>
		try {
			targetLayerId = layerId(input.layerId)
		} catch {
			return false
		}
		const projectSnapshot = session.getSnapshot()
		const target = projectSnapshot.project.layers.find((layer) => layer.id === targetLayerId)
		if (target?.source.type !== 'synth' || target.material.kind !== 'midi') return false
		if (this.#recordingSequence >= Number.MAX_SAFE_INTEGER) return false
		this.#recordingSequence += 1
		const recordingId = `recording.phase9.${String(this.#recordingSequence)}`
		const beatTicks = ticksPerBeatAt(session, input.startTick)
		const active: ActiveRecording = {
			enteredRecording: false,
			historyGroup: `recording:${recordingId}`,
			id: recordingId,
			layerId: targetLayerId,
			lastTrustedTick: input.startTick,
			mutated: false,
			nextCheckpointTick: Math.min(projectLimits.maxTick, input.startTick + beatTicks),
			notes: new Map(),
			projectRevision: projectSnapshot.revision,
			seenInputs: new Set(),
			session,
			startTick: input.startTick
		}
		this.#active = active
		this.#publishActive('starting', 0)
		const accepted = await this.#engine.start({
			countInBars,
			layerId: targetLayerId,
			projectRevision: projectSnapshot.revision,
			recordingId,
			startTick: input.startTick
		})
		if (this.#active !== active) return false
		if (!accepted) {
			this.#releaseActive(null, 'idle')
			return false
		}
		return true
	}

	public noteOn(
		layerIdentity: string,
		auditionId: string,
		pitch: number,
		velocity: number
	): boolean {
		const active = this.#active
		if (!this.acceptsPerformanceInput(layerIdentity) || active === null) return false
		void this.#engine
			.noteOn({ auditionId, pitch, recordingId: active.id, velocity })
			.then((accepted) => {
				if (!accepted && this.#active === active) this.failAtLastTrustedTick()
			})
		return true
	}

	public noteOff(auditionId: string): boolean {
		const active = this.#active
		if (
			active === null ||
			!['starting', 'count-in', 'recording', 'stopping'].includes(this.#snapshot.phase)
		) {
			return false
		}
		void this.#engine.noteOff({ auditionId, recordingId: active.id }).then((accepted) => {
			if (!accepted && this.#active === active) this.failAtLastTrustedTick()
		})
		return true
	}

	public stop(): boolean {
		const active = this.#active
		if (active === null || this.#snapshot.phase === 'stopping') return false
		this.#publishActive('stopping', 0)
		this.#releaseInputs()
		void this.#engine.stop({ recordingId: active.id }).then((accepted) => {
			if (!accepted && this.#active === active) this.failAtLastTrustedTick()
		})
		return true
	}

	public acceptState(payload: EngineEventPayloadByType['recording-state']): boolean {
		const active = this.#matching(payload.recordingId)
		if (active === null) return false
		if (payload.state === 'count-in') {
			if (
				!Number.isSafeInteger(payload.sourceTick) ||
				payload.sourceTick < 0 ||
				payload.sourceTick > projectLimits.maxTick
			) {
				return false
			}
			this.#publishActive(
				this.#snapshot.phase === 'stopping' ? 'stopping' : 'count-in',
				payload.countInBeatsRemaining
			)
			return true
		}
		const enteringRecording = this.#snapshot.phase !== 'recording'
		if (!this.#acceptTrustedTick(active, payload.sourceTick)) return false
		if (enteringRecording && !this.#extendMaterial(active, payload.sourceTick)) return false
		active.enteredRecording = true
		this.#publishActive(
			this.#snapshot.phase === 'stopping' ? 'stopping' : payload.state,
			payload.countInBeatsRemaining
		)
		return true
	}

	public acceptInput(payload: EngineEventPayloadByType['recording-input-applied']): boolean {
		const active = this.#matching(payload.recordingId)
		if (active === null || !this.#acceptTrustedTick(active, payload.sourceTick)) return false
		if (payload.phase === 'note-on') return this.#acceptNoteOn(active, payload)
		return this.#acceptNoteOff(active, payload)
	}

	public acceptStopped(payload: EngineEventPayloadByType['recording-stopped']): boolean {
		const active = this.#matching(payload.recordingId)
		if (active === null) return false
		const stopTick = this.#trustedStopTick(active, payload.stopTick)
		if (stopTick === null) return false
		if (active.enteredRecording) this.#finalizePass(active, stopTick)
		else active.session.endHistoryGroup(active.historyGroup)
		const summary = !active.enteredRecording
			? null
			: {
					endTick: stopTick,
					layerId: active.layerId,
					noteCount: active.notes.size,
					reason: payload.reason,
					recordingId: active.id,
					startTick: active.startTick
				}
		this.#releaseActive(summary, 'idle')
		return true
	}

	public failAtLastTrustedTick(): boolean {
		const active = this.#active
		if (active === null) return false
		this.#releaseInputs()
		if (active.enteredRecording) {
			this.#finalizePass(active, active.lastTrustedTick)
		} else {
			active.session.endHistoryGroup(active.historyGroup)
		}
		const summary = active.mutated
			? {
					endTick: active.lastTrustedTick,
					layerId: active.layerId,
					noteCount: active.notes.size,
					reason: 'interrupted' as const,
					recordingId: active.id,
					startTick: active.startTick
				}
			: null
		this.#releaseActive(summary, 'recovery-required')
		return true
	}

	public recover(): boolean {
		if (this.#snapshot.phase !== 'recovery-required') return false
		this.#snapshot = freezeSnapshot({ ...this.#snapshot, phase: 'idle' })
		this.#emit()
		return true
	}

	#acceptNoteOn(
		active: ActiveRecording,
		payload: EngineEventPayloadByType['recording-input-applied']
	): boolean {
		if (active.seenInputs.has(payload.auditionId)) return false
		if (payload.sourceTick >= projectLimits.maxTick) {
			this.#onDiagnostic('The recording cursor reached the project time limit.')
			this.stop()
			return false
		}
		if (active.seenInputs.size >= projectLimits.maxNotesPerMaterial) {
			this.#onDiagnostic('The recording reached the source-note limit.')
			this.stop()
			return false
		}
		let canonicalNoteId: ReturnType<typeof noteId>
		try {
			canonicalNoteId = noteId(
				`note.recording.${String(this.#recordingSequence)}.${String(active.seenInputs.size + 1)}`
			)
			midiPitch(payload.pitch)
			projectTick(payload.sourceTick)
		} catch {
			this.#onDiagnostic('The engine returned an invalid recording note.')
			this.stop()
			return false
		}
		const note: ActiveRecordingNote = {
			auditionId: payload.auditionId,
			endTick: null,
			noteId: canonicalNoteId,
			pitch: payload.pitch,
			startTick: payload.sourceTick,
			velocity: payload.velocity
		}
		const project = active.session.getSnapshot().project
		const targetMaterial = project.layers.find(({ id }) => id === active.layerId)?.material
		const hasSongInstance = project.song.instances.some(
			({ sourceLayerId }) => sourceLayerId === active.layerId
		)
		if (targetMaterial?.kind !== 'midi') {
			this.#onDiagnostic('The recording target no longer has MIDI source material.')
			this.stop()
			return false
		}
		if (
			!this.#dispatch(active, {
				baseRevision: active.session.getSnapshot().revision,
				...(!hasSongInstance
					? {
							instanceWhenMissing: createSongInstance({
								durationTicks: Math.max(
									targetMaterial.materialLengthTicks,
									payload.sourceTick + 1
								),
								id: songInstanceId(
									`instance.recording.${String(this.#recordingSequence)}`
								),
								sourceLayerId: active.layerId,
								startTick: 0
							})
						}
					: {}),
				layerId: active.layerId,
				note: {
					durationTicks: projectTick(1),
					id: canonicalNoteId,
					pitch: midiPitch(payload.pitch),
					startTick: projectTick(payload.sourceTick),
					velocity: payload.velocity
				},
				type: 'source.note.begin'
			})
		) {
			this.stop()
			return false
		}
		active.seenInputs.add(payload.auditionId)
		active.notes.set(payload.auditionId, note)
		this.#publishActive(this.#snapshot.phase, this.#snapshot.countInBeatsRemaining)
		return true
	}

	#acceptNoteOff(
		active: ActiveRecording,
		payload: EngineEventPayloadByType['recording-input-applied']
	): boolean {
		const note = active.notes.get(payload.auditionId)
		if (note === undefined || note.endTick !== null) return false
		const endTick = Math.max(note.startTick + 1, payload.sourceTick)
		if (
			!this.#dispatch(active, {
				baseRevision: active.session.getSnapshot().revision,
				endTick,
				layerId: active.layerId,
				noteId: note.noteId,
				type: 'source.note.finalize'
			})
		) {
			this.stop()
			return false
		}
		note.endTick = endTick
		this.#publishActive(this.#snapshot.phase, this.#snapshot.countInBeatsRemaining)
		return true
	}

	#acceptTrustedTick(active: ActiveRecording, tick: number): boolean {
		if (
			!Number.isSafeInteger(tick) ||
			tick < active.startTick ||
			tick > projectLimits.maxTick
		) {
			this.#onDiagnostic('The recording cursor reached the project time limit.')
			this.stop()
			return false
		}
		active.lastTrustedTick = Math.max(active.lastTrustedTick, tick)
		if (tick >= active.nextCheckpointTick) {
			if (!this.#extendMaterial(active, tick)) return false
			this.#advanceCheckpoint(active, tick)
		}
		return true
	}

	#advanceCheckpoint(active: ActiveRecording, tick: number): void {
		const beatTicks = ticksPerBeatAt(active.session, tick)
		const remaining = Math.max(0, tick - active.nextCheckpointTick)
		const steps = Math.floor(remaining / beatTicks) + 1
		active.nextCheckpointTick = Math.min(
			projectLimits.maxTick,
			active.nextCheckpointTick + steps * beatTicks
		)
	}

	#trustedStopTick(active: ActiveRecording, tick: number): number | null {
		if (
			!Number.isSafeInteger(tick) ||
			tick < active.startTick ||
			tick > projectLimits.maxTick
		) {
			this.#onDiagnostic('The engine returned an invalid recording stop tick.')
			this.failAtLastTrustedTick()
			return null
		}
		active.lastTrustedTick = Math.max(active.lastTrustedTick, tick)
		return tick
	}

	#finalizePass(active: ActiveRecording, stopTick: number): void {
		for (const note of active.notes.values()) {
			if (note.endTick !== null) continue
			const endTick = Math.max(note.startTick + 1, stopTick)
			if (
				this.#dispatch(active, {
					baseRevision: active.session.getSnapshot().revision,
					endTick,
					layerId: active.layerId,
					noteId: note.noteId,
					type: 'source.note.finalize'
				})
			) {
				note.endTick = endTick
			}
		}
		this.#extendMaterial(active, stopTick)
		active.session.endHistoryGroup(active.historyGroup)
	}

	#extendMaterial(active: ActiveRecording, throughTick: number): boolean {
		return this.#dispatch(active, {
			baseRevision: active.session.getSnapshot().revision,
			layerId: active.layerId,
			throughTick,
			type: 'source.material.extend'
		})
	}

	#dispatch(active: ActiveRecording, command: ProjectCommand): boolean {
		try {
			const before = active.session.getSnapshot().revision
			const after = active.session.dispatch(command, { historyGroup: active.historyGroup })
			active.mutated ||= after.revision !== before
			return true
		} catch (error) {
			this.#onDiagnostic(
				error instanceof Error ? error.message : 'The recording mutation was rejected.'
			)
			return false
		}
	}

	#matching(recordingId: string): ActiveRecording | null {
		return this.#active?.id === recordingId ? this.#active : null
	}

	#publishActive(phase: PerformanceRecordingPhase, countInBeatsRemaining: number): void {
		const active = this.#active
		if (active === null) return
		this.#snapshot = freezeSnapshot({
			countInBeatsRemaining,
			cursorTick: active.lastTrustedTick,
			lastPass: this.#snapshot.lastPass,
			layerId: active.layerId,
			liveNotes: [...active.notes.values()].map(freezeLiveNote),
			phase,
			recordingId: active.id,
			startTick: active.startTick
		})
		this.#emit()
	}

	#releaseActive(
		summary: RecordedPassSummary | null,
		phase: Extract<PerformanceRecordingPhase, 'idle' | 'recovery-required'>
	): void {
		const active = this.#active
		if (active === null) return
		const liveNotes = [...active.notes.values()].map(freezeLiveNote)
		this.#active = null
		this.#snapshot = freezeSnapshot({
			countInBeatsRemaining: 0,
			cursorTick: active.lastTrustedTick,
			lastPass: summary,
			layerId: null,
			liveNotes,
			phase,
			recordingId: null,
			startTick: null
		})
		this.#emit()
		this.#onReleased()
	}

	#emit(): void {
		for (const listener of this.#listeners) listener()
	}
}
