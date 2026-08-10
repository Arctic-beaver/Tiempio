import { contextBridge, ipcRenderer } from 'electron'
import {
	applicationRuntimeVersion,
	createUnavailableRuntime,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type DesktopPlatform,
	type DesktopRuntimeBridge,
	type EngineConnection,
	type EngineRuntime
} from '../../../packages/contracts/src/application-runtime.js'
import {
	engineCapabilityCodes,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	type AnyEngineEventEnvelope
} from '../../../packages/contracts/src/engine-protocol.js'
import {
	sanitizeApplicationError,
	validateAudioHealthSnapshot
} from '../../../packages/contracts/src/application-runtime-validation.js'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'

function desktopPlatform(platform: NodeJS.Platform): DesktopPlatform {
	if (platform === 'darwin') return 'macos'
	if (platform === 'win32') return 'windows'
	return 'linux'
}

const unavailable = createUnavailableRuntime('desktop')
const engineEvents = new Set<(event: AnyEngineEventEnvelope) => void>()
const engineHealth = new Set<(health: AudioHealthSnapshot) => void>()

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function failedResult(input: unknown): ApplicationResult<never> | null {
	if (!record(input) || input.ok !== false || !record(input.error)) return null
	return Object.freeze({ ok: false as const, error: sanitizeApplicationError(input.error) })
}

async function invokeEngine<Value>(
	channel: string,
	payload: Readonly<Record<string, unknown>>,
	validateValue: (value: unknown) => value is Value
): Promise<ApplicationResult<Value>> {
	const input: unknown = await ipcRenderer.invoke(channel, payload)
	const failure = failedResult(input)
	if (failure !== null) return failure
	if (!record(input) || input.ok !== true || !validateValue(input.value)) {
		return Object.freeze({
			ok: false as const,
			error: sanitizeApplicationError(null)
		})
	}
	return Object.freeze({ ok: true as const, value: input.value })
}

function validConnection(value: unknown): value is EngineConnection {
	return (
		record(value) &&
		Object.keys(value).length === 2 &&
		typeof value.protocolVersion === 'number' &&
		Array.isArray(value.capabilities) &&
		value.capabilities.every(
			(capability) =>
				typeof capability === 'string' &&
				engineCapabilityCodes.includes(capability as (typeof engineCapabilityCodes)[number])
		)
	)
}

const engineRuntime: EngineRuntime = Object.freeze({
	connect: () =>
		invokeEngine(
			desktopRuntimeChannels.engineConnect,
			{ runtimeVersion: applicationRuntimeVersion },
			validConnection
		),
	disconnect: () =>
		invokeEngine(
			desktopRuntimeChannels.engineDisconnect,
			{ runtimeVersion: applicationRuntimeVersion },
			(value): value is null => value === null
		),
	send: (command) => {
		const validated = validateEngineCommandEnvelope(command)
		if (!validated.ok) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: sanitizeApplicationError({
						code: 'INVALID_REQUEST',
						message: validated.message,
						retryable: false,
						details: null
					})
				})
			)
		}
		return invokeEngine(
			desktopRuntimeChannels.engineSend,
			{ runtimeVersion: applicationRuntimeVersion, command: validated.value },
			(value): value is { readonly accepted: true } =>
				record(value) && Object.keys(value).length === 1 && value.accepted === true
		)
	},
	onEvent: (listener) => {
		engineEvents.add(listener)
		return () => engineEvents.delete(listener)
	},
	getHealth: () =>
		invokeEngine(
			desktopRuntimeChannels.engineGetHealth,
			{ runtimeVersion: applicationRuntimeVersion },
			(value): value is AudioHealthSnapshot => validateAudioHealthSnapshot(value).ok
		),
	onHealth: (listener) => {
		engineHealth.add(listener)
		return () => engineHealth.delete(listener)
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

const bridge: DesktopRuntimeBridge = Object.freeze({
	version: applicationRuntimeVersion,
	target: 'desktop',
	platform: desktopPlatform(process.platform),
	capabilities: Object.freeze({
		projects: unavailable.projects,
		engine: Object.freeze({ availability: 'available' as const, api: engineRuntime }),
		settings: unavailable.settings,
		commands: unavailable.commands,
		lifecycle: Object.freeze({
			availability: 'available' as const,
			api: Object.freeze({
				ready: async () => Object.freeze({ ok: true as const, value: null }),
				requestClose: () => ipcRenderer.invoke(desktopRuntimeChannels.windowRequestClose),
				onCloseRequested: () => () => undefined
			})
		})
	}),
	window: Object.freeze({
		minimize: () => ipcRenderer.invoke(desktopRuntimeChannels.windowMinimize),
		toggleMaximize: () => ipcRenderer.invoke(desktopRuntimeChannels.windowToggleMaximize),
		requestClose: () => ipcRenderer.invoke(desktopRuntimeChannels.windowRequestClose)
	})
})

contextBridge.exposeInMainWorld('tiempioRuntime', bridge)
