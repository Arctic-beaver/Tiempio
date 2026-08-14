import { engineProtocolLimits } from '../../../../packages/contracts/src/index.js'

export const webEngineProcessorName = 'tiempio-web-engine'
export const webEngineAbiVersion = 1
export const webEngineMaximumPendingCommands = 32
export const webEngineMaximumEventsPerRender = 16
export const webEngineMaximumBlockFrames = engineProtocolLimits.maxBlockFrames
export const webEngineMaximumTransferBytes = engineProtocolLimits.maxFrameBytes

export function hasWebEngineCommandCapacity(pendingCommands: number): boolean {
	return (
		Number.isSafeInteger(pendingCommands) &&
		pendingCommands >= 0 &&
		pendingCommands < webEngineMaximumPendingCommands
	)
}

export type WebEngineFatalCode =
	| 'abi-mismatch'
	| 'invalid-message'
	| 'memory-growth'
	| 'processor-failure'
	| 'wasm-initialization'

export type MainToWorkletMessage =
	| Readonly<{
			kind: 'command'
			generation: number
			messageId: number
			bytes: ArrayBuffer
	  }>
	| Readonly<{ kind: 'dispose'; generation: number }>

export type WorkletToMainMessage =
	| Readonly<{
			kind: 'ready'
			generation: number
			abiVersion: number
			protocolVersion: number
			sampleRate: number
			blockFrames: number
	  }>
	| Readonly<{
			kind: 'command-result'
			generation: number
			messageId: number
			result: number
	  }>
	| Readonly<{ kind: 'event'; generation: number; bytes: ArrayBuffer }>
	| Readonly<{
			kind: 'fatal'
			generation: number
			code: WebEngineFatalCode
	  }>

function record(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

function generation(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0
}

export function isMainToWorkletMessage(value: unknown): value is MainToWorkletMessage {
	if (!record(value) || !generation(value.generation)) return false
	if (value.kind === 'dispose') return Object.keys(value).length === 2
	return (
		value.kind === 'command' &&
		Object.keys(value).length === 4 &&
		Number.isSafeInteger(value.messageId) &&
		Number(value.messageId) >= 0 &&
		value.bytes instanceof ArrayBuffer &&
		value.bytes.byteLength > 0 &&
		value.bytes.byteLength <= webEngineMaximumTransferBytes
	)
}

export function isWorkletToMainMessage(value: unknown): value is WorkletToMainMessage {
	if (!record(value) || !generation(value.generation)) return false
	if (value.kind === 'event') {
		return (
			Object.keys(value).length === 3 &&
			value.bytes instanceof ArrayBuffer &&
			value.bytes.byteLength > 0 &&
			value.bytes.byteLength <= webEngineMaximumTransferBytes
		)
	}
	if (value.kind === 'command-result') {
		return (
			Object.keys(value).length === 4 &&
			Number.isSafeInteger(value.messageId) &&
			Number(value.messageId) >= 0 &&
			Number.isSafeInteger(value.result) &&
			Number(value.result) >= 0 &&
			Number(value.result) <= 3
		)
	}
	if (value.kind === 'ready') {
		return (
			Object.keys(value).length === 6 &&
			value.abiVersion === webEngineAbiVersion &&
			Number.isSafeInteger(value.protocolVersion) &&
			Number.isSafeInteger(value.sampleRate) &&
			Number(value.sampleRate) >= engineProtocolLimits.minSampleRate &&
			Number(value.sampleRate) <= engineProtocolLimits.maxSampleRate &&
			Number.isSafeInteger(value.blockFrames) &&
			Number(value.blockFrames) > 0 &&
			Number(value.blockFrames) <= engineProtocolLimits.maxBlockFrames
		)
	}
	return (
		value.kind === 'fatal' &&
		Object.keys(value).length === 3 &&
		[
			'abi-mismatch',
			'invalid-message',
			'memory-growth',
			'processor-failure',
			'wasm-initialization'
		].includes(String(value.code))
	)
}
