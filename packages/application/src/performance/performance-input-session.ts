import type { PerformanceKeyMapping } from '../../../music-theory/src/index.js'

declare const performanceSourceBrand: unique symbol

export type PerformanceSourceId = string & {
	readonly [performanceSourceBrand]: true
}

export type PerformanceSourceKind = 'keyboard' | 'pointer' | 'preview'

export interface HeldPerformanceKey {
	readonly code: string | null
	readonly pitch: number
	readonly sourceCount: number
}

export interface PerformanceInputSnapshot {
	readonly heldKeys: readonly HeldPerformanceKey[]
	readonly mapping: readonly PerformanceKeyMapping[]
	readonly ownerId: string | null
	readonly revision: number
}

export interface PerformanceVoiceSink {
	noteOff(auditionId: string): void
	noteOn(auditionId: string, pitch: number, velocity: number): void
}

interface HeldSource {
	readonly auditionId: string
	readonly code: string | null
	readonly pitch: number
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

export class PerformanceInputSession {
	readonly #heldSources = new Map<PerformanceSourceId, HeldSource>()
	readonly #listeners = new Set<() => void>()
	readonly #sink: PerformanceVoiceSink
	#auditionSequence = 0
	#mapping: readonly PerformanceKeyMapping[] = Object.freeze([])
	#ownerId: string | null = null
	#revision = 0
	#snapshot: PerformanceInputSnapshot = Object.freeze({
		heldKeys: Object.freeze([]),
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

	public activate(ownerId: string, mapping: readonly PerformanceKeyMapping[]): void {
		assertBoundedIdentity(ownerId, 'Performance owner ID')
		const nextMapping = ownedMapping(mapping)
		if (this.#ownerId === ownerId && sameMapping(this.#mapping, nextMapping)) return
		this.#releaseHeld(false)
		this.#ownerId = ownerId
		this.#mapping = nextMapping
		this.#publish()
	}

	public remap(ownerId: string, mapping: readonly PerformanceKeyMapping[]): boolean {
		if (this.#ownerId !== ownerId) return false
		const nextMapping = ownedMapping(mapping)
		if (sameMapping(this.#mapping, nextMapping)) return false
		this.#releaseHeld(false)
		this.#mapping = nextMapping
		this.#publish()
		return true
	}

	public deactivate(ownerId: string): boolean {
		if (this.#ownerId !== ownerId) return false
		this.#releaseHeld(false)
		this.#ownerId = null
		this.#mapping = Object.freeze([])
		this.#publish()
		return true
	}

	public pressCode(
		ownerId: string,
		sourceId: PerformanceSourceId,
		code: string,
		velocity = 102
	): boolean {
		if (this.#ownerId !== ownerId) return false
		const key = this.#mapping.find((candidate) => candidate.code === code)
		return key === undefined
			? false
			: this.pressPitch(ownerId, sourceId, key.midi, key.code, velocity)
	}

	public pressPitch(
		ownerId: string,
		sourceId: PerformanceSourceId,
		pitch: number,
		code: string | null = null,
		velocity = 102
	): boolean {
		if (this.#ownerId !== ownerId || this.#heldSources.has(sourceId)) return false
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
			throw new RangeError('Performance pitch must be an integer from 0 through 127.')
		}
		if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
			throw new RangeError('Performance velocity must be an integer from 1 through 127.')
		}
		this.#auditionSequence += 1
		const auditionId = `performance-${String(this.#auditionSequence)}`
		this.#heldSources.set(sourceId, { auditionId, code, pitch })
		this.#sink.noteOn(auditionId, pitch, velocity)
		this.#publish()
		return true
	}

	public releaseSource(sourceId: PerformanceSourceId): boolean {
		const held = this.#heldSources.get(sourceId)
		if (held === undefined) return false
		this.#heldSources.delete(sourceId)
		this.#sink.noteOff(held.auditionId)
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
		for (const { auditionId } of this.#heldSources.values()) this.#sink.noteOff(auditionId)
		this.#heldSources.clear()
		if (publish) this.#publish()
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
