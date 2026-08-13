import { contextBridge, ipcRenderer } from 'electron'
import {
	applicationError,
	applicationRuntimeVersion,
	createUnavailableRuntime,
	engineCapabilityCodes,
	sanitizeApplicationError,
	validateAudioHealthSnapshot,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	validatePersistenceOutcome,
	validateProjectHandle,
	validateProjectLoadEnvelope,
	validateProjectSnapshotEnvelope,
	validateRecoveryCandidates,
	validateRecoveryHandle,
	validateSettingsSnapshot,
	type AnyEngineEventEnvelope,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type DesktopPlatform,
	type DesktopRuntimeBridge,
	type EngineConnection,
	type EngineRuntime,
	type LifecycleRuntime,
	type PersistenceOutcome,
	type ProjectsRuntime,
	type SettingsRuntime
} from '../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'

function desktopPlatform(platform: NodeJS.Platform): DesktopPlatform {
	if (platform === 'darwin') return 'macos'
	if (platform === 'win32') return 'windows'
	return 'linux'
}

const unavailable = createUnavailableRuntime('desktop')
const engineEvents = new Set<(event: AnyEngineEventEnvelope) => void>()
const engineHealth = new Set<(health: AudioHealthSnapshot) => void>()
const closeListeners = new Set<() => void>()

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort()
	const expected = [...keys].sort()
	return (
		actual.length === expected.length && actual.every((key, index) => key === expected[index])
	)
}

function failedResult(
	input: unknown
): { readonly ok: false; readonly error: ReturnType<typeof sanitizeApplicationError> } | null {
	if (!record(input) || input.ok !== false || !record(input.error)) return null
	return Object.freeze({ ok: false as const, error: sanitizeApplicationError(input.error) })
}

async function invoke<Value>(
	channel: string,
	payload: Readonly<Record<string, unknown>>,
	validateValue: (value: unknown) => ApplicationResult<Value>
): Promise<ApplicationResult<Value>> {
	let input: unknown
	try {
		input = await ipcRenderer.invoke(channel, payload)
	} catch {
		return Object.freeze({
			ok: false as const,
			error: applicationError('INTERNAL_ERROR', 'The Desktop operation failed.')
		})
	}
	const failure = failedResult(input)
	if (failure !== null) return failure
	if (!record(input) || input.ok !== true) {
		return Object.freeze({ ok: false as const, error: sanitizeApplicationError(null) })
	}
	return validateValue(input.value)
}

function validValue<Value>(
	value: unknown,
	predicate: (input: unknown) => input is Value,
	message: string
): ApplicationResult<Value> {
	return predicate(value)
		? Object.freeze({ ok: true as const, value })
		: Object.freeze({ ok: false as const, error: applicationError('INVALID_REQUEST', message) })
}

function validConnection(value: unknown): value is EngineConnection {
	const audioConfiguration = record(value) ? value.audioConfiguration : undefined
	return (
		record(value) &&
		exactKeys(value, ['audioConfiguration', 'protocolVersion', 'capabilities']) &&
		(audioConfiguration === null ||
			(record(audioConfiguration) &&
				exactKeys(audioConfiguration, ['blockFrames', 'channels', 'sampleRate']) &&
				Number.isSafeInteger(audioConfiguration.blockFrames) &&
				Number.isSafeInteger(audioConfiguration.sampleRate) &&
				audioConfiguration.channels === 2)) &&
		typeof value.protocolVersion === 'number' &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every(
			(capability) =>
				typeof capability === 'string' &&
				engineCapabilityCodes.includes(capability as (typeof engineCapabilityCodes)[number])
		)
	)
}

const runtimeCall = Object.freeze({ runtimeVersion: applicationRuntimeVersion })

const engineRuntime: EngineRuntime = Object.freeze({
	connect: () =>
		invoke(desktopRuntimeChannels.engineConnect, runtimeCall, (value) =>
			validValue(value, validConnection, 'Engine connection is invalid.')
		),
	disconnect: () =>
		invoke(desktopRuntimeChannels.engineDisconnect, runtimeCall, (value) =>
			validValue(value, (input): input is null => input === null, 'Engine result is invalid.')
		),
	send: (command) => {
		const validated = validateEngineCommandEnvelope(command)
		if (!validated.ok) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError('INVALID_REQUEST', validated.message)
				})
			)
		}
		return invoke(
			desktopRuntimeChannels.engineSend,
			{ ...runtimeCall, command: validated.value },
			(value) =>
				validValue(
					value,
					(input): input is { readonly accepted: true } =>
						record(input) && exactKeys(input, ['accepted']) && input.accepted === true,
					'Engine acknowledgement is invalid.'
				)
		)
	},
	onEvent: (listener) => {
		engineEvents.add(listener)
		return () => engineEvents.delete(listener)
	},
	getHealth: () =>
		invoke(desktopRuntimeChannels.engineGetHealth, runtimeCall, validateAudioHealthSnapshot),
	onHealth: (listener) => {
		engineHealth.add(listener)
		return () => engineHealth.delete(listener)
	}
})

