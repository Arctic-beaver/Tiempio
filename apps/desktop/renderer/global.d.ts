import type { DesktopRuntimeBridge } from '../../../packages/contracts/src/application-runtime.js'

declare global {
	interface Window {
		readonly tiempioRuntime: DesktopRuntimeBridge
	}
}

export {}
