import {
	engineCapabilityCodes,
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	type EngineCapabilityCode,
	type EngineCommandType,
	type EngineDiagnosticCode,
	type EngineEventType
} from './generated/engine-protocol.generated.js'
import {
	enginePatchModelVersion,
	engineRenderPlanVersion,
	validateEngineWireRenderPlan,
	type EngineWireRenderPlan
} from './engine-render-plan.js'

export {
	engineCapabilityCodes,
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion
}
export type { EngineCapabilityCode, EngineCommandType, EngineDiagnosticCode, EngineEventType }

export interface EngineHandshake {
	readonly capabilities: readonly EngineCapabilityCode[]
	readonly patchModelVersion: typeof enginePatchModelVersion
	readonly peer: 'application' | 'native-host' | 'web-worklet'
	readonly protocolVersion: number
	readonly renderPlanVersion: typeof engineRenderPlanVersion
}

type EmptyPayload = Readonly<Record<never, never>>

export type EngineRenderPlanDeltaChange =
	| { readonly gain: number; readonly layerId: string; readonly type: 'layer-gain' }
	| { readonly layerId: string; readonly pan: number; readonly type: 'layer-pan' }

export interface EngineCommandPayloadByType {
	readonly handshake: EngineHandshake
	readonly 'configure-audio': {
		readonly blockFrames: number
		readonly channels: 2
		readonly sampleRate: number
	}
	readonly 'start-audio': EmptyPayload
	readonly 'stop-audio': EmptyPayload
	readonly 'load-render-plan': { readonly plan: EngineWireRenderPlan }
	readonly 'apply-render-plan-delta': {
		readonly baseRevision: number
		readonly changes: readonly EngineRenderPlanDeltaChange[]
		readonly targetRevision: number
	}
	readonly play: { readonly startTick: number }
	readonly stop: EmptyPayload
	readonly seek: { readonly tick: number }
	readonly 'set-loop': {
		readonly enabled: boolean
		readonly endTick: number
		readonly startTick: number
	}
	readonly 'note-on': {
		readonly auditionId: string
		readonly pitch: number
		readonly velocity: number
	}
	readonly 'note-off': { readonly auditionId: string }
	readonly 'preview-macro': {
		readonly baseRevision: number
		readonly layerId: string
		readonly macro: 'brightness' | 'dirt' | 'hardness' | 'length' | 'width'
		readonly value: number
	}
	readonly 'commit-macro': EngineCommandPayloadByType['preview-macro']
	readonly 'request-diagnostics': EmptyPayload
	readonly 'refresh-devices': EmptyPayload
	readonly 'start-offline-render': {
		readonly blockFrames: number
		readonly endTick: number
		readonly plan: EngineWireRenderPlan
		readonly renderId: string
		readonly sampleRate: number
	}
	readonly 'cancel-offline-render': { readonly renderId: string }
	readonly shutdown: EmptyPayload
}

export type EngineCommandEnvelope<Type extends EngineCommandType = EngineCommandType> = Readonly<{
	payload: EngineCommandPayloadByType[Type]
	protocolVersion: number
	requestId: string
	sequence: number
	type: Type
}>

export type AnyEngineCommandEnvelope = {
	readonly [Type in EngineCommandType]: EngineCommandEnvelope<Type>
}[EngineCommandType]

export interface EngineEventPayloadByType {
	readonly ready: { readonly protocolVersion: number }
	readonly capabilities: {
		readonly capabilities: readonly EngineCapabilityCode[]
		readonly limits: typeof engineProtocolLimits
	}
	readonly 'render-plan-acknowledged': {
		readonly planGeneration: number
		readonly projectRevision: number
	}
	readonly 'transport-snapshot': {
		readonly playing: boolean
		readonly projectRevision: number
		readonly samplePosition: number
		readonly tick: number
	}
	readonly 'meter-snapshot': { readonly leftPeak: number; readonly rightPeak: number }
	readonly 'active-device-changed': { readonly deviceId: string | null }
	readonly 'midi-captured': {
		readonly pitch: number
		readonly samplePosition: number
		readonly velocity: number
	}
	readonly diagnostic: {
		readonly code: EngineDiagnosticCode
		readonly message: string
		readonly projectRevision: number | null
	}
	readonly 'offline-render-progress': {
		readonly completedFrames: number
		readonly renderId: string
		readonly totalFrames: number
	}
	readonly 'offline-render-completed': {
		readonly frameCount: number
		readonly projectRevision: number
		readonly renderId: string
	}
	readonly 'fatal-error': { readonly code: EngineDiagnosticCode; readonly message: string }
}

