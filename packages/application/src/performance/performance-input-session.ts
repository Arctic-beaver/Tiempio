import type { PerformanceKeyMapping } from '../../../music-theory/src/index.js'

declare const performanceSourceBrand: unique symbol

export type PerformanceSourceId = string & {
	readonly [performanceSourceBrand]: true
}

export type PerformanceSourceKind = 'keyboard' | 'midi' | 'pointer' | 'preview'

export interface PerformanceInputEvent {
	readonly auditionId: string
	readonly layerId: string
	readonly phase: 'note-on' | 'note-off'
	readonly pitch: number
	readonly sourceId: PerformanceSourceId
	readonly sourceKind: PerformanceSourceKind
	readonly sourceTimestamp: number | null
	readonly velocity: number
}

export interface HeldPerformanceKey {
	readonly code: string | null
	readonly pitch: number
	readonly sourceCount: number
}

export interface PerformanceInputSnapshot {
	readonly heldKeys: readonly HeldPerformanceKey[]
	readonly mapping: readonly PerformanceKeyMapping[]
	readonly layerId: string | null
	readonly ownerId: string | null
	readonly revision: number
}

export interface PerformanceVoiceSink {
	input(event: PerformanceInputEvent): void
}

interface HeldSource {
	readonly auditionId: string
	readonly code: string | null
	readonly layerId: string
	readonly pitch: number
	readonly sourceId: PerformanceSourceId
	readonly sourceKind: PerformanceSourceKind
	readonly sourceTimestamp: number | null
	readonly velocity: number
}

function assertBoundedIdentity(value: string, label: string): void {
	if (value.length === 0 || value.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
		throw new TypeError(`${label} must be a bounded protocol-safe identifier.`)
	}
}

function ownedMapping(mapping: readonly PerformanceKeyMapping[]): readonly PerformanceKeyMapping[] {
	const codes = new Set<string>()
	return Object.freeze(
		mapping.map((key) => {
			if (codes.has(key.code)) {
				throw new TypeError('Performance mapping codes must be unique.')
			}
			if (!Number.isInteger(key.midi) || key.midi < 0 || key.midi > 127) {
				throw new RangeError('Performance mapping pitches must stay inside MIDI bounds.')
			}
			codes.add(key.code)
			return Object.freeze({ ...key })
		})
	)
}

function sameMapping(
	left: readonly PerformanceKeyMapping[],
	right: readonly PerformanceKeyMapping[]
): boolean {
	return (
		left.length === right.length &&
		left.every((key, index) => {
			const candidate = right[index]
			return candidate?.code === key.code && candidate.midi === key.midi
		})
	)
}

export function performanceSourceId(
	kind: PerformanceSourceKind,
	identity: string | number
): PerformanceSourceId {
	const value = `${kind}:${String(identity)}`
	assertBoundedIdentity(value, 'Performance source ID')
	return value as PerformanceSourceId
}

export function performanceSourceKind(sourceId: PerformanceSourceId): PerformanceSourceKind {
	const separator = sourceId.indexOf(':')
	const kind = separator < 0 ? '' : sourceId.slice(0, separator)
	if (kind === 'keyboard' || kind === 'midi' || kind === 'pointer' || kind === 'preview') {
		return kind
	}
	throw new TypeError('Performance source ID has an unknown source kind.')
}

function normalizedSourceTimestamp(sourceTimestamp: number | null): number | null {
	return sourceTimestamp !== null && Number.isFinite(sourceTimestamp) && sourceTimestamp >= 0
		? sourceTimestamp
		: null
}

function freezeInputEvent(event: PerformanceInputEvent): PerformanceInputEvent {
	return Object.freeze(event)
}

