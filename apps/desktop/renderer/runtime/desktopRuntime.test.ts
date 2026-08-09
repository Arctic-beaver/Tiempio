import assert from 'node:assert/strict'
import test from 'node:test'
import {
	applicationRuntimeVersion,
	type DesktopRuntimeBridge
} from '../../../../packages/contracts/src/index.js'
import { createDesktopRuntime } from './desktopRuntime.js'

function bridge(platform: DesktopRuntimeBridge['platform']): DesktopRuntimeBridge {
	return Object.freeze({
		version: applicationRuntimeVersion,
		target: 'desktop',
		platform,
		window: Object.freeze({
			minimize: async () => Object.freeze({ ok: true as const, value: null }),
			toggleMaximize: async () =>
				Object.freeze({ ok: true as const, value: Object.freeze({ maximized: true }) }),
			requestClose: async () => Object.freeze({ ok: true as const, value: 'closed' as const })
		})
	})
}

test('Desktop adapter exposes custom chrome and window capabilities on Windows', () => {
	const result = createDesktopRuntime(bridge('windows'))
	assert.equal(result.ok, true)
	if (!result.ok) return
	assert.equal(result.value.windowChrome, 'custom')
	assert.equal(result.value.nativeWindow.availability, 'available')
	assert.equal(result.value.lifecycle.availability, 'available')
})

test('Desktop adapter preserves native macOS chrome', () => {
	const result = createDesktopRuntime(bridge('macos'))
	assert.equal(result.ok && result.value.windowChrome === 'native', true)
})
