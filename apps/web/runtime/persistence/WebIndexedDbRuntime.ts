import {
	applicationError,
	desktopRuntimeLimits,
	validateSettingsSnapshot,
	type ApplicationError,
	type ApplicationErrorCode,
	type ApplicationResult,
	type RecoveryCandidate,
	type RecoveryHandle,
	type SettingsRuntime,
	type SettingsSnapshot
} from '../../../../packages/contracts/src/index.js'
import {
	decodeRecoveryEnvelope,
	encodeCanonicalJson,
	encodeRecoveryEnvelope,
	parseProjectManifest,
	projectArchiveLimits,
	type RecoveryDecodeResult
} from '../../../../packages/project-format/src/index.js'

export const webIndexedDbSchema = Object.freeze({
	databaseName: 'tiempio-runtime',
	version: 1,
	stores: Object.freeze({ recoveries: 'recoveries', settings: 'settings' })
})

export const webIndexedDbLimits = Object.freeze({
	maximumRecoveries: desktopRuntimeLimits.maxRecoveryCandidates,
	maximumRecoveryBytes: projectArchiveLimits.maxManifestBytes * 2,
	transactionTimeoutMs: 5_000
})

export const defaultWebSettings = Object.freeze<SettingsSnapshot>({
	version: 3,
	colorScheme: 'system',
	metronome: Object.freeze({ enabled: false, volume: 0.65 }),
	shortcutOverrides: Object.freeze([])
})

export type WebIndexedDbStoreName =
	(typeof webIndexedDbSchema.stores)[keyof typeof webIndexedDbSchema.stores]

export interface WebIndexedDbStore {
	delete(key: IDBValidKey): Promise<void>
	get(key: IDBValidKey): Promise<unknown>
	getAll(limit: number): Promise<readonly unknown[]>
	put(key: IDBValidKey, value: unknown): Promise<void>
}

export interface WebIndexedDbPort {
	transaction<Value>(
		storeName: WebIndexedDbStoreName,
		mode: IDBTransactionMode,
		operation: (store: WebIndexedDbStore) => Promise<Value>
	): Promise<Value>
}

export class WebPersistenceError extends Error {
	public constructor(
		readonly code: ApplicationErrorCode,
		message: string,
		readonly retryable = false
	) {
		super(message)
		this.name = 'WebPersistenceError'
	}
}

function errorName(error: unknown): string | null {
	return typeof error === 'object' && error !== null && 'name' in error
		? String((error as { readonly name: unknown }).name)
		: null
}

export function webPersistenceApplicationError(error: unknown): ApplicationError {
	if (error instanceof WebPersistenceError) {
		return applicationError(error.code, error.message, { retryable: error.retryable })
	}
	if (errorName(error) === 'QuotaExceededError') {
		return applicationError('STORAGE_QUOTA_EXCEEDED', 'Browser storage quota was exceeded.', {
			retryable: true
		})
	}
	return applicationError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.', {
		retryable: true
	})
}

function plainRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
		? (value as Readonly<Record<string, unknown>>)
		: null
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
	const expected = [...keys].sort()
	const actual = Object.keys(value).sort()
	return (
		actual.length === expected.length && actual.every((key, index) => key === expected[index])
	)
}

function requestResult<Value>(request: IDBRequest<Value>): Promise<Value> {
	return new Promise<Value>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
	})
}

class BrowserIndexedDbStore implements WebIndexedDbStore {
	public constructor(private readonly store: IDBObjectStore) {}

	public async delete(key: IDBValidKey): Promise<void> {
		await requestResult(this.store.delete(key))
	}

	public get(key: IDBValidKey): Promise<unknown> {
		return requestResult(this.store.get(key))
	}

	public getAll(limit: number): Promise<readonly unknown[]> {
		return requestResult(this.store.getAll(undefined, limit))
	}

	public async put(key: IDBValidKey, value: unknown): Promise<void> {
		await requestResult(this.store.put(value, key))
	}
}

export class BrowserIndexedDbPort implements WebIndexedDbPort {
	readonly #factory: IDBFactory | null
	#databasePromise: Promise<IDBDatabase> | null = null

	public constructor(factory: IDBFactory | null = globalThis.indexedDB ?? null) {
		this.#factory = factory
	}

