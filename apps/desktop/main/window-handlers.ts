import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { applicationError, type ApplicationResult } from '../../../packages/contracts/src/index.js'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'

function ownerWindow(event: IpcMainInvokeEvent): ApplicationResult<BrowserWindow> {
	const window = BrowserWindow.fromWebContents(event.sender)
	return window === null
		? Object.freeze({
				ok: false as const,
				error: applicationError(
					'OPERATION_UNAVAILABLE',
					'The owning window is unavailable.'
				)
			})
		: Object.freeze({ ok: true as const, value: window })
}

export function registerWindowHandlers(): void {
	ipcMain.handle(desktopRuntimeChannels.windowMinimize, (event) => {
		const owner = ownerWindow(event)
		if (!owner.ok) return owner
		owner.value.minimize()
		return Object.freeze({ ok: true as const, value: null })
	})
	ipcMain.handle(desktopRuntimeChannels.windowToggleMaximize, (event) => {
		const owner = ownerWindow(event)
		if (!owner.ok) return owner
		if (owner.value.isMaximized()) owner.value.unmaximize()
		else owner.value.maximize()
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({ maximized: owner.value.isMaximized() })
		})
	})
	ipcMain.handle(desktopRuntimeChannels.windowRequestClose, (event) => {
		const owner = ownerWindow(event)
		if (!owner.ok) return owner
		owner.value.close()
		return Object.freeze({ ok: true as const, value: 'closed' as const })
	})
}
