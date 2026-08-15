import { engineProtocolLimits } from '../../../contracts/src/index.js'

export interface BrickPreviewCursorSnapshot {
	readonly cycleIteration: number
	readonly engineFrame: number
	readonly localTick: number
	readonly previewGeneration: number
	readonly renderPlanRevision: number
	readonly running: boolean
	readonly sequence: number
	readonly sourceLayerId: string
}

export interface BrickPreviewSessionSnapshot {
	readonly cursors: readonly BrickPreviewCursorSnapshot[]
	readonly enabledSourceLayerIds: readonly string[]
	readonly previewGeneration: number | null
	readonly renderPlanRevision: number | null
	readonly revision: number
	readonly status: 'idle' | 'pending' | 'running'
}

export interface BrickPreviewSessionSink {
	seekSource(payload: {
		readonly cycleIteration: number
		readonly localTick: number
		readonly previewGeneration: number
		readonly running: boolean
		readonly sourceLayerId: string
	}): void
	setSourceEnabled(payload: {
		readonly enabled: boolean
		readonly previewGeneration: number
		readonly sourceLayerId: string
	}): void
	start(payload: {
		readonly previewGeneration: number
		readonly renderPlanRevision: number
		readonly sourceLayerIds: readonly string[]
	}): boolean
	stop(payload: { readonly previewGeneration: number }): void
}

export interface BrickPreviewCursorProjection {
	readonly cycleIteration: number
	readonly localTick: number
}

export type BrickPreviewCursorAdvance = (
	localTick: number,
	cycleIteration: number,
	elapsedFrames: number,
	renderPlanRevision: number
) => BrickPreviewCursorProjection

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

function validSourceId(value: string): boolean {
	return (
		value.length > 0 &&
		value.length <= engineProtocolLimits.maxIdentifierBytes &&
		stableIdPattern.test(value)
	)
}

function ownedIds(sourceLayerIds: readonly string[]): readonly string[] | null {
	if (
		sourceLayerIds.length > engineProtocolLimits.maxEngineLayers ||
		new Set(sourceLayerIds).size !== sourceLayerIds.length ||
		!sourceLayerIds.every(validSourceId)
	) {
		return null
	}
	return Object.freeze([...sourceLayerIds].sort())
}

function freezeCursor(cursor: BrickPreviewCursorSnapshot): BrickPreviewCursorSnapshot {
	return Object.freeze({ ...cursor })
}

export function interpolateBrickPreviewCursor(
	cursor: BrickPreviewCursorSnapshot,
	targetEngineFrame: number,
	advance: BrickPreviewCursorAdvance
): BrickPreviewCursorProjection {
	if (
		!cursor.running ||
		!Number.isSafeInteger(targetEngineFrame) ||
		targetEngineFrame <= cursor.engineFrame
	) {
		return Object.freeze({
			localTick: cursor.localTick,
			cycleIteration: cursor.cycleIteration
		})
	}
	const projected = advance(
		cursor.localTick,
		cursor.cycleIteration,
		targetEngineFrame - cursor.engineFrame,
		cursor.renderPlanRevision
	)
	if (
		!Number.isSafeInteger(projected.localTick) ||
		projected.localTick < 0 ||
		!Number.isSafeInteger(projected.cycleIteration) ||
		projected.cycleIteration < cursor.cycleIteration
	) {
		return Object.freeze({
			localTick: cursor.localTick,
			cycleIteration: cursor.cycleIteration
		})
	}
	return Object.freeze({ ...projected })
}

