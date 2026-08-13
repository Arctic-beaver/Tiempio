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
	type PersistenceOutcome,
	type ProjectHandle,
	type ProjectLoadEnvelope,
	type ProjectSnapshotEnvelope,
	type RecoveryCandidate,
	type RecoveryHandle,
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

export function validateProjectHandle(input: unknown): ApplicationResult<ProjectHandle> {
	if (
		!boundedUtf8(input, desktopRuntimeLimits.maxOpaqueHandleBytes) ||
		!/^project:[A-F0-9]{64}$/u.test(input)
	) {
		return invalidRequest('Project handle is invalid.')
	}
	return Object.freeze({ ok: true as const, value: input as ProjectHandle })
}

export function validateRecoveryHandle(input: unknown): ApplicationResult<RecoveryHandle> {
	if (
		!boundedUtf8(input, desktopRuntimeLimits.maxOpaqueHandleBytes) ||
		!/^recovery:[A-F0-9]{64}$/u.test(input)
	) {
		return invalidRequest('Recovery handle is invalid.')
	}
	return Object.freeze({ ok: true as const, value: input as RecoveryHandle })
}

function validFingerprint(input: unknown): boolean {
	return input === null || (typeof input === 'string' && /^sha256:[A-F0-9]{64}$/u.test(input))
}

export function validateProjectLoadEnvelope(
	input: unknown
): ApplicationResult<ProjectLoadEnvelope> {
	if (
		!record(input) ||
		!exactKeys(input, ['compatibility', 'fingerprint', 'saveAllowed', 'snapshot']) ||
		!['supported', 'unsupported'].includes(String(input.compatibility)) ||
		!validFingerprint(input.fingerprint) ||
		typeof input.saveAllowed !== 'boolean'
	) {
		return invalidRequest('Project load envelope is invalid.')
	}
	const snapshot = validateProjectSnapshotEnvelope(input.snapshot)
	if (!snapshot.ok) return snapshot
	if (input.compatibility === 'unsupported' && input.saveAllowed) {
		return invalidRequest('An unsupported project cannot be saveable.')
	}
	return Object.freeze({
		ok: true as const,
		value: Object.freeze({
			compatibility: input.compatibility,
			fingerprint: input.fingerprint,
			saveAllowed: input.saveAllowed,
			snapshot: snapshot.value
		}) as ProjectLoadEnvelope
	})
}

export function validatePersistenceOutcome(input: unknown): ApplicationResult<PersistenceOutcome> {
	if (!record(input) || !safeInteger(input.revision) || typeof input.status !== 'string') {
		return invalidRequest('Persistence outcome is invalid.')
	}
	if (
		input.status === 'persisted' &&
		exactKeys(input, ['status', 'revision', 'fingerprint']) &&
		validFingerprint(input.fingerprint) &&
		input.fingerprint !== null
	) {
		return Object.freeze({ ok: true as const, value: input as unknown as PersistenceOutcome })
	}
	if (
		input.status === 'download-requested' &&
		exactKeys(input, ['status', 'revision', 'suggestedName']) &&
		boundedUtf8(input.suggestedName, desktopRuntimeLimits.maxOpaqueHandleBytes)
	) {
		return Object.freeze({ ok: true as const, value: input as unknown as PersistenceOutcome })
	}
	if (
		['copy-written', 'canceled'].includes(input.status) &&
		exactKeys(input, ['status', 'revision'])
	) {
		return Object.freeze({ ok: true as const, value: input as unknown as PersistenceOutcome })
	}
	if (input.status === 'failed' && exactKeys(input, ['status', 'revision', 'error'])) {
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({
				status: 'failed' as const,
				revision: input.revision,
				error: sanitizeApplicationError(input.error)
			})
		})
	}
	return invalidRequest('Persistence outcome is invalid.')
}

export function validateRecoveryCandidates(
	input: unknown
): ApplicationResult<readonly RecoveryCandidate[]> {
	if (!Array.isArray(input) || input.length > desktopRuntimeLimits.maxRecoveryCandidates) {
		return invalidRequest('Recovery candidates are invalid or exceed their limit.')
	}
	const candidates: RecoveryCandidate[] = []
	const handles = new Set<string>()
	for (const candidate of input as readonly unknown[]) {
		if (
			!record(candidate) ||
			!exactKeys(candidate, ['handle', 'revision']) ||
			!safeInteger(candidate.revision)
		) {
			return invalidRequest('Recovery candidate is invalid.')
		}
		const handle = validateRecoveryHandle(candidate.handle)
		if (!handle.ok || handles.has(handle.value)) {
			return invalidRequest('Recovery candidate handle is invalid or duplicated.')
		}
		handles.add(handle.value)
		candidates.push(Object.freeze({ handle: handle.value, revision: candidate.revision }))
	}
	return Object.freeze({ ok: true as const, value: Object.freeze(candidates) })
}