export type EngineEventEnvelope<Type extends EngineEventType = EngineEventType> = Readonly<{
	payload: EngineEventPayloadByType[Type]
	protocolVersion: number
	sequence: number
	type: Type
}>

export type AnyEngineEventEnvelope = {
	readonly [Type in EngineEventType]: EngineEventEnvelope<Type>
}[EngineEventType]

export interface EngineProtocolFailure {
	readonly diagnostic: EngineDiagnosticCode
	readonly message: string
	readonly ok: false
}

export type EngineProtocolResult<Value> =
	{ readonly ok: true; readonly value: Value } | EngineProtocolFailure

function protocolFailure(diagnostic: EngineDiagnosticCode, message: string): EngineProtocolFailure {
	return Object.freeze({ ok: false as const, diagnostic, message })
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value)
	return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function serializedBytes(value: unknown): number | null {
	try {
		const serialized = JSON.stringify(value)
		return serialized === undefined ? null : new TextEncoder().encode(serialized).byteLength
	} catch {
		return null
	}
}

function objectDepth(value: unknown): number {
	if (typeof value !== 'object' || value === null) return 0
	let maximum = 0
	const stack: Array<{ readonly depth: number; readonly value: object }> = [{ value, depth: 1 }]
	const visited = new Set<object>()
	while (stack.length > 0) {
		const current = stack.pop()
		if (current === undefined || visited.has(current.value)) continue
		visited.add(current.value)
		maximum = Math.max(maximum, current.depth)
		if (maximum > engineProtocolLimits.maxJsonDepth) return maximum
		for (const child of Object.values(current.value as Record<string, unknown>)) {
			if (typeof child === 'object' && child !== null) {
				stack.push({ value: child, depth: current.depth + 1 })
			}
		}
	}
	return maximum
}

function safeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function finiteRange(value: unknown, minimum: number, maximum: number): value is number {
	return (
		typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
	)
}

function validIdentifier(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		new TextEncoder().encode(value).byteLength <= engineProtocolLimits.maxIdentifierBytes &&
		/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
	)
}

function emptyPayload(value: unknown): boolean {
	return record(value) && exactKeys(value, [])
}

function validHandshakeShape(value: unknown): value is EngineHandshake {
	return (
		record(value) &&
		exactKeys(value, [
			'protocolVersion',
			'peer',
			'renderPlanVersion',
			'patchModelVersion',
			'capabilities'
		]) &&
		value.protocolVersion === engineProtocolVersion &&
		['application', 'native-host', 'web-worklet'].includes(String(value.peer)) &&
		value.renderPlanVersion === engineRenderPlanVersion &&
		value.patchModelVersion === enginePatchModelVersion &&
		Array.isArray(value.capabilities) &&
		value.capabilities.length <= engineProtocolLimits.maxBatchItems &&
		new Set(value.capabilities).size === value.capabilities.length &&
		value.capabilities.every(
			(capability) =>
				typeof capability === 'string' &&
				engineCapabilityCodes.includes(capability as EngineCapabilityCode)
		)
	)
}

export function validateEngineHandshake(input: unknown): EngineProtocolResult<EngineHandshake> {
	if (!record(input) || input.protocolVersion !== engineProtocolVersion) {
		return protocolFailure(
			'protocol.version-mismatch',
			`Engine protocol does not match ${String(engineProtocolVersion)}.`
		)
	}
	if (!validHandshakeShape(input)) {
		return protocolFailure('protocol.invalid-envelope', 'Engine handshake is invalid.')
	}
	return Object.freeze({ ok: true as const, value: input })
}

function validLoopPayload(value: unknown): boolean {
	return (
		record(value) &&
		exactKeys(value, ['enabled', 'startTick', 'endTick']) &&
		typeof value.enabled === 'boolean' &&
		safeInteger(value.startTick) &&
		safeInteger(value.endTick) &&
		value.startTick < value.endTick
	)
}

function validMacroPayload(value: unknown): boolean {
	return (
		record(value) &&
		exactKeys(value, ['baseRevision', 'layerId', 'macro', 'value']) &&
		safeInteger(value.baseRevision) &&
		validIdentifier(value.layerId) &&
		['brightness', 'dirt', 'hardness', 'length', 'width'].includes(String(value.macro)) &&
		finiteRange(value.value, 0, 1)
	)
}

