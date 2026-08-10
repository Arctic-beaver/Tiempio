import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { RendererAuthority } from './renderer-authority.js'

class FakeWebContents extends EventEmitter {
	readonly mainFrame = { url: 'https://studio.test/app' }
	#url = this.mainFrame.url
	windowOpenHandler: (() => { action: 'deny' }) | null = null

	public getURL(): string {
		return this.#url
	}

	public setWindowOpenHandler(handler: () => { action: 'deny' }): void {
		this.windowOpenHandler = handler
	}

	public navigate(url: string): void {
		this.#url = url
		this.mainFrame.url = url
		this.emit('did-start-navigation', {}, url, false, true)
	}
}

test('renderer authority rejects foreign senders and invalidates subscriptions on reload', () => {
	const webContents = new FakeWebContents()
	const window = {
		isDestroyed: () => false,
		webContents
	} as unknown as BrowserWindow
	const authority = new RendererAuthority(window, 'https://studio.test/app')
	const event = {
		sender: webContents as unknown as WebContents,
		senderFrame: webContents.mainFrame
	} as unknown as IpcMainInvokeEvent
	const initial = authority.authorize(event)
	assert.equal(initial?.generation, 0)
	assert.equal(webContents.windowOpenHandler?.().action, 'deny')
	assert.equal(
		authority.authorize({ ...event, sender: {} } as unknown as IpcMainInvokeEvent),
		null
	)

	webContents.navigate('https://studio.test/app')
	assert.equal(
		authority.matches(initial?.generation ?? -1, webContents as unknown as WebContents),
		false
	)
	assert.equal(authority.authorize(event)?.generation, 1)

	let navigationDenied = false
	webContents.emit(
		'will-navigate',
		{ preventDefault: () => (navigationDenied = true) },
		'https://foreign.test/'
	)
	assert.equal(navigationDenied, true)
})
