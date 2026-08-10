import assert from 'node:assert/strict'
import test from 'node:test'
import { desktopRuntimeChannels } from '../host/runtime-channels.js'

test('Desktop runtime channels are one closed unique namespaced registry', () => {
	const channels = Object.values(desktopRuntimeChannels)
	assert.equal(new Set(channels).size, channels.length)
	assert.ok(channels.every((channel) => /^tiempio:[a-z-]+:[a-z-]+$/u.test(channel)))
	assert.equal(Object.isFrozen(desktopRuntimeChannels), true)
})