function validCommandPayload(
	type: EngineCommandType,
	value: unknown
): EngineProtocolFailure | null {
	if (type === 'handshake') {
		const result = validateEngineHandshake(value)
		return result.ok ? null : result
	}
	if (
		[
			'start-audio',
			'stop-audio',
			'stop',
			'request-diagnostics',
			'refresh-devices',
			'shutdown'
		].includes(type)
	) {
		return emptyPayload(value)
			? null
			: protocolFailure('protocol.invalid-envelope', `${type} payload must be empty.`)
	}
	if (type === 'configure-audio') {
		return record(value) &&
			exactKeys(value, ['sampleRate', 'blockFrames', 'channels']) &&
			safeInteger(value.sampleRate) &&
			value.sampleRate >= engineProtocolLimits.minSampleRate &&
			value.sampleRate <= engineProtocolLimits.maxSampleRate &&
			safeInteger(value.blockFrames) &&
			value.blockFrames >= 1 &&
			value.blockFrames <= engineProtocolLimits.maxBlockFrames &&
			value.channels === 2
			? null
			: protocolFailure('protocol.invalid-envelope', 'Audio configuration is invalid.')
	}
	if (type === 'load-render-plan') {
		if (!record(value) || !exactKeys(value, ['plan'])) {
			return protocolFailure('protocol.invalid-envelope', 'Render-plan payload is invalid.')
		}
		const result = validateEngineWireRenderPlan(value.plan)
		return result.ok ? null : protocolFailure(result.diagnostic, result.message)
	}
	if (type === 'apply-render-plan-delta') {
		if (
			!record(value) ||
			!exactKeys(value, ['baseRevision', 'targetRevision', 'changes']) ||
			!safeInteger(value.baseRevision) ||
			!safeInteger(value.targetRevision) ||
			value.targetRevision <= value.baseRevision ||
			!Array.isArray(value.changes) ||
			value.changes.length > engineProtocolLimits.maxBatchItems
		) {
			return protocolFailure('protocol.invalid-envelope', 'Render-plan delta is invalid.')
		}
		for (const change of value.changes) {
			if (!record(change) || !validIdentifier(change.layerId)) {
				return protocolFailure(
					'protocol.invalid-envelope',
					'Render-plan delta change is invalid.'
				)
			}
			if (
				change.type === 'layer-gain' &&
				exactKeys(change, ['type', 'layerId', 'gain']) &&
				finiteRange(change.gain, 0, 2)
			) {
				continue
			}
			if (
				change.type === 'layer-pan' &&
				exactKeys(change, ['type', 'layerId', 'pan']) &&
				finiteRange(change.pan, -1, 1)
			) {
				continue
			}
			return protocolFailure(
				'protocol.invalid-envelope',
				'Render-plan delta change is invalid.'
			)
		}
		return null
	}
	if (type === 'play') {
		return record(value) && exactKeys(value, ['startTick']) && safeInteger(value.startTick)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Play payload is invalid.')
	}
	if (type === 'seek') {
		return record(value) && exactKeys(value, ['tick']) && safeInteger(value.tick)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Seek payload is invalid.')
	}
	if (type === 'set-loop') {
		return validLoopPayload(value)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Loop payload is invalid.')
	}
	if (type === 'note-on') {
		return record(value) &&
			exactKeys(value, ['auditionId', 'pitch', 'velocity']) &&
			validIdentifier(value.auditionId) &&
			safeInteger(value.pitch) &&
			value.pitch <= 127 &&
			safeInteger(value.velocity) &&
			value.velocity >= 1 &&
			value.velocity <= 127
			? null
			: protocolFailure('protocol.invalid-envelope', 'Note-on payload is invalid.')
	}
	if (type === 'note-off') {
		return record(value) &&
			exactKeys(value, ['auditionId']) &&
			validIdentifier(value.auditionId)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Note-off payload is invalid.')
	}
	if (type === 'preview-macro' || type === 'commit-macro') {
		return validMacroPayload(value)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Macro payload is invalid.')
	}
	if (type === 'start-offline-render') {
		if (
			!record(value) ||
			!exactKeys(value, ['renderId', 'plan', 'sampleRate', 'blockFrames', 'endTick']) ||
			!validIdentifier(value.renderId) ||
			!safeInteger(value.sampleRate) ||
			value.sampleRate < engineProtocolLimits.minSampleRate ||
			value.sampleRate > engineProtocolLimits.maxSampleRate ||
			!safeInteger(value.blockFrames) ||
			value.blockFrames < 1 ||
			value.blockFrames > engineProtocolLimits.maxBlockFrames ||
			!safeInteger(value.endTick)
		) {
			return protocolFailure(
				'protocol.invalid-envelope',
				'Offline-render payload is invalid.'
			)
		}
		const result = validateEngineWireRenderPlan(value.plan)
		return result.ok ? null : protocolFailure(result.diagnostic, result.message)
	}
	return record(value) && exactKeys(value, ['renderId']) && validIdentifier(value.renderId)
		? null
		: protocolFailure('protocol.invalid-envelope', 'Offline-cancel payload is invalid.')
}

