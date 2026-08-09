import {
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	type EngineCommandType,
	type EngineDiagnosticCode,
	type EngineEventType
} from './generated/engine-protocol.generated.js'

export {
	engineCommandTypes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion
}
export type { EngineCommandType, EngineDiagnosticCode, EngineEventType }

export interface EngineHandshake {
	readonly protocolVersion: number
	readonly peer: 'application' | 'native-host' | 'web-worklet'
	readonly capabilities: readonly string[]
}

export interface EngineCommandEnvelope {
	readonly protocolVersion: number
	readonly requestId: string
	readonly sequence: number
	readonly type: EngineCommandType
	readonly payload: unknown
}

export interface EngineEventEnvelope {
	readonly protocolVersion: number
	readonly sequence: number
	readonly type: EngineEventType
	readonly payload: unknown
}

export interface EngineProtocolFailure {
	readonly ok: false
	readonly diagnostic: EngineDiagnosticCode
	readonly message: string
}

export type EngineProtocolResult<Value> =
	{ readonly ok: true; readonly value: Value } | EngineProtocolFailure

function protocolFailure(diagnostic: EngineDiagnosticCode, message: string): EngineProtocolFailure {
	return Object.freeze({ ok: false as const, diagnostic, message })
}

function serializedBytes(value: unknown): number | null {
	try {
		const serialized = JSON.stringify(value)
		return serialized === undefined ? null : new TextEncoder().encode(serialized).byteLength
	} catch {
		return null
	}
}

function validIdentifier(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		new TextEncoder().encode(value).byteLength <= engineProtocolLimits.maxIdentifierBytes
	)
}

export function validateEngineHandshake(
	handshake: EngineHandshake
): EngineProtocolResult<EngineHandshake> {
	if (handshake.protocolVersion !== engineProtocolVersion) {
		return protocolFailure(
			'protocol.version-mismatch',
			`Engine protocol ${String(handshake.protocolVersion)} does not match ${String(engineProtocolVersion)}.`
		)
	}
	if (
		!['application', 'native-host', 'web-worklet'].includes(handshake.peer) ||
		!Array.isArray(handshake.capabilities) ||
		handshake.capabilities.length > engineProtocolLimits.maxBatchItems ||
		!handshake.capabilities.every(validIdentifier)
	) {
		return protocolFailure('protocol.invalid-envelope', 'Engine handshake is invalid.')
	}
	return Object.freeze({ ok: true as const, value: handshake })
}

export function validateEngineCommandEnvelope(
	envelope: EngineCommandEnvelope
): EngineProtocolResult<EngineCommandEnvelope> {
	if (envelope.protocolVersion !== engineProtocolVersion) {
		return protocolFailure(
			'protocol.version-mismatch',
			'Engine command version is incompatible.'
		)
	}
	if (
		!validIdentifier(envelope.requestId) ||
		!Number.isSafeInteger(envelope.sequence) ||
		envelope.sequence < 0 ||
		!engineCommandTypes.includes(envelope.type)
	) {
		return protocolFailure('protocol.invalid-envelope', 'Engine command envelope is invalid.')
	}
	const payloadBytes = serializedBytes(envelope.payload)
	const frameBytes = serializedBytes(envelope)
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
	return Object.freeze({ ok: true as const, value: envelope })
}

export function validateEngineEventEnvelope(
	envelope: EngineEventEnvelope
): EngineProtocolResult<EngineEventEnvelope> {
	if (envelope.protocolVersion !== engineProtocolVersion) {
		return protocolFailure('protocol.version-mismatch', 'Engine event version is incompatible.')
	}
	if (
		!Number.isSafeInteger(envelope.sequence) ||
		envelope.sequence < 0 ||
		!engineEventTypes.includes(envelope.type)
	) {
		return protocolFailure('protocol.invalid-envelope', 'Engine event envelope is invalid.')
	}
	const payloadBytes = serializedBytes(envelope.payload)
	const frameBytes = serializedBytes(envelope)
	if (
		payloadBytes === null ||
		frameBytes === null ||
		payloadBytes > engineProtocolLimits.maxPayloadBytes ||
		frameBytes > engineProtocolLimits.maxFrameBytes
	) {
		return protocolFailure('protocol.frame-too-large', 'Engine event exceeds protocol limits.')
	}
	return Object.freeze({ ok: true as const, value: envelope })
}
