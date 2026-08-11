import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
	applicationError,
	desktopRuntimeLimits,
	validateSettingsSnapshot,
	type ApplicationResult,
	type RecoveryCandidate,
	type RecoveryHandle,
	type SettingsRuntime,
	type SettingsSnapshot
} from '../../../../packages/contracts/src/index.js'
import {
	decodeRecoveryEnvelope,
	decodeUtf8,
	encodeCanonicalJson,
	encodeRecoveryEnvelope,
	parseProjectManifest,
	projectArchiveLimits,
	type RecoveryDecodeResult
} from '../../../../packages/project-format/src/index.js'
import {
	atomicReplaceFile,
	fingerprintFile,
	readBoundedFile,
	type PersistenceFaultInjector
} from './atomic-file.js'
import { PersistenceBoundaryError, persistenceApplicationError } from './persistence-error.js'

const recoveryFilePattern = /^([A-F0-9]{64})\.recovery$/u
const settingsFileName = 'settings-v1.json'
const defaultSettings = Object.freeze({
	version: 3 as const,
	colorScheme: 'system' as const,
	metronome: Object.freeze({ enabled: false, volume: 0.65 }),
	shortcutOverrides: Object.freeze([])
})

async function currentFingerprint(path: string, maximumBytes: number): Promise<string | null> {
	try {
		return await fingerprintFile(path, maximumBytes)
	} catch (error) {
		if (error instanceof PersistenceBoundaryError && error.code === 'PROJECT_MISSING')
			return null
		throw error
	}
}

function recoveryHandle(identity: string): RecoveryHandle {
	return `recovery:${identity}` as RecoveryHandle
}

function recoveryIdentity(handle: RecoveryHandle): string | null {
	const match = /^recovery:([A-F0-9]{64})$/u.exec(handle)
	return match?.[1] ?? null
}

export interface RestoredRecovery {
	readonly identity: string
	readonly recovery: Extract<RecoveryDecodeResult, { status: 'loaded' | 'unsupported' }>
}

export class RecoveryStore {
	public constructor(
		private readonly directory: string,
		private readonly faults?: PersistenceFaultInjector
	) {}

	public createIdentity(): string {
		return randomBytes(32).toString('hex').toUpperCase()
	}

	private path(identity: string): string {
		if (!/^[A-F0-9]{64}$/u.test(identity)) {
			throw new PersistenceBoundaryError(
				'INVALID_REQUEST',
				'The recovery identity is invalid.'
			)
		}
		return join(this.directory, `${identity}.recovery`)
	}

	public async write(
		identity: string,
		manifestBytes: Uint8Array,
		revision: number
	): Promise<ApplicationResult<{ readonly revision: number }>> {
		try {
			const manifest = parseProjectManifest(manifestBytes)
			if (manifest.status !== 'loaded') {
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'PROJECT_INVALID',
						'Only a supported project can be recovered.'
					)
				})
			}
			const path = this.path(identity)
			const bytes = encodeRecoveryEnvelope(manifest.project, revision)
			const maximum = projectArchiveLimits.maxManifestBytes * 2
			await atomicReplaceFile(path, bytes, {
				expectedFingerprint: await currentFingerprint(path, maximum),
				faults: this.faults,
				faultPoint: 'recovery-write'
			})
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ revision })
			})
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	public async list(): Promise<ApplicationResult<readonly RecoveryCandidate[]>> {
		try {
			await mkdir(this.directory, { recursive: true })
			const names = (await readdir(this.directory))
				.filter((name) => recoveryFilePattern.test(name))
				.sort()
			if (names.length > desktopRuntimeLimits.maxRecoveryCandidates) {
				throw new PersistenceBoundaryError(
					'LIMIT_EXCEEDED',
					'Too many recovery records are present.'
				)
			}
			const candidates: RecoveryCandidate[] = []
			for (const name of names) {
				const identity = recoveryFilePattern.exec(name)?.[1]
				if (identity === undefined) continue
				const decoded = decodeRecoveryEnvelope(
					await readBoundedFile(
						this.path(identity),
						projectArchiveLimits.maxManifestBytes * 2,
						this.faults
					)
				)
				if (decoded.status === 'invalid') continue
				candidates.push(
					Object.freeze({ handle: recoveryHandle(identity), revision: decoded.revision })
				)
			}
			return Object.freeze({ ok: true as const, value: Object.freeze(candidates) })
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	public async restore(handle: RecoveryHandle): Promise<ApplicationResult<RestoredRecovery>> {
		try {
			const identity = recoveryIdentity(handle)
			if (identity === null) {
				throw new PersistenceBoundaryError(
					'INVALID_REQUEST',
					'The recovery handle is invalid.'
				)
			}
			const recovery = decodeRecoveryEnvelope(
				await readBoundedFile(
					this.path(identity),
					projectArchiveLimits.maxManifestBytes * 2,
					this.faults
				)
			)
			if (recovery.status === 'invalid') {
				throw new PersistenceBoundaryError(
					'PROJECT_INVALID',
					'The recovery record is corrupt.'
				)
			}
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ identity, recovery })
			})
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	public async discard(
		handle: RecoveryHandle,
		throughRevision: number
	): Promise<ApplicationResult<{ readonly discardedThroughRevision: number }>> {
		const restored = await this.restore(handle)
		if (!restored.ok) {
			return Object.freeze({ ok: false as const, error: restored.error })
		}
		if (
			!Number.isSafeInteger(throughRevision) ||
			throughRevision < restored.value.recovery.revision
		) {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'PROJECT_CHANGED',
					'A newer recovery revision is still required.',
					{ retryable: true }
				)
			})
		}
		try {
			await rm(this.path(restored.value.identity))
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({
					discardedThroughRevision: restored.value.recovery.revision
				})
			})
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}
}

export class SettingsStore implements SettingsRuntime {
	private readonly path: string

	public constructor(
		directory: string,
		private readonly faults?: PersistenceFaultInjector
	) {
		this.path = join(directory, settingsFileName)
	}

	public async get(): Promise<ApplicationResult<SettingsSnapshot>> {
		try {
			const bytes = await readBoundedFile(
				this.path,
				desktopRuntimeLimits.maxSettingsBytes,
				this.faults
			)
			let parsed: unknown
			try {
				parsed = JSON.parse(decodeUtf8(bytes)) as unknown
			} catch {
				throw new PersistenceBoundaryError(
					'PROJECT_INVALID',
					'The settings file is invalid.'
				)
			}
			const validated = validateSettingsSnapshot(parsed)
			if (!validated.ok) {
				throw new PersistenceBoundaryError(
					'PROJECT_INVALID',
					'The settings file is invalid.'
				)
			}
			return validated
		} catch (error) {
			if (error instanceof PersistenceBoundaryError && error.code === 'PROJECT_MISSING') {
				return Object.freeze({ ok: true as const, value: defaultSettings })
			}
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	public async set(snapshot: SettingsSnapshot): Promise<ApplicationResult<SettingsSnapshot>> {
		const validated = validateSettingsSnapshot(snapshot)
		if (!validated.ok) return validated
		try {
			const bytes = encodeCanonicalJson(validated.value)
			await atomicReplaceFile(this.path, bytes, {
				expectedFingerprint: await currentFingerprint(
					this.path,
					desktopRuntimeLimits.maxSettingsBytes
				),
				faults: this.faults
			})
			return Object.freeze({ ok: true as const, value: validated.value })
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}
}
