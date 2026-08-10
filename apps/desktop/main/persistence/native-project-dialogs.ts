import { basename } from 'node:path'
import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'

export interface SaveTargetSelection {
	readonly overwriteConfirmed: boolean
	readonly path: string
}

export interface ProjectDialogPort {
	chooseOpenProject(): Promise<string | null>
	chooseProjectDestination(suggestedName: string): Promise<SaveTargetSelection | null>
}

export class NativeProjectDialogs implements ProjectDialogPort {
	public constructor(private readonly owner: () => BrowserWindow | null) {}

	public async chooseOpenProject(): Promise<string | null> {
		const owner = this.owner()
		const options: OpenDialogOptions = {
			properties: ['openFile'],
			filters: [{ name: 'Tiempio project', extensions: ['tiempio'] }]
		}
		const result =
			owner === null
				? await dialog.showOpenDialog(options)
				: await dialog.showOpenDialog(owner, options)
		return result.canceled ? null : (result.filePaths[0] ?? null)
	}

	public async chooseProjectDestination(
		suggestedName: string
	): Promise<SaveTargetSelection | null> {
		const owner = this.owner()
		const safeName =
			basename(suggestedName).replace(/[^A-Za-z0-9._ -]/gu, '_') || 'project.tiempio'
		const options: SaveDialogOptions = {
			defaultPath: safeName.endsWith('.tiempio') ? safeName : `${safeName}.tiempio`,
			filters: [{ name: 'Tiempio project', extensions: ['tiempio'] }]
		}
		const result =
			owner === null
				? await dialog.showSaveDialog(options)
				: await dialog.showSaveDialog(owner, options)
		return result.canceled || result.filePath === undefined
			? null
			: Object.freeze({ path: result.filePath, overwriteConfirmed: true })
	}
}