	async #open(): Promise<IDBDatabase> {
		if (this.#factory === null) {
			throw new WebPersistenceError(
				'STORAGE_UNAVAILABLE',
				'IndexedDB is unavailable in this browser.',
				true
			)
		}
		if (this.#databasePromise !== null) return await this.#databasePromise
		this.#databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = this.#factory!.open(
				webIndexedDbSchema.databaseName,
				webIndexedDbSchema.version
			)
			let settled = false
			const timeout = globalThis.setTimeout(() => {
				if (settled) return
				settled = true
				reject(new Error('IndexedDB open timed out.'))
			}, webIndexedDbLimits.transactionTimeoutMs)
			request.onupgradeneeded = () => {
				const database = request.result
				for (const store of Object.values(webIndexedDbSchema.stores)) {
					if (!database.objectStoreNames.contains(store))
						database.createObjectStore(store)
				}
			}
			request.onblocked = () => {
				if (settled) return
				settled = true
				globalThis.clearTimeout(timeout)
				reject(new Error('IndexedDB upgrade is blocked by another page.'))
			}
			request.onerror = () => {
				if (settled) return
				settled = true
				globalThis.clearTimeout(timeout)
				reject(request.error ?? new Error('IndexedDB could not be opened.'))
			}
			request.onsuccess = () => {
				if (settled) {
					request.result.close()
					return
				}
				settled = true
				globalThis.clearTimeout(timeout)
				request.result.onversionchange = () => request.result.close()
				resolve(request.result)
			}
		}).catch((error: unknown) => {
			this.#databasePromise = null
			throw error
		})
		return await this.#databasePromise
	}

	public async transaction<Value>(
		storeName: WebIndexedDbStoreName,
		mode: IDBTransactionMode,
		operation: (store: WebIndexedDbStore) => Promise<Value>
	): Promise<Value> {
		const database = await this.#open()
		const transaction = database.transaction(storeName, mode)
		let timeout: ReturnType<typeof globalThis.setTimeout> | null = null
		const completion = new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve()
			transaction.onerror = () =>
				reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
			timeout = globalThis.setTimeout(() => {
				try {
					transaction.abort()
				} catch {
					// The transaction may have completed while the timeout task was queued.
				}
				reject(new Error('IndexedDB transaction timed out.'))
			}, webIndexedDbLimits.transactionTimeoutMs)
		})
		try {
			const [value] = await Promise.all([
				operation(new BrowserIndexedDbStore(transaction.objectStore(storeName))),
				completion
			])
			return value
		} catch (error) {
			try {
				transaction.abort()
			} catch {
				// A completed or already-aborted transaction needs no further action.
			}
			throw error
		} finally {
			if (timeout !== null) globalThis.clearTimeout(timeout)
		}
	}
}

interface RecoveryRecord {
	readonly envelope: Uint8Array
	readonly identity: string
	readonly revision: number
	readonly schemaVersion: 1
}

function recoveryIdentity(handle: RecoveryHandle): string | null {
	return /^recovery:([A-F0-9]{64})$/u.exec(handle)?.[1] ?? null
}

function recoveryHandle(identity: string): RecoveryHandle {
	return `recovery:${identity}` as RecoveryHandle
}

function validateRecoveryRecord(input: unknown): RecoveryRecord {
	const record = plainRecord(input)
	if (
		record === null ||
		!exactKeys(record, ['schemaVersion', 'identity', 'revision', 'envelope']) ||
		record.schemaVersion !== 1 ||
		typeof record.identity !== 'string' ||
		!/^[A-F0-9]{64}$/u.test(record.identity) ||
		!Number.isSafeInteger(record.revision) ||
		Number(record.revision) < 0 ||
		!(record.envelope instanceof Uint8Array) ||
		record.envelope.byteLength > webIndexedDbLimits.maximumRecoveryBytes
	) {
		throw new WebPersistenceError('PROJECT_INVALID', 'A browser recovery record is corrupt.')
	}
	return Object.freeze({
		schemaVersion: 1,
		identity: record.identity,
		revision: Number(record.revision),
		envelope: new Uint8Array(record.envelope)
	})
}

export interface RestoredWebRecovery {
	readonly identity: string
	readonly recovery: Extract<RecoveryDecodeResult, { readonly status: 'loaded' | 'unsupported' }>
}

export class WebIndexedDbRuntime implements SettingsRuntime {
	public constructor(private readonly database: WebIndexedDbPort = new BrowserIndexedDbPort()) {}