export function validateEngineCommandEnvelope(
	input: unknown
): EngineProtocolResult<AnyEngineCommandEnvelope> {
	if (!record(input) || input.protocolVersion !== engineProtocolVersion) {
		return protocolFailure(
			'protocol.version-mismatch',
			'Engine command version is incompatible.'
		)
	}
	if (
		!exactKeys(input, ['protocolVersion', 'requestId', 'sequence', 'type', 'payload']) ||
		!validIdentifier(input.requestId) ||
		!safeInteger(input.sequence) ||
		typeof input.type !== 'string' ||
		!engineCommandTypes.includes(input.type as EngineCommandType)
	) {
		return protocolFailure('protocol.invalid-envelope', 'Engine command envelope is invalid.')
	}
	const payloadBytes = serializedBytes(input.payload)
	const frameBytes = serializedBytes(input)
	if (
		payloadBytes === null ||
		frameBytes === null ||
		payloadBytes > engineProtocolLimits.maxPayloadBytes ||
		frameBytes > engineProtocolLimits.maxFrameBytes
	) {
		return protocolFailure(
			'protocol.frame-too-large',
			'Engine command exceeds protocol limits.'
		)
	}
	if (objectDepth(input) > engineProtocolLimits.maxJsonDepth) {
		return protocolFailure('protocol.invalid-envelope', 'Engine command exceeds JSON depth.')
	}
	const payloadFailure = validCommandPayload(input.type as EngineCommandType, input.payload)
	if (payloadFailure !== null) return payloadFailure
	return Object.freeze({ ok: true as const, value: input as unknown as AnyEngineCommandEnvelope })
}

function validCapabilityList(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length <= engineProtocolLimits.maxBatchItems &&
		new Set(value).size === value.length &&
		value.every(
			(capability) =>
				typeof capability === 'string' &&
				engineCapabilityCodes.includes(capability as EngineCapabilityCode)
		)
	)
}

function validProtocolLimits(value: unknown): boolean {
	if (!record(value) || !exactKeys(value, Object.keys(engineProtocolLimits))) return false
	return Object.entries(engineProtocolLimits).every(
		([name, expected]) => value[name] === expected
	)
}

function validEventPayload(type: EngineEventType, value: unknown): boolean {
	if (!record(value)) return false
	if (type === 'ready') {
		return (
			exactKeys(value, ['protocolVersion']) && value.protocolVersion === engineProtocolVersion
		)
	}
	if (type === 'capabilities') {
		return (
			exactKeys(value, ['capabilities', 'limits']) &&
			validCapabilityList(value.capabilities) &&
			validProtocolLimits(value.limits)
		)
	}
	if (type === 'render-plan-acknowledged') {
		return (
			exactKeys(value, ['projectRevision', 'planGeneration']) &&
			safeInteger(value.projectRevision) &&
			safeInteger(value.planGeneration)
		)
	}
	if (type === 'transport-snapshot') {
		return (
			exactKeys(value, ['playing', 'projectRevision', 'samplePosition', 'tick']) &&
			typeof value.playing === 'boolean' &&
			safeInteger(value.projectRevision) &&
			safeInteger(value.samplePosition) &&
			finiteRange(value.tick, 0, Number.MAX_SAFE_INTEGER)
		)
	}
	if (type === 'meter-snapshot') {
		return (
			exactKeys(value, ['leftPeak', 'rightPeak']) &&
			finiteRange(value.leftPeak, 0, 1) &&
			finiteRange(value.rightPeak, 0, 1)
		)
	}
	if (type === 'active-device-changed') {
		return (
			exactKeys(value, ['deviceId']) &&
			(value.deviceId === null || validIdentifier(value.deviceId))
		)
	}
	if (type === 'midi-captured') {
		return (
			exactKeys(value, ['pitch', 'velocity', 'samplePosition']) &&
			safeInteger(value.pitch) &&
			value.pitch <= 127 &&
			safeInteger(value.velocity) &&
			value.velocity >= 1 &&
			value.velocity <= 127 &&
			safeInteger(value.samplePosition)
		)
	}
	if (type === 'diagnostic') {
		return (
			exactKeys(value, ['code', 'message', 'projectRevision']) &&
			typeof value.code === 'string' &&
			engineDiagnosticCodes.includes(value.code as EngineDiagnosticCode) &&
			typeof value.message === 'string' &&
			(value.projectRevision === null || safeInteger(value.projectRevision))
		)
	}
	if (type === 'offline-render-progress') {
		return (
			exactKeys(value, ['renderId', 'completedFrames', 'totalFrames']) &&
			validIdentifier(value.renderId) &&
			safeInteger(value.completedFrames) &&
			safeInteger(value.totalFrames) &&
			value.completedFrames <= value.totalFrames
		)
	}
	if (type === 'offline-render-completed') {
		return (
			exactKeys(value, ['renderId', 'projectRevision', 'frameCount']) &&
			validIdentifier(value.renderId) &&
			safeInteger(value.projectRevision) &&
			safeInteger(value.frameCount)
		)
	}
	return (
		exactKeys(value, ['code', 'message']) &&
		typeof value.code === 'string' &&
		engineDiagnosticCodes.includes(value.code as EngineDiagnosticCode) &&
		typeof value.message === 'string'
	)
}