export function validateSettingsSnapshot(input: unknown): ApplicationResult<SettingsSnapshot> {
	if (
		record(input) &&
		exactKeys(input, ['version', 'colorScheme']) &&
		input.version === 1 &&
		['system', 'light', 'dark'].includes(String(input.colorScheme))
	) {
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({
				version: 3 as const,
				colorScheme: input.colorScheme as SettingsSnapshot['colorScheme'],
				metronome: Object.freeze({ enabled: false, volume: 0.65 }),
				shortcutOverrides: Object.freeze([])
			})
		})
	}
	const legacyVersionTwo =
		record(input) &&
		exactKeys(input, ['version', 'colorScheme', 'shortcutOverrides']) &&
		input.version === 2
	const currentVersion =
		record(input) &&
		exactKeys(input, ['version', 'colorScheme', 'metronome', 'shortcutOverrides']) &&
		input.version === 3
	if (
		!record(input) ||
		(!legacyVersionTwo && !currentVersion) ||
		!['system', 'light', 'dark'].includes(String(input.colorScheme)) ||
		(currentVersion &&
			(!record(input.metronome) ||
				!exactKeys(input.metronome, ['enabled', 'volume']) ||
				typeof input.metronome.enabled !== 'boolean' ||
				typeof input.metronome.volume !== 'number' ||
				!Number.isFinite(input.metronome.volume) ||
				input.metronome.volume < 0 ||
				input.metronome.volume > 1)) ||
		!Array.isArray(input.shortcutOverrides) ||
		input.shortcutOverrides.length > 64 ||
		new TextEncoder().encode(JSON.stringify(input)).byteLength >
			desktopRuntimeLimits.maxSettingsBytes
	) {
		return invalidRequest('Settings snapshot is invalid or exceeds its limit.')
	}
	const shortcutOverrides: Array<SettingsSnapshot['shortcutOverrides'][number]> = []
	const commandIds = new Set<string>()
	for (const override of input.shortcutOverrides as readonly unknown[]) {
		if (
			!record(override) ||
			!exactKeys(override, ['bindings', 'commandId']) ||
			!boundedUtf8(override.commandId, 96) ||
			override.commandId.length === 0 ||
			commandIds.has(override.commandId) ||
			!Array.isArray(override.bindings) ||
			override.bindings.length > 8
		) {
			return invalidRequest('Settings shortcut override is invalid.')
		}
		commandIds.add(override.commandId)
		const bindings: Array<SettingsSnapshot['shortcutOverrides'][number]['bindings'][number]> =
			[]
		const signatures = new Set<string>()
		for (const binding of override.bindings as readonly unknown[]) {
			if (
				!record(binding) ||
				!exactKeys(binding, ['alt', 'code', 'platform', 'primary', 'shift']) ||
				typeof binding.alt !== 'boolean' ||
				!boundedUtf8(binding.code, 48) ||
				binding.code.length === 0 ||
				!['all', 'macos', 'other'].includes(String(binding.platform)) ||
				typeof binding.primary !== 'boolean' ||
				typeof binding.shift !== 'boolean'
			) {
				return invalidRequest('Settings shortcut binding is invalid.')
			}
			const signature = `${String(binding.platform)}:${binding.primary ? '1' : '0'}:${binding.shift ? '1' : '0'}:${binding.alt ? '1' : '0'}:${binding.code}`
			if (signatures.has(signature)) {
				return invalidRequest('Settings shortcut binding is duplicated.')
			}
			signatures.add(signature)
			bindings.push(
				Object.freeze({
					alt: binding.alt,
					code: binding.code,
					platform: binding.platform as 'all' | 'macos' | 'other',
					primary: binding.primary,
					shift: binding.shift
				})
			)
		}
		shortcutOverrides.push(
			Object.freeze({ commandId: override.commandId, bindings: Object.freeze(bindings) })
		)
	}
	return Object.freeze({
		ok: true as const,
		value: Object.freeze({
			version: 3 as const,
			colorScheme: input.colorScheme as SettingsSnapshot['colorScheme'],
			metronome: currentVersion
				? Object.freeze({
						enabled: (input.metronome as { readonly enabled: boolean }).enabled,
						volume: (input.metronome as { readonly volume: number }).volume
					})
				: Object.freeze({ enabled: false, volume: 0.65 }),
			shortcutOverrides: Object.freeze(shortcutOverrides)
		})
	})
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
		(input.mode !== null && input.mode !== 'shared' && input.mode !== 'browser') ||
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