	public async get(): Promise<ApplicationResult<SettingsSnapshot>> {
		try {
			const stored = await this.database.transaction(
				webIndexedDbSchema.stores.settings,
				'readonly',
				(store) => store.get('current')
			)
			if (stored === undefined) {
				return Object.freeze({ ok: true as const, value: defaultWebSettings })
			}
			const record = plainRecord(stored)
			if (
				record === null ||
				!exactKeys(record, ['schemaVersion', 'snapshot']) ||
				record.schemaVersion !== 1
			) {
				throw new WebPersistenceError('PROJECT_INVALID', 'Browser settings are corrupt.')
			}
			const validated = validateSettingsSnapshot(record.snapshot)
			if (!validated.ok) {
				throw new WebPersistenceError('PROJECT_INVALID', 'Browser settings are corrupt.')
			}
			return validated
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public async set(snapshot: SettingsSnapshot): Promise<ApplicationResult<SettingsSnapshot>> {
		const validated = validateSettingsSnapshot(snapshot)
		if (!validated.ok) return validated
		if (
			encodeCanonicalJson(validated.value).byteLength > desktopRuntimeLimits.maxSettingsBytes
		) {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'LIMIT_EXCEEDED',
					'Browser settings exceed their size limit.'
				)
			})
		}
		try {
			await this.database.transaction(
				webIndexedDbSchema.stores.settings,
				'readwrite',
				(store) => store.put('current', { schemaVersion: 1, snapshot: validated.value })
			)
			return Object.freeze({ ok: true as const, value: validated.value })
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public async writeRecovery(
		identity: string,
		manifestBytes: Uint8Array,
		revision: number
	): Promise<ApplicationResult<{ readonly revision: number }>> {
		try {
			if (!/^[A-F0-9]{64}$/u.test(identity)) {
				throw new WebPersistenceError(
					'INVALID_REQUEST',
					'The recovery identity is invalid.'
				)
			}
			const manifest = parseProjectManifest(manifestBytes)
			if (manifest.status !== 'loaded' || !Number.isSafeInteger(revision) || revision < 0) {
				throw new WebPersistenceError(
					'PROJECT_INVALID',
					'Only a supported project revision can be recovered.'
				)
			}
			const envelope = encodeRecoveryEnvelope(manifest.project, revision)
			if (envelope.byteLength > webIndexedDbLimits.maximumRecoveryBytes) {
				throw new WebPersistenceError(
					'PROJECT_TOO_LARGE',
					'The recovery record is too large.'
				)
			}
			const storedRevision = await this.database.transaction(
				webIndexedDbSchema.stores.recoveries,
				'readwrite',
				async (store) => {
					const currentValue = await store.get(identity)
					if (currentValue !== undefined) {
						const current = validateRecoveryRecord(currentValue)
						if (current.revision > revision) return current.revision
					}
					await store.put(identity, {
						schemaVersion: 1,
						identity,
						revision,
						envelope: new Uint8Array(envelope)
					})
					return revision
				}
			)
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ revision: storedRevision })
			})
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public async listRecoveries(): Promise<ApplicationResult<readonly RecoveryCandidate[]>> {
		try {
			const stored = await this.database.transaction(
				webIndexedDbSchema.stores.recoveries,
				'readonly',
				(store) => store.getAll(webIndexedDbLimits.maximumRecoveries + 1)
			)
			if (stored.length > webIndexedDbLimits.maximumRecoveries) {
				throw new WebPersistenceError(
					'LIMIT_EXCEEDED',
					'Too many browser recoveries exist.'
				)
			}
			const candidates = stored.map((value) => {
				const record = validateRecoveryRecord(value)
				const recovery = decodeRecoveryEnvelope(record.envelope)
				if (recovery.status === 'invalid' || recovery.revision !== record.revision) {
					throw new WebPersistenceError(
						'PROJECT_INVALID',
						'A browser recovery is corrupt.'
					)
				}
				return Object.freeze({
					handle: recoveryHandle(record.identity),
					revision: record.revision
				})
			})
			return Object.freeze({
				ok: true as const,
				value: Object.freeze(
					candidates.sort((left, right) => right.revision - left.revision)
				)
			})
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public async restoreRecovery(
		handle: RecoveryHandle
	): Promise<ApplicationResult<RestoredWebRecovery>> {
		try {
			const identity = recoveryIdentity(handle)
			if (identity === null) {
				throw new WebPersistenceError('INVALID_REQUEST', 'The recovery handle is invalid.')
			}
			const value = await this.database.transaction(
				webIndexedDbSchema.stores.recoveries,
				'readonly',
				(store) => store.get(identity)
			)
			if (value === undefined) {
				throw new WebPersistenceError('PROJECT_MISSING', 'The recovery record is missing.')
			}
			const record = validateRecoveryRecord(value)
			const recovery = decodeRecoveryEnvelope(record.envelope)
			if (recovery.status === 'invalid' || recovery.revision !== record.revision) {
				throw new WebPersistenceError('PROJECT_INVALID', 'The recovery record is corrupt.')
			}
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ identity, recovery })
			})
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public async discardRecovery(
		handle: RecoveryHandle,
		throughRevision: number
	): Promise<ApplicationResult<{ readonly discardedThroughRevision: number }>> {
		try {
			const identity = recoveryIdentity(handle)
			if (
				identity === null ||
				!Number.isSafeInteger(throughRevision) ||
				throughRevision < 0
			) {
				throw new WebPersistenceError(
					'INVALID_REQUEST',
					'The recovery discard request is invalid.'
				)
			}
			const discarded = await this.database.transaction(
				webIndexedDbSchema.stores.recoveries,
				'readwrite',
				async (store) => {
					const value = await store.get(identity)
					if (value === undefined) {
						throw new WebPersistenceError(
							'PROJECT_MISSING',
							'The recovery record is missing.'
						)
					}
					const record = validateRecoveryRecord(value)
					if (throughRevision < record.revision) {
						throw new WebPersistenceError(
							'PROJECT_CHANGED',
							'A newer recovery revision is still required.',
							true
						)
					}
					await store.delete(identity)
					return record.revision
				}
			)
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ discardedThroughRevision: discarded })
			})
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}
}
