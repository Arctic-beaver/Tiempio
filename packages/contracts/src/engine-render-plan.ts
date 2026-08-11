import {
	engineProtocolLimits,
	type EngineDiagnosticCode
} from './generated/engine-protocol.generated.js'

export const engineRenderPlanVersion = 3 as const
export const enginePatchModelVersion = 2 as const
export const engineTicksPerQuarter = 960 as const

export type EngineWireSynthWaveform = 'saw' | 'square' | 'triangle' | 'sine'
export type EngineWireDrumInstrument = 'kick' | 'clap' | 'closedHat' | 'openHat' | 'perc'

export interface EngineWireTempoPoint {
	readonly microBpm: number
	readonly tick: number
}

export interface EngineWireMeterPoint {
	readonly denominator: 1 | 2 | 4 | 8 | 16
	readonly numerator: number
	readonly tick: number
}

export interface EngineWireLoop {
	readonly enabled: boolean
	readonly endTick: number
	readonly startTick: number
}

export interface EngineWireSynthPatchV2 {
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
	readonly movement: {
		readonly depth: number
		readonly rateHz: number
	}
	readonly oscillator: {
		readonly detuneCents: number
		readonly noiseLevel: number
		readonly pulseWidth: number
		readonly subLevel: number
		readonly waveform: EngineWireSynthWaveform
	}
	readonly outputGain: number
	readonly patchModelVersion: typeof enginePatchModelVersion
	readonly stereoWidth: number
}

export interface EngineWireDrumVoicePatchV2 {
	readonly algorithm: 'kick' | 'clap' | 'closed-hat' | 'open-hat' | 'perc'
	readonly decayMs: number
	readonly drive: number
	readonly gain: number
	readonly noise: number
	readonly pitchHz: number
	readonly tone: number
}

export interface EngineWireDrumKitPatchV2 {
	readonly patchModelVersion: typeof enginePatchModelVersion
	readonly voices: Readonly<Record<EngineWireDrumInstrument, EngineWireDrumVoicePatchV2>>
}

export interface EngineWireMidiNote {
	readonly durationTicks: number
	readonly id: string
	readonly pitch: number
	readonly startTick: number
	readonly velocity: number
}

export interface EngineWireDrumHit {
	readonly id: string
	readonly instrument: EngineWireDrumInstrument
	readonly startTick: number
	readonly swingTicks: number
	readonly velocity: number
}

export interface EngineWireSynthLayer {
	readonly events: readonly EngineWireMidiNote[]
	readonly gain: number
	readonly id: string
	readonly pan: number
	readonly source: {
		readonly patch: EngineWireSynthPatchV2
		readonly type: 'subtractive-synth'
	}
}

export interface EngineWireDrumLayer {
	readonly events: readonly EngineWireDrumHit[]
	readonly gain: number
	readonly id: string
	readonly pan: number
	readonly source: {
		readonly patch: EngineWireDrumKitPatchV2
		readonly type: 'procedural-drums'
	}
}

export type EngineWireLayer = EngineWireSynthLayer | EngineWireDrumLayer

