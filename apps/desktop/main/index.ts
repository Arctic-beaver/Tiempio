import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { EngineHostSupervisor } from './engine/engine-host-supervisor.js'
import { registerEngineHandlers, type EngineIpcController } from './engine/engine-ipc.js'
import { resolveNativeHostBinary } from './engine/native-host-resolver.js'
import {
	registerDesktopLifecycle,
	type DesktopLifecycleController
} from './lifecycle/desktop-lifecycle.js'
import {
	createDesktopPersistenceServices,
	type DesktopPersistenceServices
} from './persistence/desktop-persistence.js'
import {
	registerPersistenceHandlers,
	type PersistenceIpcController
} from './persistence/persistence-ipc.js'
import { packagedRendererUrl, RendererAuthority } from './renderer-authority.js'
import { registerWindowHandlers } from './window-handlers.js'
import { windowChromeOptions } from './window-options.js'

interface WindowControllers {
	readonly engine: EngineIpcController
	readonly lifecycle: DesktopLifecycleController
	readonly persistence: PersistenceIpcController
	readonly window: () => void
}

let activeWindow: BrowserWindow | null = null
let controllers: WindowControllers | null = null
let engineSupervisor: EngineHostSupervisor | null = null
let persistenceServices: DesktopPersistenceServices | null = null
let allowApplicationQuit = false
let coordinatedQuit: Promise<void> | null = null

function rendererTarget(): string {
	const developmentUrl = process.env.ELECTRON_RENDERER_URL
	return !app.isPackaged && developmentUrl !== undefined
		? developmentUrl
		: packagedRendererUrl(join(__dirname, '../renderer/index.html'))
}

function createWindow(): BrowserWindow {
	if (persistenceServices === null) throw new Error('Desktop persistence is not initialized.')
	const window = new BrowserWindow({
		...windowChromeOptions(process.platform),
		width: 1280,
		height: 800,
		minWidth: 360,
		minHeight: 480,
		show: false,
		webPreferences: {
			preload: join(__dirname, '../preload/index.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	})
	activeWindow = window
	const target = rendererTarget()
	const authority = new RendererAuthority(window, target)
	const engine = registerEngineHandlers(authority, engineSupervisor)
	const persistence = registerPersistenceHandlers(authority, persistenceServices)
	const lifecycle = registerDesktopLifecycle(
		window,
		authority,
		persistence,
		persistenceServices.projects,
		engineSupervisor
	)
	controllers = Object.freeze({
		engine,
		persistence,
		lifecycle,
		window: registerWindowHandlers(authority)
	})
	window.once('ready-to-show', () => window.show())
	window.once('closed', () => {
		const owned = controllers
		controllers = null
		activeWindow = null
		owned?.lifecycle.dispose()
		owned?.persistence.dispose()
		owned?.window()
		void owned?.engine.dispose()
	})
	void window.loadURL(target)
	return window
}

function focusPrimaryWindow(): void {
	if (activeWindow === null || activeWindow.isDestroyed()) return
	if (activeWindow.isMinimized()) activeWindow.restore()
	activeWindow.show()
	activeWindow.focus()
}

const ownsSingleInstance = app.requestSingleInstanceLock()
if (!ownsSingleInstance) {
	app.quit()
} else {
	app.on('second-instance', focusPrimaryWindow)
	void app.whenReady().then(async () => {
		session.defaultSession.setPermissionRequestHandler((_webContents, _permission, respond) => {
			respond(false)
		})
		persistenceServices = createDesktopPersistenceServices(() => activeWindow)
		try {
			const binary = await resolveNativeHostBinary({
				appPath: app.getAppPath(),
				architecture: process.arch,
				isPackaged: app.isPackaged,
				platform: process.platform,
				resourcesPath: process.resourcesPath
			})
			engineSupervisor = new EngineHostSupervisor(binary)
		} catch {
			engineSupervisor = null
		}
		createWindow()
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow()
			else focusPrimaryWindow()
		})
	})

	app.on('before-quit', (event) => {
		if (allowApplicationQuit) return
		event.preventDefault()
		if (coordinatedQuit !== null) return
		coordinatedQuit = (async () => {
			const closed = await controllers?.lifecycle.requestClose()
			if (closed !== undefined && (!closed.ok || closed.value !== 'closed')) {
				coordinatedQuit = null
				return
			}
			if (closed === undefined) {
				const engine = await engineSupervisor?.disconnect()
				if (engine !== undefined && !engine.ok) {
					coordinatedQuit = null
					return
				}
			}
			allowApplicationQuit = true
			app.quit()
		})()
	})

	app.on('window-all-closed', () => {
		if (process.platform === 'darwin') return
		allowApplicationQuit = true
		app.quit()
	})
}
