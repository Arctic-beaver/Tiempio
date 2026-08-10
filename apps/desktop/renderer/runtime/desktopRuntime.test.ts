import assert from 'node:assert/strict'
import test from 'node:test'
import {
	applicationRuntimeVersion,
	createUnavailableRuntime,
	type DesktopRuntimeBridge
} from '../../../../packages/contracts/src/index.js'
import { createDesktopRuntime } from './desktopRuntime.js'

function bridge(platform: DesktopRuntimeBridge['platform']): DesktopRuntimeBridge {
	const unavailable = createUnavailableRuntime('desktop')
	return Object.freeze({
		version: applicationRuntimeVersion,
		target: 'desktop',
		platform,
		capabilities: Object.freeze({
			projects: unavailable.projects,
			engine: unavailable.engine,
			settings: unavailable.settings,
			commands: unavailable.commands,
			lifecycle: Object.freeze({
				availability: 'available' as const,
				api: Object.freeze({
					ready: async () => Object.freeze({ ok: true as const, value: null }),
					requestClose: async () =>
						Object.freeze({ ok: true as const, value: 'closed' as const }),
					onCloseRequested: () => () => undefined
				})
			})
		}),
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
	assert.equal(result.value.engine.availability, 'unavailable')
})

test('Desktop adapter preserves native macOS chrome', () => {
	const result = createDesktopRuntime(bridge('macos'))
	assert.equal(result.ok && result.value.windowChrome === 'native', true)
})

test('Desktop adapter rejects an incomplete version-compatible bridge', () => {
	const incomplete = { ...bridge('windows') } as Record<string, unknown>
	delete incomplete.capabilities
	const result = createDesktopRuntime(incomplete as unknown as DesktopRuntimeBridge)
	assert.equal(result.ok, false)
	if (!result.ok) assert.equal(result.error.code, 'INVALID_REQUEST')
})
