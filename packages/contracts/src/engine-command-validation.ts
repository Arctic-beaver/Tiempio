import {
	enginePatchModelVersion,
	engineRenderPlanVersion,
	validateEngineWireRenderPlan
} from './engine-render-plan.js'
import {
	engineCapabilityCodes,
	engineCommandTypes,
	engineProtocolLimits,
	engineProtocolVersion,
	type AnyEngineCommandEnvelope,
	type EngineCapabilityCode,
	type EngineCommandType,
	type EngineHandshake,
	type EngineProtocolFailure,
	type EngineProtocolResult
} from './engine-protocol-dtos.js'
import {
	emptyPayload,
	exactKeys,
	finiteRange,
	objectDepth,
	protocolFailure,
	record,
	safeInteger,
	serializedBytes,
	validIdentifier
} from './engine-protocol-validation.js'

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

function validPreviewPayload(value: unknown): boolean {
	if (
		!record(value) ||
		!exactKeys(value, ['previewId', 'layerId', 'programVersion', 'events']) ||
		!validIdentifier(value.previewId) ||
		!validIdentifier(value.layerId) ||
		value.programVersion !== 1 ||
		!Array.isArray(value.events) ||
		value.events.length < 1 ||
		value.events.length > engineProtocolLimits.maxPreviewEvents
	) {
		return false
	}
	let previousOffset = -1
	return value.events.every((event) => {
		if (
			!record(event) ||
			!exactKeys(event, ['offsetMs', 'durationMs', 'pitches', 'velocity']) ||
			!safeInteger(event.offsetMs) ||
			event.offsetMs < previousOffset ||
			!safeInteger(event.durationMs) ||
			event.durationMs < 1 ||
			event.offsetMs + event.durationMs > engineProtocolLimits.maxPreviewDurationMs ||
			!Array.isArray(event.pitches) ||
			event.pitches.length < 1 ||
			event.pitches.length > engineProtocolLimits.maxPreviewChordSize ||
			new Set(event.pitches).size !== event.pitches.length ||
			!event.pitches.every((pitch) => safeInteger(pitch) && pitch <= 127) ||
			!safeInteger(event.velocity) ||
			event.velocity < 1 ||
			event.velocity > 127
		) {
			return false
		}
		previousOffset = event.offsetMs
		return true
	})
}

function validRecordingStartPayload(value: unknown): boolean {
	return (
		record(value) &&
		exactKeys(value, [
			'recordingId',
			'layerId',
			'projectRevision',
			'startTick',
			'countInBars'
		]) &&
		validIdentifier(value.recordingId) &&
		validIdentifier(value.layerId) &&
		safeInteger(value.projectRevision) &&
		safeInteger(value.startTick) &&
		safeInteger(value.countInBars) &&
		value.countInBars <= engineProtocolLimits.maxRecordingCountInBars
	)
}

function validRecordingInputPayload(value: unknown, active: boolean): boolean {
	if (!record(value)) return false
	if (!active) {
		return (
			exactKeys(value, ['recordingId', 'auditionId']) &&
			validIdentifier(value.recordingId) &&
			validIdentifier(value.auditionId)
		)
	}
	return (
		exactKeys(value, ['recordingId', 'auditionId', 'pitch', 'velocity']) &&
		validIdentifier(value.recordingId) &&
		validIdentifier(value.auditionId) &&
		safeInteger(value.pitch) &&
		value.pitch <= 127 &&
		safeInteger(value.velocity) &&
		value.velocity >= 1 &&
		value.velocity <= 127
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
	if (type === 'ping') {
		return record(value) &&
			exactKeys(value, ['heartbeatId']) &&
			validIdentifier(value.heartbeatId)
			? null
			: protocolFailure('protocol.invalid-envelope', 'ping payload is invalid.')
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
	if (type === 'set-metronome-enabled') {
		return record(value) && exactKeys(value, ['enabled']) && typeof value.enabled === 'boolean'
			? null
			: protocolFailure('protocol.invalid-envelope', 'Metronome enabled payload is invalid.')
	}
	if (type === 'set-metronome-volume') {
		return record(value) && exactKeys(value, ['volume']) && finiteRange(value.volume, 0, 1)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Metronome volume payload is invalid.')
	}
	if (type === 'note-on') {
		return record(value) &&
			exactKeys(value, ['auditionId', 'layerId', 'pitch', 'velocity']) &&
			validIdentifier(value.auditionId) &&
			validIdentifier(value.layerId) &&
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
	if (type === 'start-preview') {
		return validPreviewPayload(value)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Preview program is invalid.')
	}
	if (type === 'cancel-preview') {
		return record(value) && exactKeys(value, ['previewId']) && validIdentifier(value.previewId)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Preview cancellation is invalid.')
	}
	if (type === 'start-recording') {
		return validRecordingStartPayload(value)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Recording start is invalid.')
	}
	if (type === 'recording-note-on' || type === 'recording-note-off') {
		return validRecordingInputPayload(value, type === 'recording-note-on')
			? null
			: protocolFailure('protocol.invalid-envelope', 'Recording input is invalid.')
	}
	if (type === 'stop-recording') {
		return record(value) &&
			exactKeys(value, ['recordingId']) &&
			validIdentifier(value.recordingId)
			? null
			: protocolFailure('protocol.invalid-envelope', 'Recording stop is invalid.')
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
