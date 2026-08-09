import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	acknowledgesPersistedRevision,
	applicationRuntimeVersion,
	createUnavailableRuntime,
	validateApplicationRuntime,
	type ApplicationRuntime,
	type PersistenceOutcome
} from './application-runtime.js'

describe('ApplicationRuntime contracts', () => {
	it('fails a runtime version mismatch before application creation', () => {
		const runtime = {
			...createUnavailableRuntime('desktop'),
			version: applicationRuntimeVersion + 1
		} as unknown as ApplicationRuntime
		const result = validateApplicationRuntime(runtime)
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.error.code, 'RUNTIME_VERSION_MISMATCH')
	})

	it('represents unavailable capabilities as typed values', () => {
		const webRuntime = createUnavailableRuntime('web')
		assert.deepEqual(webRuntime.nativeWindow, {
			availability: 'unavailable',
			reason: 'platform-unsupported',
			error: {
				code: 'OPERATION_UNAVAILABLE',
				message: 'Native window integration is unavailable on the Web.',
				retryable: false,
				details: null
			}
		})
	})

	it('does not acknowledge download as persisted project state', () => {
		const downloaded: PersistenceOutcome = {
			status: 'download-requested',
			revision: 7,
			suggestedName: 'song.tiempio'
		}
		const persisted: PersistenceOutcome = {
			status: 'persisted',
			revision: 7,
			fingerprint: 'sha256:example'
		}
		assert.equal(acknowledgesPersistedRevision(downloaded), false)
		assert.equal(acknowledgesPersistedRevision(persisted), true)
	})
})
