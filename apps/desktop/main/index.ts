import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { EngineHostSupervisor } from './engine/engine-host-supervisor.js'
import { registerEngineHandlers, type EngineIpcController } from './engine/engine-ipc.js'
import { resolveNativeHostBinary } from './engine/native-host-resolver.js'
import { packagedRendererUrl, RendererAuthority } from './renderer-authority.js'
import { registerWindowHandlers } from './window-handlers.js'
import { windowChromeOptions } from './window-options.js'

let engineController: EngineIpcController | null = null
let engineSupervisor: EngineHostSupervisor | null = null
let quitAfterEngineShutdown = false

function rendererTarget(): string {
	const developmentUrl = process.env.ELECTRON_RENDERER_URL
	return !app.isPackaged && developmentUrl !== undefined
		? developmentUrl
		: packagedRendererUrl(join(__dirname, '../renderer/index.html'))
}

function createWindow(): BrowserWindow {
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
	const target = rendererTarget()
	const authority = new RendererAuthority(window, target)
	engineController = registerEngineHandlers(authority, engineSupervisor)
	window.once('ready-to-show', () => window.show())
	window.once('closed', () => {
		const controller = engineController
		engineController = null
		void controller?.dispose()
	})
	void window.loadURL(target)
	return window
}

void app.whenReady().then(async () => {
	session.defaultSession.setPermissionRequestHandler((_webContents, _permission, respond) => {
		respond(false)
	})
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
	registerWindowHandlers()
	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('before-quit', (event) => {
	if (quitAfterEngineShutdown || engineSupervisor === null) return
	event.preventDefault()
	void engineSupervisor.disconnect().then((result) => {
		if (!result.ok) return
		quitAfterEngineShutdown = true
		app.quit()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