export interface EngineWireRenderPlan {
	readonly endTick: number
	readonly layers: readonly EngineWireLayer[]
	readonly loop: EngineWireLoop
	readonly meterMap: readonly EngineWireMeterPoint[]
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

function validAmplifier(value: unknown): boolean {
	return (
		record(value) &&
		exactKeys(value, ['attackMs', 'decayMs', 'releaseMs', 'sustain']) &&
		finiteRange(value.attackMs, 0, 60_000) &&
		finiteRange(value.decayMs, 0, 60_000) &&
		finiteRange(value.releaseMs, 0, 60_000) &&
		finiteRange(value.sustain, 0, 1)
	)
}

function validSynthPatch(value: unknown): value is EngineWireSynthPatchV2 {
	if (
		!record(value) ||
		!exactKeys(value, [
			'patchModelVersion',
			'oscillator',
			'filter',
			'amplifier',
			'movement',
			'drive',
			'stereoWidth',
			'outputGain'
		]) ||
		value.patchModelVersion !== enginePatchModelVersion ||
		!record(value.oscillator) ||
		!exactKeys(value.oscillator, [
			'waveform',
			'detuneCents',
			'subLevel',
			'noiseLevel',
			'pulseWidth'
		]) ||
		!['saw', 'square', 'triangle', 'sine'].includes(String(value.oscillator.waveform)) ||
		!finiteRange(value.oscillator.detuneCents, -100, 100) ||
		!finiteRange(value.oscillator.subLevel, 0, 1) ||
		!finiteRange(value.oscillator.noiseLevel, 0, 1) ||
		!finiteRange(value.oscillator.pulseWidth, 0.05, 0.95) ||
		!record(value.filter) ||
		!exactKeys(value.filter, ['cutoffHz', 'envelopeAmount', 'resonance']) ||
		!finiteRange(value.filter.cutoffHz, 20, 24_000) ||
		!finiteRange(value.filter.envelopeAmount, -1, 1) ||
		!finiteRange(value.filter.resonance, 0, 1) ||
		!validAmplifier(value.amplifier) ||
		!record(value.movement) ||
		!exactKeys(value.movement, ['rateHz', 'depth']) ||
		!finiteRange(value.movement.rateHz, 0, 20) ||
		!finiteRange(value.movement.depth, 0, 1) ||
		!finiteRange(value.drive, 0, 1) ||
		!finiteRange(value.stereoWidth, 0, 1) ||
		!finiteRange(value.outputGain, 0, 2)
	) {
		return false
	}
	return true
}

const drumInstruments = ['kick', 'clap', 'closedHat', 'openHat', 'perc'] as const
const drumAlgorithms = ['kick', 'clap', 'closed-hat', 'open-hat', 'perc'] as const

function validDrumVoice(value: unknown, instrument: EngineWireDrumInstrument): boolean {
	const expectedAlgorithm =
		instrument === 'closedHat'
			? 'closed-hat'
			: instrument === 'openHat'
				? 'open-hat'
				: instrument
	return (
		record(value) &&
		exactKeys(value, ['algorithm', 'pitchHz', 'tone', 'decayMs', 'noise', 'drive', 'gain']) &&
		drumAlgorithms.includes(value.algorithm as (typeof drumAlgorithms)[number]) &&
		value.algorithm === expectedAlgorithm &&
		finiteRange(value.pitchHz, 20, 20_000) &&
		finiteRange(value.tone, 0, 1) &&
		finiteRange(value.decayMs, 1, 10_000) &&
		finiteRange(value.noise, 0, 1) &&
		finiteRange(value.drive, 0, 1) &&
		finiteRange(value.gain, 0, 2)
	)
}

function validDrumPatch(value: unknown): value is EngineWireDrumKitPatchV2 {
	if (
		!record(value) ||
		!exactKeys(value, ['patchModelVersion', 'voices']) ||
		value.patchModelVersion !== enginePatchModelVersion ||
		!record(value.voices) ||
		!exactKeys(value.voices, drumInstruments)
	) {
		return false
	}
	const voices = value.voices
	return drumInstruments.every((instrument) => validDrumVoice(voices[instrument], instrument))
}

function validMidiEvent(value: unknown): value is EngineWireMidiNote {
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

function validDrumEvent(value: unknown): value is EngineWireDrumHit {
	return (
		record(value) &&
		exactKeys(value, ['id', 'startTick', 'swingTicks', 'instrument', 'velocity']) &&
		stableId(value.id) &&
		wireInteger(value.startTick) &&
		wireInteger(value.swingTicks) &&
		value.swingTicks <= engineTicksPerQuarter / 4 &&
		drumInstruments.includes(value.instrument as EngineWireDrumInstrument) &&
		wireInteger(value.velocity) &&
		value.velocity >= 1 &&
		value.velocity <= 127
	)
}

function validHeader(input: Record<string, unknown>): boolean {
	return (
		exactKeys(input, [
			'planVersion',
			'projectId',
			'projectRevision',
			'ticksPerQuarter',
			'endTick',
			'tempoMap',
			'meterMap',
			'loop',
			'layers'
		]) &&
		input.planVersion === engineRenderPlanVersion &&
		stableId(input.projectId) &&
		wireInteger(input.projectRevision) &&
		input.ticksPerQuarter === engineTicksPerQuarter &&
		wireInteger(input.endTick) &&
		input.endTick > 0
	)
}

function validateTiming(input: Record<string, unknown>): EngineWireRenderPlanResult | null {
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
		!Array.isArray(input.meterMap) ||
		input.meterMap.length === 0 ||
		input.meterMap.length > engineProtocolLimits.maxMeterPoints
	) {
		return failure('engine.limit-exceeded', 'Engine meter-map ceiling was exceeded.')
	}
	previousTick = -1
	let preparedBeatCount = 0
	for (const [index, point] of input.meterMap.entries()) {
		if (
			!record(point) ||
			!exactKeys(point, ['tick', 'numerator', 'denominator']) ||
			!wireInteger(point.tick) ||
			!wireInteger(point.numerator) ||
			point.numerator < 1 ||
			point.numerator > 32 ||
			![1, 2, 4, 8, 16].includes(point.denominator as number) ||
			point.tick <= previousTick ||
			(index === 0 && point.tick !== 0) ||
			point.tick >= Number(input.endTick)
		) {
			return failure('engine.invalid-plan', 'Engine meter map is invalid or unordered.')
		}
		previousTick = point.tick
		const next = input.meterMap[index + 1]
		const segmentEnd =
			record(next) && wireInteger(next.tick) ? next.tick : Number(input.endTick)
		const ticksPerBeat = (engineTicksPerQuarter * 4) / Number(point.denominator)
		preparedBeatCount += Math.ceil((segmentEnd - point.tick) / ticksPerBeat)
		if (preparedBeatCount > engineProtocolLimits.maxPreparedBeats) {
			return failure('engine.limit-exceeded', 'Engine prepared-beat ceiling was exceeded.')
		}
	}
	if (
		!record(input.loop) ||
		!exactKeys(input.loop, ['enabled', 'startTick', 'endTick']) ||
		typeof input.loop.enabled !== 'boolean' ||
		!wireInteger(input.loop.startTick) ||
		!wireInteger(input.loop.endTick) ||
		input.loop.startTick >= input.loop.endTick ||
		input.loop.endTick > Number(input.endTick)
	) {
		return failure('engine.invalid-plan', 'Engine loop is invalid.')
	}
	return null
}

export function validateEngineWireRenderPlan(input: unknown): EngineWireRenderPlanResult {
	if (!record(input) || !validHeader(input)) {
		return failure('engine.invalid-plan', 'Engine render-plan header is invalid.')
	}
	const timingFailure = validateTiming(input)
	if (timingFailure !== null) return timingFailure
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
			!exactKeys(layer.source, ['type', 'patch']) ||
			!Array.isArray(layer.events)
		) {
			return failure('engine.invalid-plan', 'Engine layer is invalid.')
		}
		ids.add(layer.id)
		const isSynth = layer.source.type === 'subtractive-synth'
		const isDrums = layer.source.type === 'procedural-drums'
		if (!isSynth && !isDrums) {
			return failure('engine.unsupported-source', 'Engine source type is unsupported.')
		}
		if (isSynth ? !validSynthPatch(layer.source.patch) : !validDrumPatch(layer.source.patch)) {
			return failure('engine.invalid-plan', 'Resolved engine patch is invalid.')
		}
		eventCount += layer.events.length
		if (eventCount > engineProtocolLimits.maxMusicalEvents) {
			return failure('engine.limit-exceeded', 'Engine musical-event ceiling was exceeded.')
		}
		let previous: { readonly id: string; readonly startTick: number } | null = null
		for (const event of layer.events) {
			const valid = isSynth ? validMidiEvent(event) : validDrumEvent(event)
			if (!valid || ids.has(event.id)) {
				return failure('engine.invalid-plan', 'Engine event is invalid or duplicated.')
			}
			if (
				previous !== null &&
				(previous.startTick > event.startTick ||
					(previous.startTick === event.startTick && previous.id > event.id))
			) {
				return failure('engine.invalid-plan', 'Engine events are not stably ordered.')
			}
			ids.add(event.id)
			previous = event
		}
	}
	return Object.freeze({ ok: true as const, value: input as unknown as EngineWireRenderPlan })
}