function projectSnapshotPayload(
	handle: string,
	snapshot: unknown
): ApplicationResult<{
	readonly handle: string
	readonly snapshot: unknown
}> {
	const validHandle = validateProjectHandle(handle)
	const validSnapshot = validateProjectSnapshotEnvelope(snapshot)
	return validHandle.ok && validSnapshot.ok
		? Object.freeze({
				ok: true as const,
				value: Object.freeze({ handle: validHandle.value, snapshot: validSnapshot.value })
			})
		: Object.freeze({
				ok: false as const,
				error: applicationError(
					'INVALID_REQUEST',
					'Project persistence request is invalid.'
				)
			})
}

async function invokePersistence(
	channel: string,
	handle: string,
	snapshot: unknown
): Promise<PersistenceOutcome> {
	const payload = projectSnapshotPayload(handle, snapshot)
	const revision =
		record(snapshot) &&
		Number.isSafeInteger(snapshot.revision) &&
		Number(snapshot.revision) >= 0
			? Number(snapshot.revision)
			: 0
	if (!payload.ok) {
		return Object.freeze({ status: 'failed' as const, revision, error: payload.error })
	}
	let input: unknown
	try {
		input = await ipcRenderer.invoke(channel, { ...runtimeCall, ...payload.value })
	} catch {
		return Object.freeze({
			status: 'failed' as const,
			revision,
			error: applicationError('INTERNAL_ERROR', 'Project persistence failed.')
		})
	}
	const failure = failedResult(input)
	if (failure !== null) {
		return Object.freeze({ status: 'failed' as const, revision, error: failure.error })
	}
	const validated = validatePersistenceOutcome(input)
	return validated.ok
		? validated.value
		: Object.freeze({ status: 'failed' as const, revision, error: validated.error })
}

const projectsRuntime: ProjectsRuntime = Object.freeze({
	create: () => invoke(desktopRuntimeChannels.projectCreate, runtimeCall, validateProjectHandle),
	open: () => invoke(desktopRuntimeChannels.projectOpen, runtimeCall, validateProjectHandle),
	load: (handle) => {
		const validHandle = validateProjectHandle(handle)
		return validHandle.ok
			? invoke(
					desktopRuntimeChannels.projectLoad,
					{ ...runtimeCall, handle: validHandle.value },
					validateProjectLoadEnvelope
				)
			: Promise.resolve(validHandle)
	},
	persist: (handle, snapshot) =>
		invokePersistence(desktopRuntimeChannels.projectPersist, handle, snapshot),
	persistAs: (handle, snapshot) =>
		invokePersistence(desktopRuntimeChannels.projectPersistAs, handle, snapshot),
	saveCopy: (handle, snapshot) =>
		invokePersistence(desktopRuntimeChannels.projectSaveCopy, handle, snapshot),
	writeRecovery: (handle, snapshot) => {
		const payload = projectSnapshotPayload(handle, snapshot)
		if (!payload.ok) return Promise.resolve(payload)
		return invoke(
			desktopRuntimeChannels.projectWriteRecovery,
			{ ...runtimeCall, ...payload.value },
			(value) =>
				validValue(
					value,
					(input): input is { readonly revision: number } =>
						record(input) &&
						exactKeys(input, ['revision']) &&
						Number.isSafeInteger(input.revision) &&
						Number(input.revision) >= 0,
					'Recovery acknowledgement is invalid.'
				)
		)
	},
	listRecoveries: () =>
		invoke(
			desktopRuntimeChannels.projectListRecoveries,
			runtimeCall,
			validateRecoveryCandidates
		),
	restoreRecovery: (handle) => {
		const validHandle = validateRecoveryHandle(handle)
		return validHandle.ok
			? invoke(
					desktopRuntimeChannels.projectRestoreRecovery,
					{ ...runtimeCall, handle: validHandle.value },
					validateProjectHandle
				)
			: Promise.resolve(validHandle)
	},
	discardRecovery: (handle, throughRevision) => {
		const validHandle = validateRecoveryHandle(handle)
		if (!validHandle.ok || !Number.isSafeInteger(throughRevision) || throughRevision < 0) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'INVALID_REQUEST',
						'Recovery discard request is invalid.'
					)
				})
			)
		}
		return invoke(
			desktopRuntimeChannels.projectDiscardRecovery,
			{ ...runtimeCall, handle: validHandle.value, throughRevision },
			(value) =>
				validValue(
					value,
					(input): input is { readonly discardedThroughRevision: number } =>
						record(input) &&
						exactKeys(input, ['discardedThroughRevision']) &&
						Number.isSafeInteger(input.discardedThroughRevision) &&
						Number(input.discardedThroughRevision) >= 0,
					'Recovery discard acknowledgement is invalid.'
				)
		)
	}
})

