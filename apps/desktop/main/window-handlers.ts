import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
	applicationError,
	applicationRuntimeVersion,
	type ApplicationResult
} from '../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'
import { type RendererAuthority } from './renderer-authority.js'

function ownerWindow(
	event: IpcMainInvokeEvent,
	input: unknown,
	authority: RendererAuthority
): ApplicationResult<Electron.BrowserWindow> {
	const validInput =
		typeof input === 'object' &&
		input !== null &&
		!Array.isArray(input) &&
		Object.keys(input).length === 1 &&
		'runtimeVersion' in input &&
		input.runtimeVersion === applicationRuntimeVersion
	const window = BrowserWindow.fromWebContents(event.sender)
	return !validInput || authority.authorize(event) === null || window === null
		? Object.freeze({
				ok: false as const,
				error: applicationError('INVALID_REQUEST', 'The window request is invalid.')
			})
		: Object.freeze({ ok: true as const, value: window })
}

export function registerWindowHandlers(authority: RendererAuthority): () => void {
	ipcMain.handle(desktopRuntimeChannels.windowMinimize, (event, input: unknown) => {
		const owner = ownerWindow(event, input, authority)
		if (!owner.ok) return owner
		owner.value.minimize()
		return Object.freeze({ ok: true as const, value: null })
	})
	ipcMain.handle(desktopRuntimeChannels.windowToggleMaximize, (event, input: unknown) => {
		const owner = ownerWindow(event, input, authority)
		if (!owner.ok) return owner
		if (owner.value.isMaximized()) owner.value.unmaximize()
		else owner.value.maximize()
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({ maximized: owner.value.isMaximized() })
		})
	})
	return () => {
		ipcMain.removeHandler(desktopRuntimeChannels.windowMinimize)
		ipcMain.removeHandler(desktopRuntimeChannels.windowToggleMaximize)
	}
}
