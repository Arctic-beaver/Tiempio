import { contextBridge, ipcRenderer } from 'electron'
import {
	applicationRuntimeVersion,
	createUnavailableRuntime,
	type DesktopPlatform,
	type DesktopRuntimeBridge
} from '../../../packages/contracts/src/application-runtime.js'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'

function desktopPlatform(platform: NodeJS.Platform): DesktopPlatform {
	if (platform === 'darwin') return 'macos'
	if (platform === 'win32') return 'windows'
	return 'linux'
}

const unavailable = createUnavailableRuntime('desktop')

const bridge: DesktopRuntimeBridge = Object.freeze({
	version: applicationRuntimeVersion,
	target: 'desktop',
	platform: desktopPlatform(process.platform),
	capabilities: Object.freeze({
		projects: unavailable.projects,
		engine: unavailable.engine,
		settings: unavailable.settings,
		commands: unavailable.commands,
		lifecycle: Object.freeze({
			availability: 'available' as const,
			api: Object.freeze({
				ready: async () => Object.freeze({ ok: true as const, value: null }),
				requestClose: () => ipcRenderer.invoke(desktopRuntimeChannels.windowRequestClose),
				onCloseRequested: () => () => undefined
			})
		})
	}),
	window: Object.freeze({
		minimize: () => ipcRenderer.invoke(desktopRuntimeChannels.windowMinimize),
		toggleMaximize: () => ipcRenderer.invoke(desktopRuntimeChannels.windowToggleMaximize),
		requestClose: () => ipcRenderer.invoke(desktopRuntimeChannels.windowRequestClose)
	})
})

contextBridge.exposeInMainWorld('tiempioRuntime', bridge)
