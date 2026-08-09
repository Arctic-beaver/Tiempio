import type { ApplicationRuntimeHandshake } from '../../../packages/contracts/src/application-runtime.js'

declare global {
	interface Window {
		readonly tiempioRuntime: ApplicationRuntimeHandshake
	}
}

export {}
