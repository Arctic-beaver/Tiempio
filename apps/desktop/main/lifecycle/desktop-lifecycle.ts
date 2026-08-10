import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
	applicationError,
	applicationRuntimeVersion,
	type ApplicationResult
} from '../../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../../host/runtime-channels.js'
import { type EngineHostSupervisor } from '../engine/engine-host-supervisor.js'
import { type PersistenceIpcController } from '../persistence/persistence-ipc.js'
import { type ProjectPersistenceService } from '../persistence/project-persistence-service.js'
import { type RendererAuthority } from '../renderer-authority.js'

interface RuntimeCall {
	readonly runtimeVersion: number
}

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function validCall(input: unknown): input is RuntimeCall {
	return (
		record(input) &&
		Object.keys(input).length === 1 &&
		input.runtimeVersion === applicationRuntimeVersion
	)
}

function invalidRequest(message: string): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('INVALID_REQUEST', message)
	})
}

export interface DesktopLifecycleController {
	dispose(): void
	requestClose(): Promise<ApplicationResult<'closed' | 'close-deferred'>>
}

export function registerDesktopLifecycle(
	window: BrowserWindow,
	authority: RendererAuthority,
	persistence: PersistenceIpcController,
	projects: ProjectPersistenceService,
	supervisor: EngineHostSupervisor | null
): DesktopLifecycleController {
	let allowClose = false
	let closeRequestedSent = false
	let closeFallback: ReturnType<typeof setTimeout> | null = null
	let closing: Promise<ApplicationResult<'closed' | 'close-deferred'>> | null = null
	let rendererReady = false

	const authorize = (event: IpcMainInvokeEvent, input: unknown): boolean =>
		validCall(input) && authority.authorize(event) !== null
	const signalCloseRequested = (): void => {
		if (closeRequestedSent || !rendererReady || window.isDestroyed()) return
		closeRequestedSent = true
		window.webContents.send(desktopRuntimeChannels.lifecycleCloseRequested)
	}
	const requestClose = (): Promise<ApplicationResult<'closed' | 'close-deferred'>> => {
		if (closing !== null) return closing
		if (closeFallback !== null) {
			clearTimeout(closeFallback)
			closeFallback = null
		}
		signalCloseRequested()
		persistence.beginClose()
		closing = (async () => {
			const idle = await persistence.awaitIdle()
			const recovered = idle.ok
				? await projects.awaitRecoveryBarrier()
				: Object.freeze({ ok: false as const, error: idle.error })
			const engine = recovered.ok
				? await supervisor?.disconnect()
				: Object.freeze({ ok: false as const, error: recovered.error })
			if (!idle.ok || !recovered.ok || (engine !== undefined && !engine.ok)) {
				persistence.cancelClose()
				closeRequestedSent = false
				closing = null
				return Object.freeze({ ok: true as const, value: 'close-deferred' as const })
			}
			allowClose = true
			if (!window.isDestroyed()) window.close()
			return Object.freeze({ ok: true as const, value: 'closed' as const })
		})()
		return closing
	}

	const closeListener = (event: Electron.Event): void => {
		if (allowClose) return
		event.preventDefault()
		signalCloseRequested()
		if (!rendererReady) void requestClose()
		else {
			closeFallback ??= setTimeout(() => {
				closeFallback = null
				void requestClose()
			}, 1_000)
		}
	}
	window.on('close', closeListener)

	ipcMain.handle(desktopRuntimeChannels.lifecycleReady, (event, input: unknown) => {
		if (!authorize(event, input)) return invalidRequest('Lifecycle ready request is invalid.')
		rendererReady = true
		return Object.freeze({ ok: true as const, value: null })
	})
	ipcMain.handle(desktopRuntimeChannels.lifecycleCloseRequested, (event, input: unknown) => {
		if (!authorize(event, input)) return invalidRequest('Lifecycle close request is invalid.')
		return requestClose()
	})
	ipcMain.handle(desktopRuntimeChannels.windowRequestClose, (event, input: unknown) => {
		if (!authorize(event, input)) return invalidRequest('Window close request is invalid.')
		return requestClose()
	})

	return Object.freeze({
		requestClose,
		dispose: () => {
			if (closeFallback !== null) clearTimeout(closeFallback)
			window.removeListener('close', closeListener)
			ipcMain.removeHandler(desktopRuntimeChannels.lifecycleReady)
			ipcMain.removeHandler(desktopRuntimeChannels.lifecycleCloseRequested)
			ipcMain.removeHandler(desktopRuntimeChannels.windowRequestClose)
		}
	})
}