export function validateEngineEventEnvelope(
	input: unknown
): EngineProtocolResult<AnyEngineEventEnvelope> {
	if (!record(input) || input.protocolVersion !== engineProtocolVersion) {
		return protocolFailure('protocol.version-mismatch', 'Engine event version is incompatible.')
	}
	if (
		!exactKeys(input, ['protocolVersion', 'sequence', 'type', 'payload']) ||
		!safeInteger(input.sequence) ||
		typeof input.type !== 'string' ||
		!engineEventTypes.includes(input.type as EngineEventType) ||
		!validEventPayload(input.type as EngineEventType, input.payload)
	) {
		return protocolFailure('protocol.invalid-envelope', 'Engine event envelope is invalid.')
	}
	const payloadBytes = serializedBytes(input.payload)
	const frameBytes = serializedBytes(input)
	if (
		payloadBytes === null ||
		frameBytes === null ||
		payloadBytes > engineProtocolLimits.maxPayloadBytes ||
		frameBytes > engineProtocolLimits.maxFrameBytes
	) {
		return protocolFailure('protocol.frame-too-large', 'Engine event exceeds protocol limits.')
	}
	if (objectDepth(input) > engineProtocolLimits.maxJsonDepth) {
		return protocolFailure('protocol.invalid-envelope', 'Engine event exceeds JSON depth.')
	}
	return Object.freeze({ ok: true as const, value: input as unknown as AnyEngineEventEnvelope })
}

export type EngineProtocolSessionState = 'awaiting-handshake' | 'ready' | 'terminated'

export class EngineProtocolSession {
	#lastSequence = -1
	#state: EngineProtocolSessionState = 'awaiting-handshake'

	public get state(): EngineProtocolSessionState {
		return this.#state
	}

	public accept(input: unknown): EngineProtocolResult<AnyEngineCommandEnvelope> {
		if (this.#state === 'terminated') {
			return protocolFailure('protocol.invalid-envelope', 'Protocol session is terminated.')
		}
		const result = validateEngineCommandEnvelope(input)
		if (!result.ok) {
			if (
				this.#state === 'awaiting-handshake' ||
				result.diagnostic === 'protocol.version-mismatch'
			) {
				this.#state = 'terminated'
			}
			return result
		}
		if (result.value.sequence <= this.#lastSequence) {
			return protocolFailure(
				'protocol.invalid-sequence',
				'Engine command sequence is replayed or out of order.'
			)
		}
		if (this.#state === 'awaiting-handshake' && result.value.type !== 'handshake') {
			this.#state = 'terminated'
			return protocolFailure(
				'protocol.invalid-envelope',
				'Handshake must be the first command.'
			)
		}
		if (this.#state === 'ready' && result.value.type === 'handshake') {
			return protocolFailure('protocol.invalid-envelope', 'Handshake is already complete.')
		}
		this.#lastSequence = result.value.sequence
		if (result.value.type === 'handshake') this.#state = 'ready'
		return result
	}

	public terminate(): void {
		this.#state = 'terminated'
	}
}
