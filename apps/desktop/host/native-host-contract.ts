import { engineProtocolVersion } from '../../../packages/contracts/src/index.js'

export const nativeHostBootstrapVersion = 1 as const
export const nativeHostTokenEnvironmentKey = 'TIEMPIO_NATIVE_HOST_TOKEN' as const
export const nativeHostTokenBytes = 32 as const

export const nativeHostOperationalLimits = Object.freeze({
	startupTimeoutMs: 10_000,
	heartbeatIntervalMs: 1_000,
	heartbeatFailureMs: 5_000,
	gracefulShutdownMs: 3_000,
	forcedCleanupConfirmationMs: 3_000,
	recoveryCloseBarrierMs: 10_000,
	maxRetainedStderrBytes: 64 * 1024,
	maxRendererEventsPerSecond: 30,
	maxAutomaticRestartsPerEpisode: 1
})

export interface NativeHostBootstrapAcknowledgement {
	readonly bootstrapVersion: typeof nativeHostBootstrapVersion
	readonly engineProtocolVersion: typeof engineProtocolVersion
	readonly tokenDigest: `sha256:${string}`
}

function record(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

export function validateNativeHostBootstrapAcknowledgement(
	input: unknown,
	expectedTokenDigest: string
): input is NativeHostBootstrapAcknowledgement {
	return (
		record(input) &&
		Object.keys(input).length === 3 &&
		input.bootstrapVersion === nativeHostBootstrapVersion &&
		input.engineProtocolVersion === engineProtocolVersion &&
		input.tokenDigest === expectedTokenDigest &&
		/^sha256:[A-F0-9]{64}$/u.test(expectedTokenDigest)
	)
}
