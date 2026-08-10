import {
	createUnavailableRuntime,
	validateDesktopRuntimeBridge,
	type ApplicationResult,
	type ApplicationRuntime,
	type DesktopRuntimeBridge
} from '../../../../packages/contracts/src/index.js'

export function createDesktopRuntime(
	bridge: DesktopRuntimeBridge = window.tiempioRuntime
): ApplicationResult<ApplicationRuntime> {
	const validatedBridge = validateDesktopRuntimeBridge(bridge)
	if (!validatedBridge.ok) {
		return Object.freeze({
			ok: false as const,
			error: validatedBridge.error
		})
	}
	const safeBridge = validatedBridge.value
	const unavailable = createUnavailableRuntime('desktop')
	return Object.freeze({
		ok: true as const,
		value: Object.freeze({
			...unavailable,
			projects: safeBridge.capabilities.projects,
			engine: safeBridge.capabilities.engine,
			settings: safeBridge.capabilities.settings,
			commands: safeBridge.capabilities.commands,
			windowChrome: safeBridge.platform === 'macos' ? 'native' : 'custom',
			nativeWindow: Object.freeze({
				availability: 'available' as const,
				api: Object.freeze({
					minimize: safeBridge.window.minimize,
					toggleMaximize: safeBridge.window.toggleMaximize
				})
			}),
			lifecycle: safeBridge.capabilities.lifecycle
		})
	})
}
