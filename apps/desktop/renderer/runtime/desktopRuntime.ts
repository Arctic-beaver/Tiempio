import {
	applicationError,
	applicationRuntimeVersion,
	createUnavailableRuntime,
	type ApplicationResult,
	type ApplicationRuntime,
	type DesktopRuntimeBridge
} from '../../../../packages/contracts/src/application-runtime.js'

export function createDesktopRuntime(
	bridge: DesktopRuntimeBridge = window.tiempioRuntime
): ApplicationResult<ApplicationRuntime> {
	if (bridge.version !== applicationRuntimeVersion || bridge.target !== 'desktop') {
		return Object.freeze({
			ok: false as const,
			error: applicationError(
				'RUNTIME_VERSION_MISMATCH',
				'The Desktop bridge is incompatible with this application.',
				{
					details: {
						expectedVersion: applicationRuntimeVersion,
						actualVersion: bridge.version,
						actualTarget: bridge.target
					}
				}
			)
		})
	}
	const unavailable = createUnavailableRuntime('desktop')
	return Object.freeze({
		ok: true as const,
		value: Object.freeze({
			...unavailable,
			windowChrome: bridge.platform === 'macos' ? 'native' : 'custom',
			nativeWindow: Object.freeze({
				availability: 'available' as const,
				api: Object.freeze({
					minimize: bridge.window.minimize,
					toggleMaximize: bridge.window.toggleMaximize
				})
			}),
			lifecycle: Object.freeze({
				availability: 'available' as const,
				api: Object.freeze({
					ready: async () => Object.freeze({ ok: true as const, value: null }),
					requestClose: bridge.window.requestClose,
					onCloseRequested: () => () => undefined
				})
			})
		})
	})
}
