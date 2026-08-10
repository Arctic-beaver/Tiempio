import {
	engineCapabilityCodes,
	engineDiagnosticCodes,
	engineEventTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	type AnyEngineEventEnvelope,
	type EngineCapabilityCode,
	type EngineDiagnosticCode,
	type EngineEventType,
	type EngineProtocolResult
} from './engine-protocol-dtos.js'
import {
	exactKeys,
	finiteRange,
	objectDepth,
	protocolFailure,
	record,
	safeInteger,
	serializedBytes,
	validIdentifier
} from './engine-protocol-validation.js'

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
	if (type === 'audio-devices-changed') {
		return (
			exactKeys(value, ['devices']) &&
			Array.isArray(value.devices) &&
			value.devices.length <= engineProtocolLimits.maxBatchItems &&
			value.devices.filter((device) => record(device) && device.default === true).length <=
				1 &&
			new Set(
				value.devices.flatMap((device) =>
					record(device) && typeof device.id === 'string' ? [device.id] : []
				)
			).size === value.devices.length &&
			value.devices.every(
				(device) =>
					record(device) &&
					exactKeys(device, ['default', 'id', 'label']) &&
					typeof device.default === 'boolean' &&
					validIdentifier(device.id) &&
					typeof device.label === 'string' &&
					device.label.length > 0 &&
					new TextEncoder().encode(device.label).byteLength <=
						engineProtocolLimits.maxIdentifierBytes
			)
		)
	}
	if (type === 'active-device-changed') {
		return (
			exactKeys(value, ['deviceId']) &&
			(value.deviceId === null || validIdentifier(value.deviceId))
		)
	}
	if (type === 'pong') {
		return exactKeys(value, ['heartbeatId']) && validIdentifier(value.heartbeatId)
	}
	if (type === 'audio-health') {
		return (
			exactKeys(value, [
				'activeDeviceId',
				'activeVoices',
				'backendState',
				'blockFrames',
				'deviceState',
				'mode',
				'outputMuted',
				'outputSignalObserved',
				'projectRevision',
				'sampleRate',
				'underruns'
			]) &&
			(value.activeDeviceId === null || validIdentifier(value.activeDeviceId)) &&
			safeInteger(value.activeVoices) &&
			['starting', 'ready', 'stopped', 'failed'].includes(String(value.backendState)) &&
			(value.blockFrames === null ||
				(safeInteger(value.blockFrames) &&
					value.blockFrames >= 1 &&
					value.blockFrames <= engineProtocolLimits.maxBlockFrames)) &&
			['available', 'unavailable', 'lost'].includes(String(value.deviceState)) &&
			(value.mode === null || value.mode === 'shared') &&
			typeof value.outputMuted === 'boolean' &&
			typeof value.outputSignalObserved === 'boolean' &&
			(value.projectRevision === null || safeInteger(value.projectRevision)) &&
			(value.sampleRate === null ||
				(safeInteger(value.sampleRate) &&
					value.sampleRate >= engineProtocolLimits.minSampleRate &&
					value.sampleRate <= engineProtocolLimits.maxSampleRate)) &&
			safeInteger(value.underruns)
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
