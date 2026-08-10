import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { NativeProjectDialogs } from './native-project-dialogs.js'
import { ProjectPersistenceService } from './project-persistence-service.js'
import { RecoveryStore, SettingsStore } from './recovery-settings-store.js'

export interface DesktopPersistenceServices {
	readonly projects: ProjectPersistenceService
	readonly settings: SettingsStore
}

export function createDesktopPersistenceServices(
	owner: () => BrowserWindow | null,
	userDataPath = app.getPath('userData')
): DesktopPersistenceServices {
	const root = join(userDataPath, 'runtime-v1')
	const recoveries = new RecoveryStore(join(root, 'recovery'))
	return Object.freeze({
		projects: new ProjectPersistenceService(new NativeProjectDialogs(owner), recoveries),
		settings: new SettingsStore(join(root, 'settings'))
	})
}
