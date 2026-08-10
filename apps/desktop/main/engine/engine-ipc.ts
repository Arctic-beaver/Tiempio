import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
	applicationError,
	applicationRuntimeVersion,
	validateEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineConnection
} from '../../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../../host/runtime-channels.js'
import { type EngineHostSupervisor } from './engine-host-supervisor.js'
import { type RendererAuthorization, type RendererAuthority } from '../renderer-authority.js'

interface EngineCall {
	readonly runtimeVersion: number
}

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const expected = [...keys].sort()
	const actual = Object.keys(value).sort()
	return (
		actual.length === expected.length && actual.every((key, index) => key === expected[index])
	)
}

function validCall(input: unknown): input is EngineCall {
	return (
		record(input) &&
		exactKeys(input, ['runtimeVersion']) &&
		input.runtimeVersion === applicationRuntimeVersion
	)
}

function invalidRequest(message: string): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('INVALID_REQUEST', message)
	})
}

function unavailable(): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('ENGINE_UNAVAILABLE', 'The native audio engine is unavailable.', {
			retryable: true
		})
	})
}

export interface EngineIpcController {
	dispose(): Promise<void>
}

export function registerEngineHandlers(
	authority: RendererAuthority,
	supervisor: EngineHostSupervisor | null
): EngineIpcController {
	let connected: { readonly generation: number; readonly webContents: WebContents } | null = null
	const authorize = (event: IpcMainInvokeEvent, call: unknown): RendererAuthorization | null => {
		if (!validCall(call)) return null
		return authority.authorize(event)
	}
	const connectedSender = (
		event: IpcMainInvokeEvent,
		call: unknown
	): RendererAuthorization | null => {
		const authorized = authorize(event, call)
		if (
			authorized === null ||
			connected === null ||
			connected.generation !== authorized.generation ||
			connected.webContents !== authorized.webContents
		) {
			return null
		}
		return authorized
	}

	const removeEvent = supervisor?.onEvent((event: AnyEngineEventEnvelope) => {
		if (connected === null || !authority.matches(connected.generation, connected.webContents)) {
			connected = null
			void supervisor.releaseRenderer()
			return
		}
		connected.webContents.send(desktopRuntimeChannels.engineEvent, event)
	})
	const removeHealth = supervisor?.onHealth((health: AudioHealthSnapshot) => {
		if (connected === null || !authority.matches(connected.generation, connected.webContents))
			return
		connected.webContents.send(desktopRuntimeChannels.engineHealth, health)
	})

	ipcMain.handle(
		desktopRuntimeChannels.engineConnect,
		async (event, call: unknown): Promise<ApplicationResult<EngineConnection>> => {
			const authorized = authorize(event, call)
			if (authorized === null) return invalidRequest('Engine connect request is invalid.')
			if (supervisor === null) return unavailable()
			connected = authorized
			return supervisor.connect()
		}
	)
	ipcMain.handle(desktopRuntimeChannels.engineDisconnect, async (event, call: unknown) => {
		if (connectedSender(event, call) === null) {
			return invalidRequest('Engine disconnect request is invalid.')
		}
		connected = null
		return supervisor?.disconnect() ?? unavailable()
	})
	ipcMain.handle(desktopRuntimeChannels.engineSend, async (event, call: unknown) => {
		if (
			!record(call) ||
			!exactKeys(call, ['runtimeVersion', 'command']) ||
			call.runtimeVersion !== applicationRuntimeVersion ||
			connectedSender(event, { runtimeVersion: call.runtimeVersion }) === null
		) {
			return invalidRequest('Engine command request is invalid.')
		}
		const command = validateEngineCommandEnvelope(call.command)
		if (!command.ok) return invalidRequest(command.message)
		return supervisor?.send(command.value) ?? unavailable()
	})
	ipcMain.handle(desktopRuntimeChannels.engineGetHealth, (event, call: unknown) => {
		if (connectedSender(event, call) === null) {
			return invalidRequest('Engine health request is invalid.')
		}
		return supervisor?.getHealth() ?? unavailable()
	})

	return Object.freeze({
		dispose: async () => {
			for (const channel of [
				desktopRuntimeChannels.engineConnect,
				desktopRuntimeChannels.engineDisconnect,
				desktopRuntimeChannels.engineSend,
				desktopRuntimeChannels.engineGetHealth
			]) {
				ipcMain.removeHandler(channel)
			}
			removeEvent?.()
			removeHealth?.()
			connected = null
			await supervisor?.releaseRenderer()
		}
	})
}
