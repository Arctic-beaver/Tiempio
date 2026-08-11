import type { EnginePreviewEvent } from '../../../contracts/src/index.js'

export type AuditionPreviewKind = 'chord' | 'palette' | 'sound'

export interface AuditionPreviewSnapshot {
	readonly active: boolean
	readonly kind: AuditionPreviewKind | null
	readonly pitches: readonly number[]
	readonly previewId: string | null
	readonly revision: number
	readonly status: 'idle' | 'pending' | 'playing'
}

export interface AuditionPreviewSink {
	cancel(previewId: string): void
	start(program: {
		readonly events: readonly EnginePreviewEvent[]
		readonly previewId: string
		readonly programVersion: 1
	}): boolean
}

const idlePitches = Object.freeze<readonly number[]>([])

function ownedEvents(events: readonly EnginePreviewEvent[]): readonly EnginePreviewEvent[] {
	return Object.freeze(
		events.map((event) =>
			Object.freeze({
				...event,
				pitches: Object.freeze([...event.pitches])
			})
		)
	)
}

export class AuditionPreviewCoordinator {
	readonly #listeners = new Set<() => void>()
	readonly #pitchCounts = new Map<number, number>()
	readonly #sink: AuditionPreviewSink
	#sequence = 0
	#snapshot: AuditionPreviewSnapshot = Object.freeze({
		active: false,
		kind: null,
		pitches: idlePitches,
		previewId: null,
		revision: 0,
		status: 'idle'
	})

	public constructor(sink: AuditionPreviewSink) {
		this.#sink = sink
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): AuditionPreviewSnapshot => this.#snapshot

	public start(kind: AuditionPreviewKind, events: readonly EnginePreviewEvent[]): string | null {
		if (this.#sequence >= Number.MAX_SAFE_INTEGER) return null
		const previous = this.#snapshot.previewId
		if (previous !== null) this.#sink.cancel(previous)
		this.#sequence += 1
		const previewId = `preview-${kind}-${String(this.#sequence)}`
		const accepted = this.#sink.start({
			events: ownedEvents(events),
			previewId,
			programVersion: 1
		})
		if (!accepted) {
			if (previous !== null) this.#publishIdle()
			return null
		}
		this.#pitchCounts.clear()
		this.#publish({
			active: true,
			kind,
			pitches: idlePitches,
			previewId,
			status: 'pending'
		})
		return previewId
	}

	public interrupt(): boolean {
		const previewId = this.#snapshot.previewId
		if (previewId === null) return false
		this.#sink.cancel(previewId)
		this.#publishIdle()
		return true
	}

	public reset(): boolean {
		if (this.#snapshot.previewId === null) return false
		this.#publishIdle()
		return true
	}

	public acceptStarted(previewId: string): boolean {
		if (previewId !== this.#snapshot.previewId) return false
		this.#publish({ ...this.#snapshot, status: 'playing' })
		return true
	}

	public acceptState(previewId: string, pitches: readonly number[], active: boolean): boolean {
		if (previewId !== this.#snapshot.previewId) return false
		for (const pitch of pitches) {
			const count = this.#pitchCounts.get(pitch) ?? 0
			if (active) this.#pitchCounts.set(pitch, count + 1)
			else if (count <= 1) this.#pitchCounts.delete(pitch)
			else this.#pitchCounts.set(pitch, count - 1)
		}
		this.#publish({
			...this.#snapshot,
			pitches: Object.freeze(
				[...this.#pitchCounts.keys()].sort((left, right) => left - right)
			),
			status: 'playing'
		})
		return true
	}

	public acceptEnded(previewId: string): boolean {
		if (previewId !== this.#snapshot.previewId) return false
		this.#publishIdle()
		return true
	}

	#publishIdle(): void {
		this.#pitchCounts.clear()
		this.#publish({
			active: false,
			kind: null,
			pitches: idlePitches,
			previewId: null,
			status: 'idle'
		})
	}

	#publish(snapshot: Omit<AuditionPreviewSnapshot, 'revision'>): void {
		this.#snapshot = Object.freeze({ ...snapshot, revision: this.#snapshot.revision + 1 })
		for (const listener of this.#listeners) listener()
	}
}
