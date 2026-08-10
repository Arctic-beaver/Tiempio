import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationRuntimeVersion,
	createUnavailableRuntime,
	desktopRuntimeLimits,
	sanitizeApplicationError,
	validateAudioHealthSnapshot,
	validateDesktopRuntimeBridge,
	validateProjectSnapshotEnvelope
} from './index.js'

describe('Desktop runtime payload validation', () => {
	it('owns bounded project bytes at the process boundary', () => {
		const source = new Uint8Array([1, 2, 3])
		const result = validateProjectSnapshotEnvelope({ revision: 4, bytes: source })
		assert.equal(result.ok, true)
		if (!result.ok) return
		assert.notEqual(result.value.bytes, source)
		assert.deepEqual(result.value.bytes, source)

		assert.equal(
			validateProjectSnapshotEnvelope({
				revision: 5,
				bytes: new Uint8Array(desktopRuntimeLimits.maxProjectManifestBytes + 1)
			}).ok,
			false
		)
	})

	it('accepts a truthful bounded shared-audio health snapshot', () => {
		const health = {
			activeDeviceId: 'device-default',
			activeVoices: 1,
			backendState: 'ready',
			blockFrames: 128,
			deviceState: 'available',
			mode: 'shared',
			outputMuted: false,
			outputSignalObserved: true,
			projectRevision: 3,
			sampleRate: 48_000,
			underruns: 0
		}
		assert.equal(validateAudioHealthSnapshot(health).ok, true)
		assert.equal(validateAudioHealthSnapshot({ ...health, blockFrames: 4096 }).ok, false)
		assert.equal(validateAudioHealthSnapshot({ ...health, sampleRate: 384_000 }).ok, false)
	})

	it('rejects a capability that claims availability without an API object', () => {
		const unavailable = createUnavailableRuntime('desktop')
		assert.equal(
			validateDesktopRuntimeBridge({
				version: applicationRuntimeVersion,
				target: 'desktop',
				platform: 'windows',
				capabilities: {
					projects: unavailable.projects,
					engine: unavailable.engine,
					settings: unavailable.settings,
					commands: unavailable.commands,
					lifecycle: { availability: 'available', api: null }
				},
				window: {
					minimize: () => undefined,
					toggleMaximize: () => undefined,
					requestClose: () => undefined
				}
			}).ok,
			false
		)
	})

	it('redacts malformed cross-process errors', () => {
		assert.deepEqual(sanitizeApplicationError({ code: 'UNKNOWN', message: 42 }), {
			code: 'INTERNAL_ERROR',
			message: 'The operation failed.',
			retryable: false,
			details: null
		})
		assert.deepEqual(
			sanitizeApplicationError({
				code: 'INTERNAL_ERROR',
				message: 'Failure',
				details: { finite: 2, invalid: Number.POSITIVE_INFINITY }
			}).details,
			{ finite: 2 }
		)
	})
})
