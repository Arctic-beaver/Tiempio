import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationRuntimeVersion,
	createUnavailableRuntime,
	desktopRuntimeLimits,
	sanitizeApplicationError,
	validateAudioHealthSnapshot,
	validateDesktopRuntimeBridge,
	validatePersistenceOutcome,
	validateProjectHandle,
	validateProjectLoadEnvelope,
	validateRecoveryCandidates,
	validateProjectSnapshotEnvelope,
	validateSettingsSnapshot
} from './index.js'

describe('Desktop runtime payload validation', () => {
	it('migrates legacy settings and validates bounded physical shortcuts', () => {
		assert.deepEqual(validateSettingsSnapshot({ version: 1, colorScheme: 'dark' }), {
			ok: true,
			value: { version: 2, colorScheme: 'dark', shortcutOverrides: [] }
		})
		const current = validateSettingsSnapshot({
			version: 2,
			colorScheme: 'system',
			shortcutOverrides: [
				{
					commandId: 'note.move-left',
					bindings: [
						{
							alt: true,
							code: 'ArrowLeft',
							platform: 'all',
							primary: false,
							shift: false
						}
					]
				}
			]
		})
		assert.equal(current.ok, true)
		assert.equal(
			validateSettingsSnapshot({
				version: 2,
				colorScheme: 'system',
				shortcutOverrides: [
					{ commandId: 'note.delete', bindings: [] },
					{ commandId: 'note.delete', bindings: [] }
				]
			}).ok,
			false
		)
	})
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

	it('accepts only branded-shape project and recovery handles', () => {
		const projectHandle = `project:${'A'.repeat(64)}`
		const recoveryHandle = `recovery:${'B'.repeat(64)}`
		assert.equal(validateProjectHandle(projectHandle).ok, true)
		assert.equal(validateProjectHandle(projectHandle.toLowerCase()).ok, false)
		assert.equal(validateRecoveryCandidates([{ handle: recoveryHandle, revision: 8 }]).ok, true)
		assert.equal(
			validateRecoveryCandidates([
				{ handle: recoveryHandle, revision: 8 },
				{ handle: recoveryHandle, revision: 9 }
			]).ok,
			false
		)
	})

	it('owns loaded project bytes and rejects contradictory compatibility', () => {
		const source = new Uint8Array([4, 5, 6])
		const loaded = validateProjectLoadEnvelope({
			compatibility: 'supported',
			fingerprint: `sha256:${'C'.repeat(64)}`,
			saveAllowed: true,
			snapshot: { revision: 3, bytes: source }
		})
		assert.equal(loaded.ok, true)
		if (loaded.ok) assert.notEqual(loaded.value.snapshot.bytes, source)
		assert.equal(
			validateProjectLoadEnvelope({
				compatibility: 'unsupported',
				fingerprint: null,
				saveAllowed: true,
				snapshot: { revision: 0, bytes: source }
			}).ok,
			false
		)
	})

	it('validates every persistence outcome variant and sanitizes failures', () => {
		assert.equal(
			validatePersistenceOutcome({
				status: 'persisted',
				revision: 2,
				fingerprint: `sha256:${'D'.repeat(64)}`
			}).ok,
			true
		)
		const failed = validatePersistenceOutcome({
			status: 'failed',
			revision: 2,
			error: { code: 'UNKNOWN', message: 'private path' }
		})
		assert.equal(failed.ok, true)
		if (failed.ok && failed.value.status === 'failed') {
			assert.equal(failed.value.error.code, 'INTERNAL_ERROR')
			assert.equal(failed.value.error.message, 'private path')
		}
		assert.equal(
			validatePersistenceOutcome({ status: 'canceled', revision: 2, extra: true }).ok,
			false
		)
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
