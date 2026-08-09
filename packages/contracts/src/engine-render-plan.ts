import {
	engineProtocolLimits,
	type EngineDiagnosticCode
} from './generated/engine-protocol.generated.js'

export const engineRenderPlanVersion = 1 as const
export const enginePatchModelVersion = 1 as const
export const engineTicksPerQuarter = 960 as const

export interface EngineWireTempoPoint {
	readonly microBpm: number
	readonly tick: number
}

export interface EngineWireLoop {
	readonly enabled: boolean
	readonly endTick: number
	readonly startTick: number
}

export interface EngineWireBassPatchV1 {
	readonly amplifier: {
		readonly attackMs: number
		readonly decayMs: number
		readonly releaseMs: number
		readonly sustain: number
	}
	readonly drive: number
	readonly filter: {
		readonly cutoffHz: number
		readonly envelopeAmount: number
		readonly resonance: number
	}
	readonly oscillator: {
		readonly detuneCents: number
		readonly subLevel: number
	}
	readonly outputGain: number
	readonly patchModelVersion: typeof enginePatchModelVersion
	readonly stereoWidth: number
}

export interface EngineWireMidiNote {
	readonly durationTicks: number
	readonly id: string
	readonly pitch: number
	readonly startTick: number
	readonly velocity: number
}

export interface EngineWireBassLayer {
	readonly events: readonly EngineWireMidiNote[]
	readonly gain: number
	readonly id: string
	readonly pan: number
	readonly source: {
		readonly patch: EngineWireBassPatchV1
		readonly type: 'subtractive-bass'
	}
}

export interface EngineWireRenderPlan {
	readonly layers: readonly EngineWireBassLayer[]
	readonly loop: EngineWireLoop
	readonly planVersion: typeof engineRenderPlanVersion
	readonly projectId: string
	readonly projectRevision: number
	readonly tempoMap: readonly EngineWireTempoPoint[]
	readonly ticksPerQuarter: typeof engineTicksPerQuarter
}

export type EngineWireRenderPlanResult =
	| { readonly ok: true; readonly value: EngineWireRenderPlan }
	| {
			readonly diagnostic: EngineDiagnosticCode
			readonly message: string
			readonly ok: false
	  }

function failure(
	diagnostic: EngineDiagnosticCode,
	message: string
): Exclude<EngineWireRenderPlanResult, { readonly ok: true }> {
	return Object.freeze({ ok: false as const, diagnostic, message })
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value)
	return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function wireInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function finiteRange(value: unknown, minimum: number, maximum: number): value is number {
	return (
		typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
	)
}

function stableId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		new TextEncoder().encode(value).byteLength <= engineProtocolLimits.maxIdentifierBytes &&
		/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
	)
}

function validPatch(value: unknown): value is EngineWireBassPatchV1 {
	if (
		!record(value) ||
		!exactKeys(value, [
			'patchModelVersion',
			'oscillator',
			'filter',
			'amplifier',
			'drive',
			'stereoWidth',
			'outputGain'
		]) ||
		value.patchModelVersion !== enginePatchModelVersion ||
		!record(value.oscillator) ||
		!exactKeys(value.oscillator, ['detuneCents', 'subLevel']) ||
		!finiteRange(value.oscillator.detuneCents, -100, 100) ||
		!finiteRange(value.oscillator.subLevel, 0, 1) ||
		!record(value.filter) ||
		!exactKeys(value.filter, ['cutoffHz', 'envelopeAmount', 'resonance']) ||
		!finiteRange(value.filter.cutoffHz, 20, 24_000) ||
		!finiteRange(value.filter.envelopeAmount, 0, 1) ||
		!finiteRange(value.filter.resonance, 0, 1) ||
		!record(value.amplifier) ||
		!exactKeys(value.amplifier, ['attackMs', 'decayMs', 'releaseMs', 'sustain']) ||
		!finiteRange(value.amplifier.attackMs, 0, 60_000) ||
		!finiteRange(value.amplifier.decayMs, 0, 60_000) ||
		!finiteRange(value.amplifier.releaseMs, 0, 60_000) ||
		!finiteRange(value.amplifier.sustain, 0, 1) ||
		!finiteRange(value.drive, 0, 1) ||
		!finiteRange(value.stereoWidth, 0, 1) ||
		!finiteRange(value.outputGain, 0, 2)
	) {
		return false
	}
	return true
}

