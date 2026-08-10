import { pathToFileURL } from 'node:url'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'

export interface RendererAuthorization {
	readonly generation: number
	readonly webContents: WebContents
}

export class RendererAuthority {
	readonly #expectedUrl: string
	readonly #window: BrowserWindow
	#generation = 0

	public constructor(window: BrowserWindow, expectedUrl: string) {
		this.#window = window
		this.#expectedUrl = new URL(expectedUrl).href
		window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
			if (isMainFrame) this.#generation += 1
		})
		window.webContents.on('will-navigate', (event, target) => {
			if (!this.#matchesExpected(target)) event.preventDefault()
		})
		window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
	}

	public get generation(): number {
		return this.#generation
	}

	public authorize(event: IpcMainInvokeEvent): RendererAuthorization | null {
		if (
			this.#window.isDestroyed() ||
			event.sender !== this.#window.webContents ||
			event.senderFrame !== this.#window.webContents.mainFrame ||
			!this.#matchesExpected(event.senderFrame.url)
		) {
			return null
		}
		return Object.freeze({ generation: this.#generation, webContents: event.sender })
	}

	public matches(generation: number, webContents: WebContents): boolean {
		return (
			!this.#window.isDestroyed() &&
			generation === this.#generation &&
			webContents === this.#window.webContents &&
			this.#matchesExpected(webContents.getURL())
		)
	}

	#matchesExpected(value: string): boolean {
		try {
			const actual = new URL(value)
			const expected = new URL(this.#expectedUrl)
			if (expected.protocol === 'file:') return actual.href === expected.href
			return actual.origin === expected.origin && actual.pathname === expected.pathname
		} catch {
			return false
		}
	}
}

export function packagedRendererUrl(rendererPath: string): string {
	return pathToFileURL(rendererPath).href
}
