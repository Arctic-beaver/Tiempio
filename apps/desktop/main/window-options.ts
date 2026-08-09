import type { BrowserWindowConstructorOptions } from 'electron'

export type WindowChromeOptions = Pick<
	BrowserWindowConstructorOptions,
	'frame' | 'titleBarStyle' | 'trafficLightPosition'
>

export function windowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
	if (platform === 'darwin') {
		return Object.freeze({
			frame: true,
			titleBarStyle: 'hiddenInset' as const,
			trafficLightPosition: Object.freeze({ x: 14, y: 14 })
		})
	}
	return Object.freeze({ frame: false })
}