export class BrickPreviewSession {
	readonly #listeners = new Set<() => void>()
	readonly #sink: BrickPreviewSessionSink
	readonly #enabled = new Set<string>()
	readonly #cursors = new Map<string, BrickPreviewCursorSnapshot>()
	#generation = 0
	#snapshot: BrickPreviewSessionSnapshot = Object.freeze({
		cursors: Object.freeze([]),
		enabledSourceLayerIds: Object.freeze([]),
		previewGeneration: null,
		renderPlanRevision: null,
		revision: 0,
		status: 'idle'
	})

	public constructor(sink: BrickPreviewSessionSink) {
		this.#sink = sink
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): BrickPreviewSessionSnapshot => this.#snapshot

	public start(renderPlanRevision: number, sourceLayerIds: readonly string[]): boolean {
		const ids = ownedIds(sourceLayerIds)
		if (
			ids === null ||
			!Number.isSafeInteger(renderPlanRevision) ||
			renderPlanRevision < 0 ||
			this.#generation >= Number.MAX_SAFE_INTEGER
		) {
			return false
		}
		this.stop()
		const previewGeneration = this.#generation + 1
		if (
			!this.#sink.start({
				previewGeneration,
				renderPlanRevision,
				sourceLayerIds: ids
			})
		) {
			return false
		}
		this.#generation = previewGeneration
		this.#enabled.clear()
		for (const id of ids) this.#enabled.add(id)
		this.#cursors.clear()
		this.#publish('pending', previewGeneration, renderPlanRevision)
		return true
	}

	public stop(): boolean {
		const generation = this.#snapshot.previewGeneration
		if (generation === null) return false
		this.#sink.stop({ previewGeneration: generation })
		this.#cursors.clear()
		this.#publish('idle', null, null)
		return true
	}

	public reset(): boolean {
		if (this.#snapshot.previewGeneration === null && this.#cursors.size === 0) return false
		this.#cursors.clear()
		this.#publish('idle', null, null)
		return true
	}

	public setSourceEnabled(sourceLayerId: string, enabled: boolean): boolean {
		if (!validSourceId(sourceLayerId) || this.#enabled.has(sourceLayerId) === enabled) {
			return false
		}
		if (enabled && this.#enabled.size >= engineProtocolLimits.maxEngineLayers) return false
		if (enabled) this.#enabled.add(sourceLayerId)
		else {
			this.#enabled.delete(sourceLayerId)
			this.#cursors.delete(sourceLayerId)
		}
		const generation = this.#snapshot.previewGeneration
		if (generation !== null) {
			this.#sink.setSourceEnabled({
				previewGeneration: generation,
				sourceLayerId,
				enabled
			})
		}
		this.#publish(
			this.#snapshot.status,
			this.#snapshot.previewGeneration,
			this.#snapshot.renderPlanRevision
		)
		return true
	}

	public seekSource(
		sourceLayerId: string,
		localTick: number,
		running: boolean,
		cycleIteration?: number
	): boolean {
		const generation = this.#snapshot.previewGeneration
		const cursor = this.#cursors.get(sourceLayerId)
		const iteration = cycleIteration ?? cursor?.cycleIteration ?? 0
		if (
			generation === null ||
			!this.#enabled.has(sourceLayerId) ||
			!Number.isSafeInteger(localTick) ||
			localTick < 0 ||
			!Number.isSafeInteger(iteration) ||
			iteration < 0
		) {
			return false
		}
		this.#sink.seekSource({
			previewGeneration: generation,
			sourceLayerId,
			localTick,
			cycleIteration: iteration,
			running
		})
		return true
	}

	public suspendSource(sourceLayerId: string): boolean {
		const cursor = this.#cursors.get(sourceLayerId)
		return cursor?.running === true
			? this.seekSource(sourceLayerId, cursor.localTick, false, cursor.cycleIteration)
			: false
	}

	public acceptStarted(previewGeneration: number, renderPlanRevision: number): boolean {
		if (
			previewGeneration !== this.#snapshot.previewGeneration ||
			renderPlanRevision !== this.#snapshot.renderPlanRevision
		) {
			return false
		}
		this.#publish('running', previewGeneration, renderPlanRevision)
		return true
	}

	public acceptCursor(
		cursor: Omit<BrickPreviewCursorSnapshot, 'sequence'>,
		sequence: number
	): boolean {
		const previous = this.#cursors.get(cursor.sourceLayerId)
		if (
			cursor.previewGeneration !== this.#snapshot.previewGeneration ||
			cursor.renderPlanRevision !== this.#snapshot.renderPlanRevision ||
			!this.#enabled.has(cursor.sourceLayerId) ||
			!Number.isSafeInteger(sequence) ||
			sequence <= (previous?.sequence ?? -1) ||
			cursor.engineFrame < (previous?.engineFrame ?? 0)
		) {
			return false
		}
		this.#cursors.set(cursor.sourceLayerId, freezeCursor({ ...cursor, sequence }))
		this.#publish('running', cursor.previewGeneration, cursor.renderPlanRevision)
		return true
	}

	public acceptEnded(previewGeneration: number): boolean {
		if (previewGeneration !== this.#snapshot.previewGeneration) return false
		this.#cursors.clear()
		this.#publish('idle', null, null)
		return true
	}

	#publish(
		status: BrickPreviewSessionSnapshot['status'],
		previewGeneration: number | null,
		renderPlanRevision: number | null
	): void {
		this.#snapshot = Object.freeze({
			cursors: Object.freeze(
				[...this.#cursors.values()].sort((left, right) =>
					left.sourceLayerId.localeCompare(right.sourceLayerId)
				)
			),
			enabledSourceLayerIds: Object.freeze([...this.#enabled].sort()),
			previewGeneration,
			renderPlanRevision,
			revision: this.#snapshot.revision + 1,
			status
		})
		for (const listener of this.#listeners) listener()
	}
}