export class PerformanceInputSession {
	readonly #heldSources = new Map<PerformanceSourceId, HeldSource>()
	readonly #listeners = new Set<() => void>()
	readonly #sink: PerformanceVoiceSink
	#auditionSequence = 0
	#mapping: readonly PerformanceKeyMapping[] = Object.freeze([])
	#layerId: string | null = null
	#ownerId: string | null = null
	#revision = 0
	#snapshot: PerformanceInputSnapshot = Object.freeze({
		heldKeys: Object.freeze([]),
		layerId: null,
		mapping: Object.freeze([]),
		ownerId: null,
		revision: 0
	})

	public constructor(sink: PerformanceVoiceSink) {
		this.#sink = sink
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): PerformanceInputSnapshot => this.#snapshot

	public activate(
		ownerId: string,
		layerId: string,
		mapping: readonly PerformanceKeyMapping[]
	): void {
		assertBoundedIdentity(ownerId, 'Performance owner ID')
		assertBoundedIdentity(layerId, 'Performance layer ID')
		const nextMapping = ownedMapping(mapping)
		if (
			this.#ownerId === ownerId &&
			this.#layerId === layerId &&
			sameMapping(this.#mapping, nextMapping)
		)
			return
		this.#releaseHeld(false)
		this.#ownerId = ownerId
		this.#layerId = layerId
		this.#mapping = nextMapping
		this.#publish()
	}

	public remap(
		ownerId: string,
		layerId: string,
		mapping: readonly PerformanceKeyMapping[]
	): boolean {
		if (this.#ownerId !== ownerId) return false
		assertBoundedIdentity(layerId, 'Performance layer ID')
		const nextMapping = ownedMapping(mapping)
		if (this.#layerId === layerId && sameMapping(this.#mapping, nextMapping)) return false
		this.#releaseHeld(false)
		this.#layerId = layerId
		this.#mapping = nextMapping
		this.#publish()
		return true
	}

	public deactivate(ownerId: string): boolean {
		if (this.#ownerId !== ownerId) return false
		this.#releaseHeld(false)
		this.#ownerId = null
		this.#layerId = null
		this.#mapping = Object.freeze([])
		this.#publish()
		return true
	}

	public pressCode(
		ownerId: string,
		sourceId: PerformanceSourceId,
		code: string,
		velocity = 102,
		sourceTimestamp: number | null = null
	): boolean {
		if (this.#ownerId !== ownerId) return false
		const key = this.#mapping.find((candidate) => candidate.code === code)
		return key === undefined
			? false
			: this.pressPitch(ownerId, sourceId, key.midi, key.code, velocity, sourceTimestamp)
	}

	public pressPitch(
		ownerId: string,
		sourceId: PerformanceSourceId,
		pitch: number,
		code: string | null = null,
		velocity = 102,
		sourceTimestamp: number | null = null
	): boolean {
		if (this.#ownerId !== ownerId || this.#layerId === null || this.#heldSources.has(sourceId))
			return false
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
			throw new RangeError('Performance pitch must be an integer from 0 through 127.')
		}
		if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
			throw new RangeError('Performance velocity must be an integer from 1 through 127.')
		}
		if (this.#auditionSequence >= Number.MAX_SAFE_INTEGER) return false
		this.#auditionSequence += 1
		const auditionId = `performance-${String(this.#auditionSequence)}`
		const sourceKind = performanceSourceKind(sourceId)
		const held: HeldSource = {
			auditionId,
			code,
			layerId: this.#layerId,
			pitch,
			sourceId,
			sourceKind,
			sourceTimestamp: normalizedSourceTimestamp(sourceTimestamp),
			velocity
		}
		this.#heldSources.set(sourceId, held)
		this.#sink.input(
			freezeInputEvent({
				auditionId: held.auditionId,
				layerId: held.layerId,
				phase: 'note-on',
				pitch: held.pitch,
				sourceId: held.sourceId,
				sourceKind: held.sourceKind,
				sourceTimestamp: held.sourceTimestamp,
				velocity: held.velocity
			})
		)
		this.#publish()
		return true
	}

	public releaseSource(
		sourceId: PerformanceSourceId,
		sourceTimestamp: number | null = null
	): boolean {
		const held = this.#heldSources.get(sourceId)
		if (held === undefined) return false
		this.#heldSources.delete(sourceId)
		this.#publishNoteOff(held, sourceTimestamp)
		this.#publish()
		return true
	}

	public releaseAll(): boolean {
		if (this.#heldSources.size === 0) return false
		this.#releaseHeld(false)
		this.#publish()
		return true
	}

	#releaseHeld(publish: boolean): void {
		for (const held of this.#heldSources.values()) this.#publishNoteOff(held, null)
		this.#heldSources.clear()
		if (publish) this.#publish()
	}

	#publishNoteOff(held: HeldSource, sourceTimestamp: number | null): void {
		this.#sink.input(
			freezeInputEvent({
				auditionId: held.auditionId,
				layerId: held.layerId,
				phase: 'note-off',
				pitch: held.pitch,
				sourceId: held.sourceId,
				sourceKind: held.sourceKind,
				sourceTimestamp: normalizedSourceTimestamp(sourceTimestamp),
				velocity: held.velocity
			})
		)
	}

	#publish(): void {
		this.#revision += 1
		const aggregate = new Map<string, HeldPerformanceKey>()
		for (const { code, pitch } of this.#heldSources.values()) {
			const key = `${code ?? ''}:${String(pitch)}`
			const current = aggregate.get(key)
			aggregate.set(key, {
				code,
				pitch,
				sourceCount: (current?.sourceCount ?? 0) + 1
			})
		}
		this.#snapshot = Object.freeze({
			ownerId: this.#ownerId,
			layerId: this.#layerId,
			mapping: this.#mapping,
			revision: this.#revision,
			heldKeys: Object.freeze(
				[...aggregate.values()]
					.sort((left, right) => left.pitch - right.pitch)
					.map((key) => Object.freeze(key))
			)
		})
		for (const listener of this.#listeners) listener()
	}
}
