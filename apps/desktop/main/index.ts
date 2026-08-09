import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

function createWindow(): BrowserWindow {
	const window = new BrowserWindow({
		width: 1280,
		height: 800,
		show: false,
		webPreferences: {
			preload: join(__dirname, '../preload/index.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	})
	window.once('ready-to-show', () => window.show())
	const developmentUrl = process.env.ELECTRON_RENDERER_URL
	if (!app.isPackaged && developmentUrl !== undefined) void window.loadURL(developmentUrl)
	else void window.loadFile(join(__dirname, '../renderer/index.html'))
	return window
}

void app.whenReady().then(() => {
	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
