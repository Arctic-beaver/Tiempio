import { contextBridge, ipcRenderer } from 'electron'
import {
	applicationRuntimeVersion,
	type DesktopPlatform,
	type DesktopRuntimeBridge
} from '../../../packages/contracts/src/application-runtime.js'
import { desktopWindowChannels } from '../host/window-channels.js'

function desktopPlatform(platform: NodeJS.Platform): DesktopPlatform {
	if (platform === 'darwin') return 'macos'
	if (platform === 'win32') return 'windows'
	return 'linux'
}

const bridge: DesktopRuntimeBridge = Object.freeze({
	version: applicationRuntimeVersion,
	target: 'desktop',
	platform: desktopPlatform(process.platform),
	window: Object.freeze({
		minimize: () => ipcRenderer.invoke(desktopWindowChannels.minimize),
		toggleMaximize: () => ipcRenderer.invoke(desktopWindowChannels.toggleMaximize),
		requestClose: () => ipcRenderer.invoke(desktopWindowChannels.requestClose)
	})
})

contextBridge.exposeInMainWorld('tiempioRuntime', bridge)
