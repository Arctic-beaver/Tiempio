import {
	applicationError,
	applicationErrorCodes,
	applicationRuntimeVersion,
	desktopRuntimeLimits,
	type ApplicationError,
	type ApplicationErrorCode,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type DesktopRuntimeBridge,
	type ProjectSnapshotEnvelope,
	type SettingsSnapshot
} from './application-runtime.js'
import { engineProtocolLimits } from './engine-protocol.js'

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	return (
		actual.length === keys.length &&
		actual.every((key, index) => key === [...keys].sort()[index])
	)
}

function safeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function boundedUtf8(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximum
}

function invalidRequest(message: string): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('INVALID_REQUEST', message)
	})
}

function runtimeCapability(value: unknown): boolean {
	if (!record(value) || typeof value.availability !== 'string') return false
	if (value.availability === 'available') {
		return exactKeys(value, ['availability', 'api']) && record(value.api)
	}
	return (
		value.availability === 'unavailable' &&
		exactKeys(value, ['availability', 'reason', 'error']) &&
		[
			'not-implemented',
			'platform-unsupported',
			'permission-required',
			'temporarily-unavailable'
		].includes(String(value.reason)) &&
		record(value.error)
	)
}

export function validateDesktopRuntimeBridge(
	input: unknown
): ApplicationResult<DesktopRuntimeBridge> {
	if (
		!record(input) ||
		input.version !== applicationRuntimeVersion ||
		input.target !== 'desktop'
	) {
		return Object.freeze({
			ok: false as const,
			error: applicationError(
				'RUNTIME_VERSION_MISMATCH',
				'The Desktop bridge is incompatible with this application.'
			)
		})
	}
	const capabilities = input.capabilities
	const window = input.window
	if (
		!exactKeys(input, ['version', 'target', 'platform', 'capabilities', 'window']) ||
		!['windows', 'macos', 'linux'].includes(String(input.platform)) ||
		!record(capabilities) ||
		!exactKeys(capabilities, ['projects', 'engine', 'settings', 'commands', 'lifecycle']) ||
		!Object.values(capabilities).every(runtimeCapability) ||
		!record(window) ||
		!exactKeys(window, ['minimize', 'toggleMaximize', 'requestClose']) ||
		!Object.values(window).every((operation) => typeof operation === 'function')
	) {
		return invalidRequest('Desktop bridge shape is invalid.')
	}
	return Object.freeze({ ok: true as const, value: input as unknown as DesktopRuntimeBridge })
}

export function validateProjectSnapshotEnvelope(
	input: unknown
): ApplicationResult<ProjectSnapshotEnvelope> {
	if (
		!record(input) ||
		!exactKeys(input, ['revision', 'bytes']) ||
		!safeInteger(input.revision) ||
		!(input.bytes instanceof Uint8Array) ||
		input.bytes.byteLength > desktopRuntimeLimits.maxProjectManifestBytes
	) {
		return invalidRequest('Project snapshot envelope is invalid or exceeds its limit.')
	}
	return Object.freeze({
		ok: true as const,
		value: Object.freeze({ revision: input.revision, bytes: new Uint8Array(input.bytes) })
	})
}

export function validateSettingsSnapshot(input: unknown): ApplicationResult<SettingsSnapshot> {
	if (
		!record(input) ||
		!exactKeys(input, ['version', 'colorScheme']) ||
		input.version !== 1 ||
		!['system', 'light', 'dark'].includes(String(input.colorScheme)) ||
		new TextEncoder().encode(JSON.stringify(input)).byteLength >
			desktopRuntimeLimits.maxSettingsBytes
	) {
		return invalidRequest('Settings snapshot is invalid or exceeds its limit.')
	}
	return Object.freeze({ ok: true as const, value: input as unknown as SettingsSnapshot })
}

export function validateAudioHealthSnapshot(
	input: unknown
): ApplicationResult<AudioHealthSnapshot> {
	if (
		!record(input) ||
		!exactKeys(input, [
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
		]) ||
		(input.activeDeviceId !== null &&
			!boundedUtf8(input.activeDeviceId, desktopRuntimeLimits.maxOpaqueHandleBytes)) ||
		!safeInteger(input.activeVoices) ||
		input.activeVoices > engineProtocolLimits.maxVoices ||
		!['disconnected', 'starting', 'ready', 'stopped', 'restarting', 'failed'].includes(
			String(input.backendState)
		) ||
		(input.blockFrames !== null &&
			(!safeInteger(input.blockFrames) ||
				input.blockFrames === 0 ||
				input.blockFrames > engineProtocolLimits.maxBlockFrames)) ||
		!['available', 'unavailable', 'lost'].includes(String(input.deviceState)) ||
		(input.mode !== null && input.mode !== 'shared') ||
		typeof input.outputMuted !== 'boolean' ||
		typeof input.outputSignalObserved !== 'boolean' ||
		(input.projectRevision !== null && !safeInteger(input.projectRevision)) ||
		(input.sampleRate !== null &&
			(!safeInteger(input.sampleRate) ||
				input.sampleRate < engineProtocolLimits.minSampleRate ||
				input.sampleRate > engineProtocolLimits.maxSampleRate)) ||
		!safeInteger(input.underruns)
	) {
		return invalidRequest('Audio health snapshot is invalid.')
	}
	return Object.freeze({ ok: true as const, value: input as unknown as AudioHealthSnapshot })
}

export function sanitizeApplicationError(input: unknown): ApplicationError {
	if (!record(input)) return applicationError('INTERNAL_ERROR', 'The operation failed.')
	const code =
		typeof input.code === 'string' &&
		applicationErrorCodes.includes(input.code as ApplicationErrorCode)
			? (input.code as ApplicationErrorCode)
			: 'INTERNAL_ERROR'
	const message = boundedUtf8(input.message, desktopRuntimeLimits.maxErrorMessageBytes)
		? input.message
		: 'The operation failed.'
	const details = record(input.details)
		? Object.fromEntries(
				Object.entries(input.details)
					.slice(0, desktopRuntimeLimits.maxErrorDetailEntries)
					.filter((entry): entry is [string, string | number | boolean | null] => {
						const [key, value] = entry
						return (
							boundedUtf8(key, desktopRuntimeLimits.maxOpaqueHandleBytes) &&
							(value === null ||
								(typeof value === 'number' && Number.isFinite(value)) ||
								typeof value === 'boolean' ||
								boundedUtf8(value, desktopRuntimeLimits.maxErrorMessageBytes))
						)
					})
			)
		: null
	return applicationError(code, message, {
		retryable: input.retryable === true,
		details
	})
}
