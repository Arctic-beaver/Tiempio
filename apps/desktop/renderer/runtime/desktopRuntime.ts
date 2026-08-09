import {
	applicationError,
	applicationRuntimeVersion,
	createUnavailableRuntime,
	type ApplicationResult,
	type ApplicationRuntime,
	type ApplicationRuntimeHandshake
} from '../../../../packages/contracts/src/application-runtime.js'

export function createDesktopRuntime(
	handshake: ApplicationRuntimeHandshake = window.tiempioRuntime
): ApplicationResult<ApplicationRuntime> {
	if (handshake.version !== applicationRuntimeVersion || handshake.target !== 'desktop') {
		return Object.freeze({
			ok: false as const,
			error: applicationError(
				'RUNTIME_VERSION_MISMATCH',
				'The Desktop bridge is incompatible with this application.',
				{
					details: {
						expectedVersion: applicationRuntimeVersion,
						actualVersion: handshake.version,
						actualTarget: handshake.target
					}
				}
			)
		})
	}
	return Object.freeze({ ok: true as const, value: createUnavailableRuntime('desktop') })
}
