import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type RecoveryHandle } from '../../../../packages/contracts/src/index.js'
import { createProject } from '../../../../packages/project-core/src/index.js'
import { encodeProjectManifest } from '../../../../packages/project-format/src/index.js'
import {
	WebIndexedDbRuntime,
	defaultWebSettings,
	type WebIndexedDbPort,
	type WebIndexedDbStore,
	type WebIndexedDbStoreName
} from './WebIndexedDbRuntime.js'

function clone<Value>(value: Value): Value {
	return value === undefined ? value : structuredClone(value)
}

class MemoryIndexedDbPort implements WebIndexedDbPort {
	readonly #stores = new Map<WebIndexedDbStoreName, Map<IDBValidKey, unknown>>([
		['recoveries', new Map()],
		['settings', new Map()]
	])
	#writeQueue: Promise<void> = Promise.resolve()
	public nextFailure: unknown = null

	public set(storeName: WebIndexedDbStoreName, key: IDBValidKey, value: unknown): void {
		this.#stores.get(storeName)?.set(key, clone(value))
	}

	public transaction<Value>(
		storeName: WebIndexedDbStoreName,
		mode: IDBTransactionMode,
		operation: (store: WebIndexedDbStore) => Promise<Value>
	): Promise<Value> {
		const execute = async (): Promise<Value> => {
			if (this.nextFailure !== null) {
				const failure = this.nextFailure
				this.nextFailure = null
				throw failure
			}
			const values = this.#stores.get(storeName)
			assert.notEqual(values, undefined)
			const store: WebIndexedDbStore = {
				delete: async (key) => {
					values?.delete(key)
				},
				get: async (key) => clone(values?.get(key)),
				getAll: async (limit) =>
					[...(values?.values() ?? [])].slice(0, limit).map((value) => clone(value)),
				put: async (key, value) => {
					values?.set(key, clone(value))
				}
			}
			return await operation(store)
		}
		if (mode === 'readonly') return execute()
		const previous = this.#writeQueue
		let release: () => void = () => undefined
		this.#writeQueue = new Promise<void>((resolve) => {
			release = resolve
		})
		return previous.then(execute).finally(release)
	}
}

const project = createProject({ projectId: 'project.web-recovery', title: 'Web recovery' })
const identity = 'A'.repeat(64)
const recoveryHandle = `recovery:${identity}` as RecoveryHandle

describe('Web IndexedDB settings and recovery runtime', () => {
	it('uses defaults only for an absent record and round-trips validated settings', async () => {
		const database = new MemoryIndexedDbPort()
		const storage = new WebIndexedDbRuntime(database)
		assert.deepEqual(await storage.get(), { ok: true, value: defaultWebSettings })

		const snapshot = {
			version: 3 as const,
			colorScheme: 'dark' as const,
			metronome: { enabled: true, volume: 0.4 },
			shortcutOverrides: []
		}
		assert.deepEqual(await storage.set(snapshot), { ok: true, value: snapshot })
		assert.deepEqual(await storage.get(), { ok: true, value: snapshot })
	})

	it('keeps the newest checksummed recovery and revision-guards discard', async () => {
		const storage = new WebIndexedDbRuntime(new MemoryIndexedDbPort())
		const manifest = encodeProjectManifest(project)
		assert.deepEqual(await storage.writeRecovery(identity, manifest, 8), {
			ok: true,
			value: { revision: 8 }
		})
		assert.deepEqual(await storage.writeRecovery(identity, manifest, 3), {
			ok: true,
			value: { revision: 8 }
		})
		assert.deepEqual(await storage.listRecoveries(), {
			ok: true,
			value: [{ handle: recoveryHandle, revision: 8 }]
		})
		const restored = await storage.restoreRecovery(recoveryHandle)
		assert.equal(restored.ok, true)
		if (restored.ok) {
			assert.equal(restored.value.recovery.status, 'loaded')
			assert.equal(restored.value.recovery.revision, 8)
		}
		const staleDiscard = await storage.discardRecovery(recoveryHandle, 7)
		assert.equal(staleDiscard.ok, false)
		if (!staleDiscard.ok) assert.equal(staleDiscard.error.code, 'PROJECT_CHANGED')
		assert.deepEqual(await storage.discardRecovery(recoveryHandle, 8), {
			ok: true,
			value: { discardedThroughRevision: 8 }
		})
	})

	it('fails closed for corrupt, quota, blocked and aborted storage', async () => {
		const database = new MemoryIndexedDbPort()
		const storage = new WebIndexedDbRuntime(database)
		database.set('settings', 'current', { schemaVersion: 99, snapshot: defaultWebSettings })
		const corrupt = await storage.get()
		assert.equal(corrupt.ok, false)
		if (!corrupt.ok) assert.equal(corrupt.error.code, 'PROJECT_INVALID')

		database.nextFailure = Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
		const quota = await storage.set(defaultWebSettings)
		assert.equal(quota.ok, false)
		if (!quota.ok) assert.equal(quota.error.code, 'STORAGE_QUOTA_EXCEEDED')

		for (const name of ['AbortError', 'BlockedError']) {
			database.nextFailure = Object.assign(new Error(name), { name })
			const unavailable = await storage.listRecoveries()
			assert.equal(unavailable.ok, false)
			if (!unavailable.ok) assert.equal(unavailable.error.code, 'STORAGE_UNAVAILABLE')
		}
	})
})