const settingsRuntime: SettingsRuntime = Object.freeze({
	get: () => invoke(desktopRuntimeChannels.settingsGet, runtimeCall, validateSettingsSnapshot),
	set: (snapshot) => {
		const validated = validateSettingsSnapshot(snapshot)
		return validated.ok
			? invoke(
					desktopRuntimeChannels.settingsSet,
					{ ...runtimeCall, snapshot: validated.value },
					validateSettingsSnapshot
				)
			: Promise.resolve(validated)
	}
})

function notifyCloseRequested(): void {
	for (const listener of closeListeners) listener()
}

const lifecycleRuntime: LifecycleRuntime = Object.freeze({
	ready: () =>
		invoke(desktopRuntimeChannels.lifecycleReady, runtimeCall, (value) =>
			validValue(
				value,
				(input): input is null => input === null,
				'Lifecycle result is invalid.'
			)
		),
	requestClose: () => {
		notifyCloseRequested()
		return invoke(desktopRuntimeChannels.lifecycleCloseRequested, runtimeCall, (value) =>
			validValue(
				value,
				(input): input is 'closed' | 'close-deferred' =>
					input === 'closed' || input === 'close-deferred',
				'Lifecycle close result is invalid.'
			)
		)
	},
	onCloseRequested: (listener) => {
		closeListeners.add(listener)
		return () => closeListeners.delete(listener)
	}
})

ipcRenderer.on(desktopRuntimeChannels.engineEvent, (_event, input: unknown) => {
	const validated = validateEngineEventEnvelope(input)
	if (!validated.ok) return
	for (const listener of engineEvents) listener(validated.value)
})

ipcRenderer.on(desktopRuntimeChannels.engineHealth, (_event, input: unknown) => {
	const validated = validateAudioHealthSnapshot(input)
	if (!validated.ok) return
	for (const listener of engineHealth) listener(validated.value)
})

ipcRenderer.on(desktopRuntimeChannels.lifecycleCloseRequested, () => {
	notifyCloseRequested()
	void invoke(desktopRuntimeChannels.lifecycleCloseRequested, runtimeCall, (value) =>
		validValue(
			value,
			(input): input is 'closed' | 'close-deferred' =>
				input === 'closed' || input === 'close-deferred',
			'Lifecycle close result is invalid.'
		)
	)
})

const bridge: DesktopRuntimeBridge = Object.freeze({
	version: applicationRuntimeVersion,
	target: 'desktop',
	platform: desktopPlatform(process.platform),
	capabilities: Object.freeze({
		projects: Object.freeze({ availability: 'available' as const, api: projectsRuntime }),
		engine: Object.freeze({ availability: 'available' as const, api: engineRuntime }),
		settings: Object.freeze({ availability: 'available' as const, api: settingsRuntime }),
		commands: unavailable.commands,
		lifecycle: Object.freeze({ availability: 'available' as const, api: lifecycleRuntime })
	}),
	window: Object.freeze({
		minimize: () =>
			invoke(desktopRuntimeChannels.windowMinimize, runtimeCall, (value) =>
				validValue(
					value,
					(input): input is null => input === null,
					'Window result is invalid.'
				)
			),
		toggleMaximize: () =>
			invoke(desktopRuntimeChannels.windowToggleMaximize, runtimeCall, (value) =>
				validValue(
					value,
					(input): input is { readonly maximized: boolean } =>
						record(input) &&
						exactKeys(input, ['maximized']) &&
						typeof input.maximized === 'boolean',
					'Window state is invalid.'
				)
			),
		requestClose: lifecycleRuntime.requestClose
	})
})

contextBridge.exposeInMainWorld('tiempioRuntime', bridge)