function validEvent(value: unknown): value is EngineWireMidiNote {
	if (
		!record(value) ||
		!exactKeys(value, ['id', 'startTick', 'durationTicks', 'pitch', 'velocity'])
	) {
		return false
	}
	return (
		stableId(value.id) &&
		wireInteger(value.startTick) &&
		wireInteger(value.durationTicks) &&
		value.durationTicks > 0 &&
		Number.isSafeInteger(value.startTick + value.durationTicks) &&
		wireInteger(value.pitch) &&
		value.pitch <= 127 &&
		wireInteger(value.velocity) &&
		value.velocity >= 1 &&
		value.velocity <= 127
	)
}

export function validateEngineWireRenderPlan(input: unknown): EngineWireRenderPlanResult {
	if (
		!record(input) ||
		!exactKeys(input, [
			'planVersion',
			'projectId',
			'projectRevision',
			'ticksPerQuarter',
			'tempoMap',
			'loop',
			'layers'
		]) ||
		input.planVersion !== engineRenderPlanVersion ||
		!stableId(input.projectId) ||
		!wireInteger(input.projectRevision) ||
		input.ticksPerQuarter !== engineTicksPerQuarter
	) {
		return failure('engine.invalid-plan', 'Engine render-plan header is invalid.')
	}
	if (
		!Array.isArray(input.tempoMap) ||
		input.tempoMap.length === 0 ||
		input.tempoMap.length > engineProtocolLimits.maxTempoPoints
	) {
		return failure('engine.limit-exceeded', 'Engine tempo-map ceiling was exceeded.')
	}
	let previousTick = -1
	for (const [index, point] of input.tempoMap.entries()) {
		if (
			!record(point) ||
			!exactKeys(point, ['tick', 'microBpm']) ||
			!wireInteger(point.tick) ||
			!wireInteger(point.microBpm) ||
			point.microBpm < 20_000_000 ||
			point.microBpm > 400_000_000 ||
			point.tick <= previousTick ||
			(index === 0 && point.tick !== 0)
		) {
			return failure('engine.invalid-plan', 'Engine tempo map is invalid or unordered.')
		}
		previousTick = point.tick
	}
	if (
		!record(input.loop) ||
		!exactKeys(input.loop, ['enabled', 'startTick', 'endTick']) ||
		typeof input.loop.enabled !== 'boolean' ||
		!wireInteger(input.loop.startTick) ||
		!wireInteger(input.loop.endTick) ||
		input.loop.startTick >= input.loop.endTick
	) {
		return failure('engine.invalid-plan', 'Engine loop is invalid.')
	}
	if (
		!Array.isArray(input.layers) ||
		input.layers.length > engineProtocolLimits.maxEngineLayers
	) {
		return failure('engine.limit-exceeded', 'Engine layer ceiling was exceeded.')
	}
	const ids = new Set<string>()
	let eventCount = 0
	for (const layer of input.layers) {
		if (
			!record(layer) ||
			!exactKeys(layer, ['id', 'gain', 'pan', 'source', 'events']) ||
			!stableId(layer.id) ||
			ids.has(layer.id) ||
			!finiteRange(layer.gain, 0, 2) ||
			!finiteRange(layer.pan, -1, 1) ||
			!record(layer.source) ||
			!exactKeys(layer.source, ['type', 'patch'])
		) {
			return failure('engine.invalid-plan', 'Engine layer is invalid.')
		}
		ids.add(layer.id)
		if (layer.source.type !== 'subtractive-bass') {
			return failure(
				'engine.unsupported-source',
				'Engine source is not available in Stage 4.'
			)
		}
		if (!validPatch(layer.source.patch)) {
			return failure('engine.invalid-plan', 'Resolved Bass patch is invalid.')
		}
		if (!Array.isArray(layer.events)) {
			return failure('engine.invalid-plan', 'Engine layer events are invalid.')
		}
		eventCount += layer.events.length
		if (eventCount > engineProtocolLimits.maxMusicalEvents) {
			return failure('engine.limit-exceeded', 'Engine musical-event ceiling was exceeded.')
		}
		let previous: EngineWireMidiNote | null = null
		for (const event of layer.events) {
			if (!validEvent(event) || ids.has(event.id)) {
				return failure('engine.invalid-plan', 'Engine MIDI event is invalid or duplicated.')
			}
			if (
				previous !== null &&
				(previous.startTick > event.startTick ||
					(previous.startTick === event.startTick && previous.id > event.id))
			) {
				return failure('engine.invalid-plan', 'Engine MIDI events are not stably ordered.')
			}
			ids.add(event.id)
			previous = event
		}
	}
	return Object.freeze({ ok: true as const, value: input as unknown as EngineWireRenderPlan })
}
