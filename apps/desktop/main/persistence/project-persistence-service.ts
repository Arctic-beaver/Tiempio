import { randomBytes } from 'node:crypto'
import {
	applicationError,
	validateProjectSnapshotEnvelope,
	type ApplicationResult,
	type PersistenceOutcome,
	type ProjectHandle,
	type ProjectLoadEnvelope,
	type ProjectSnapshotEnvelope,
	type ProjectsRuntime,
	type RecoveryCandidate,
	type RecoveryHandle
} from '../../../../packages/contracts/src/index.js'
import {
	parseProjectManifest,
	projectManifestPath,
	type LogicalArchiveEntry
} from '../../../../packages/project-format/src/index.js'
import {
	atomicReplaceFile,
	canonicalDestination,
	canonicalExistingFile,
	fingerprintFile,
	readBoundedFile,
	sha256Fingerprint,
	type PersistenceFaultInjector
} from './atomic-file.js'
import { type ProjectDialogPort, type SaveTargetSelection } from './native-project-dialogs.js'
import {
	decodePhysicalProjectArchive,
	encodePhysicalProjectArchive,
	physicalProjectArchiveLimits
} from './physical-project-archive.js'
import { PersistenceBoundaryError, persistenceApplicationError } from './persistence-error.js'
import { RecoveryStore } from './recovery-settings-store.js'

interface MutableProjectRecord {
	readonly handle: ProjectHandle
	readonly recoveryIdentity: string
	entries: readonly LogicalArchiveEntry[]
	fingerprint: string | null
	lastPersistedRevision: number | null
	manifestBytes: Uint8Array | null
	queue: Promise<void>
	sourceIdentity: string | null
	sourcePath: string | null
}

interface DestinationReservation {
	readonly expectedFingerprint: string | null
	readonly identity: string
	readonly path: string
}

function projectHandle(): ProjectHandle {
	return `project:${randomBytes(32).toString('hex').toUpperCase()}` as ProjectHandle
}

function failedPersistence(revision: number, error: unknown): PersistenceOutcome {
	return Object.freeze({
		status: 'failed' as const,
		revision,
		error: persistenceApplicationError(error)
	})
}

function ownedEntry(entry: LogicalArchiveEntry): LogicalArchiveEntry {
	return Object.freeze({ ...entry, bytes: new Uint8Array(entry.bytes) })
}

function manifestEntry(bytes: Uint8Array): LogicalArchiveEntry {
	const owned = new Uint8Array(bytes)
	return Object.freeze({
		path: projectManifestPath,
		bytes: owned,
		declaredBytes: owned.byteLength,
		compressedBytes: owned.byteLength
	})
}

function replaceManifest(
	entries: readonly LogicalArchiveEntry[],
	manifestBytes: Uint8Array
): readonly LogicalArchiveEntry[] {
	let replaced = false
	const updated = entries.map((entry) => {
		if (entry.path.toLocaleLowerCase('en-US') !== projectManifestPath) return ownedEntry(entry)
		replaced = true
		return manifestEntry(manifestBytes)
	})
	if (!replaced) updated.push(manifestEntry(manifestBytes))
	return Object.freeze(updated)
}

export class ProjectPersistenceService implements ProjectsRuntime {
	private readonly byHandle = new Map<ProjectHandle, MutableProjectRecord>()
	private readonly bySource = new Map<string, ProjectHandle>()
	private readonly destinationReservations = new Set<string>()
	private readonly pendingRecoveryWrites = new Set<
		Promise<ApplicationResult<{ readonly revision: number }>>
	>()
	private openQueue: Promise<void> = Promise.resolve()

	public constructor(
		private readonly dialogs: ProjectDialogPort,
		private readonly recoveries: RecoveryStore,
		private readonly faults?: PersistenceFaultInjector
	) {}

	private createRecord(
		initial: Partial<
			Pick<
				MutableProjectRecord,
				| 'entries'
				| 'fingerprint'
				| 'lastPersistedRevision'
				| 'manifestBytes'
				| 'recoveryIdentity'
				| 'sourceIdentity'
				| 'sourcePath'
			>
		> = {}
	): MutableProjectRecord {
		const record: MutableProjectRecord = {
			handle: projectHandle(),
			recoveryIdentity: initial.recoveryIdentity ?? this.recoveries.createIdentity(),
			entries: initial.entries ?? Object.freeze([]),
			fingerprint: initial.fingerprint ?? null,
			lastPersistedRevision: initial.lastPersistedRevision ?? null,
			manifestBytes:
				initial.manifestBytes === undefined || initial.manifestBytes === null
					? null
					: new Uint8Array(initial.manifestBytes),
			queue: Promise.resolve(),
			sourceIdentity: initial.sourceIdentity ?? null,
			sourcePath: initial.sourcePath ?? null
		}
		this.byHandle.set(record.handle, record)
		if (record.sourceIdentity !== null) this.bySource.set(record.sourceIdentity, record.handle)
		return record
	}

	private record(handle: ProjectHandle): MutableProjectRecord {
		if (!/^project:[A-F0-9]{64}$/u.test(handle)) {
			throw new PersistenceBoundaryError('INVALID_REQUEST', 'The project handle is invalid.')
		}
		const record = this.byHandle.get(handle)
		if (record === undefined) {
			throw new PersistenceBoundaryError(
				'INVALID_REQUEST',
				'The project handle is not active.'
			)
		}
		return record
	}

	private async serialize<Value>(
		record: MutableProjectRecord,
		operation: () => Promise<Value>
	): Promise<Value> {
		const previous = record.queue
		let release: () => void = () => undefined
		record.queue = new Promise<void>((resolve) => {
			release = resolve
		})
		await previous
		try {
			return await operation()
		} finally {
			release()
		}
	}

	private async serializeOpen<Value>(operation: () => Promise<Value>): Promise<Value> {
		const previous = this.openQueue
		let release: () => void = () => undefined
		this.openQueue = new Promise<void>((resolve) => {
			release = resolve
		})
		await previous
		try {
			return await operation()
		} finally {
			release()
		}
	}

	public async create(): Promise<ApplicationResult<ProjectHandle>> {
		return Object.freeze({ ok: true as const, value: this.createRecord().handle })
	}

	public async open(): Promise<ApplicationResult<ProjectHandle>> {
		const source = await this.dialogs.chooseOpenProject()
		if (source === null) {
			return Object.freeze({
				ok: false as const,
				error: applicationError('OPERATION_CANCELED', 'Open project was canceled.')
			})
		}
		return this.openSource(source)
	}

	public async openSource(sourcePath: string): Promise<ApplicationResult<ProjectHandle>> {
		return this.serializeOpen(async () => {
			try {
				const identity = await canonicalExistingFile(sourcePath)
				const existing = this.bySource.get(identity)
				if (existing !== undefined) {
					return Object.freeze({ ok: true as const, value: existing })
				}
				const archiveBytes = await readBoundedFile(
					identity,
					physicalProjectArchiveLimits.maxArchiveBytes,
					this.faults
				)
				const opened = decodePhysicalProjectArchive(archiveBytes)
				const logical = opened.logical
				if (logical.status === 'invalid') {
					throw new PersistenceBoundaryError(
						'PROJECT_INVALID',
						'The project archive is invalid.'
					)
				}
				const manifestBytes = logical.entries.find(
					(entry) => entry.path.toLocaleLowerCase('en-US') === projectManifestPath
				)?.bytes
				if (manifestBytes === undefined) {
					throw new PersistenceBoundaryError(
						'PROJECT_INVALID',
						'The project manifest is missing.'
					)
				}
				const record = this.createRecord({
					entries: logical.entries.map(ownedEntry),
					fingerprint: sha256Fingerprint(archiveBytes),
					manifestBytes,
					sourceIdentity: identity,
					sourcePath: identity
				})
				return Object.freeze({ ok: true as const, value: record.handle })
			} catch (error) {
				return Object.freeze({
					ok: false as const,
					error: persistenceApplicationError(error)
				})
			}
		})
	}

	public async load(handle: ProjectHandle): Promise<ApplicationResult<ProjectLoadEnvelope>> {
		try {
			const record = this.record(handle)
			if (record.manifestBytes === null) {
				throw new PersistenceBoundaryError(
					'PROJECT_MISSING',
					'The untitled project has no snapshot yet.'
				)
			}
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({
					fingerprint: record.fingerprint,
					snapshot: Object.freeze({
						revision: record.lastPersistedRevision ?? 0,
						bytes: new Uint8Array(record.manifestBytes)
					})
				})
			})
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	private validatedSnapshot(snapshot: ProjectSnapshotEnvelope): ProjectSnapshotEnvelope {
		const validated = validateProjectSnapshotEnvelope(snapshot)
		if (!validated.ok) {
			throw new PersistenceBoundaryError('INVALID_REQUEST', validated.error.message)
		}
		if (parseProjectManifest(validated.value.bytes).status !== 'loaded') {
			throw new PersistenceBoundaryError(
				'PROJECT_INVALID',
				'The project manifest cannot be persisted.'
			)
		}
		return validated.value
	}

	private buildArchive(
		record: MutableProjectRecord,
		snapshot: ProjectSnapshotEnvelope
	): { readonly bytes: Uint8Array; readonly entries: readonly LogicalArchiveEntry[] } {
		const entries = replaceManifest(record.entries, snapshot.bytes)
		return Object.freeze({ bytes: encodePhysicalProjectArchive(entries), entries })
	}

	private reserveDestination(
		record: MutableProjectRecord,
		selection: SaveTargetSelection
	): Promise<DestinationReservation> {
		return this.serializeOpen(async () => {
			if (!selection.path.toLocaleLowerCase('en-US').endsWith('.tiempio')) {
				throw new PersistenceBoundaryError(
					'INVALID_REQUEST',
					'The project destination must use .tiempio.'
				)
			}
			let identity: string
			let expectedFingerprint: string | null
			try {
				identity = await canonicalExistingFile(selection.path)
				if (!selection.overwriteConfirmed && identity !== record.sourceIdentity) {
					throw new PersistenceBoundaryError(
						'PROJECT_DESTINATION_CONFLICT',
						'Overwriting the selected destination was not confirmed.'
					)
				}
				expectedFingerprint =
					identity === record.sourceIdentity && record.fingerprint !== null
						? record.fingerprint
						: await fingerprintFile(
								identity,
								physicalProjectArchiveLimits.maxArchiveBytes
							)
			} catch (error) {
				if (
					!(error instanceof PersistenceBoundaryError) ||
					error.code !== 'PROJECT_MISSING'
				) {
					throw error
				}
				identity = await canonicalDestination(selection.path)
				expectedFingerprint = null
			}
			const owner = this.bySource.get(identity)
			if (
				(owner !== undefined && owner !== record.handle) ||
				this.destinationReservations.has(identity)
			) {
				throw new PersistenceBoundaryError(
					'PROJECT_DESTINATION_CONFLICT',
					'The selected destination is owned by another open project.'
				)
			}
			this.destinationReservations.add(identity)
			return Object.freeze({ identity, path: identity, expectedFingerprint })
		})
	}

	private async chooseDestination(
		record: MutableProjectRecord
	): Promise<DestinationReservation | null> {
		const selection = await this.dialogs.chooseProjectDestination('project.tiempio')
		return selection === null ? null : this.reserveDestination(record, selection)
	}

	private clearCoveredRecovery(record: MutableProjectRecord, revision: number): Promise<void> {
		return this.recoveries
			.discard(`recovery:${record.recoveryIdentity}` as RecoveryHandle, revision)
			.then(() => undefined)
	}

	private commitPersistedRecord(
		record: MutableProjectRecord,
		destination: DestinationReservation,
		entries: readonly LogicalArchiveEntry[],
		manifestBytes: Uint8Array,
		fingerprint: string,
		revision: number
	): void {
		if (record.sourceIdentity !== null && record.sourceIdentity !== destination.identity) {
			this.bySource.delete(record.sourceIdentity)
		}
		record.sourceIdentity = destination.identity
		record.sourcePath = destination.path
		record.fingerprint = fingerprint
		record.lastPersistedRevision = revision
		record.entries = entries.map(ownedEntry)
		record.manifestBytes = new Uint8Array(manifestBytes)
		this.bySource.set(destination.identity, record.handle)
	}

	private async persistTo(
		record: MutableProjectRecord,
		snapshotInput: ProjectSnapshotEnvelope,
		destination: DestinationReservation,
		updateSource: boolean
	): Promise<PersistenceOutcome> {
		try {
			const bounded = validateProjectSnapshotEnvelope(snapshotInput)
			if (!bounded.ok) {
				throw new PersistenceBoundaryError('INVALID_REQUEST', bounded.error.message)
			}
			const snapshot = this.validatedSnapshot(bounded.value)
			if (
				record.lastPersistedRevision !== null &&
				snapshot.revision < record.lastPersistedRevision
			) {
				throw new PersistenceBoundaryError(
					'PROJECT_CHANGED',
					'The save revision is stale.',
					true
				)
			}
			const archive = this.buildArchive(record, snapshot)
			const fingerprint = await atomicReplaceFile(destination.path, archive.bytes, {
				expectedFingerprint: destination.expectedFingerprint,
				faults: this.faults
			})
			if (!updateSource) {
				return Object.freeze({
					status: 'copy-written' as const,
					revision: snapshot.revision
				})
			}
			this.commitPersistedRecord(
				record,
				destination,
				archive.entries,
				snapshot.bytes,
				fingerprint,
				snapshot.revision
			)
			await this.clearCoveredRecovery(record, snapshot.revision)
			return Object.freeze({
				status: 'persisted' as const,
				revision: snapshot.revision,
				fingerprint
			})
		} catch (error) {
			return failedPersistence(snapshotInput.revision, error)
		} finally {
			this.destinationReservations.delete(destination.identity)
		}
	}

	public async persist(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			const record = this.record(handle)
			return this.serialize(record, async () => {
				if (record.sourcePath === null || record.sourceIdentity === null) {
					const destination = await this.chooseDestination(record)
					return destination === null
						? Object.freeze({
								status: 'canceled' as const,
								revision: snapshot.revision
							})
						: this.persistTo(record, snapshot, destination, true)
				}
				return this.persistTo(
					record,
					snapshot,
					Object.freeze({
						identity: record.sourceIdentity,
						path: record.sourcePath,
						expectedFingerprint: record.fingerprint
					}),
					true
				)
			})
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
	}

	public async persistAs(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			const record = this.record(handle)
			return this.serialize(record, async () => {
				const destination = await this.chooseDestination(record)
				return destination === null
					? Object.freeze({ status: 'canceled' as const, revision: snapshot.revision })
					: this.persistTo(record, snapshot, destination, true)
			})
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
	}

	public async saveCopy(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			const record = this.record(handle)
			return this.serialize(record, async () => {
				const bounded = validateProjectSnapshotEnvelope(snapshot)
				if (!bounded.ok) {
					return Object.freeze({
						status: 'failed' as const,
						revision: snapshot.revision,
						error: bounded.error
					})
				}
				const destination = await this.chooseDestination(record)
				if (destination === null) {
					return Object.freeze({
						status: 'canceled' as const,
						revision: snapshot.revision
					})
				}
				return this.persistTo(record, snapshot, destination, false)
			})
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
	}

	private async performRecoveryWrite(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<ApplicationResult<{ readonly revision: number }>> {
		try {
			const record = this.record(handle)
			return this.serialize(record, async () => {
				const validated = this.validatedSnapshot(snapshot)
				return this.recoveries.write(
					record.recoveryIdentity,
					validated.bytes,
					validated.revision
				)
			})
		} catch (error) {
			return Object.freeze({ ok: false as const, error: persistenceApplicationError(error) })
		}
	}

	public writeRecovery(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<ApplicationResult<{ readonly revision: number }>> {
		const operation = this.performRecoveryWrite(handle, snapshot)
		this.pendingRecoveryWrites.add(operation)
		void operation.then(
			() => this.pendingRecoveryWrites.delete(operation),
			() => this.pendingRecoveryWrites.delete(operation)
		)
		return operation
	}

	public async awaitRecoveryBarrier(timeoutMs = 10_000): Promise<ApplicationResult<null>> {
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'INVALID_REQUEST',
					'The recovery barrier timeout is invalid.'
				)
			})
		}
		const pending = [...this.pendingRecoveryWrites]
		if (pending.length === 0) return Object.freeze({ ok: true as const, value: null })
		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			const results = await Promise.race([
				Promise.all(pending),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Recovery close barrier timed out.')),
						timeoutMs
					)
				})
			])
			const failed = results.find((result) => !result.ok)
			return failed === undefined
				? Object.freeze({ ok: true as const, value: null })
				: Object.freeze({ ok: false as const, error: failed.error })
		} catch {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'STORAGE_UNAVAILABLE',
					'The latest recovery snapshot is not safely stored yet.',
					{ retryable: true }
				)
			})
		} finally {
			if (timeout !== undefined) clearTimeout(timeout)
		}
	}

	public listRecoveries(): Promise<ApplicationResult<readonly RecoveryCandidate[]>> {
		return this.recoveries.list()
	}

	public async restoreRecovery(
		handle: RecoveryHandle
	): Promise<ApplicationResult<ProjectHandle>> {
		const restored = await this.recoveries.restore(handle)
		if (!restored.ok) return Object.freeze({ ok: false as const, error: restored.error })
		const recovery = restored.value.recovery
		const manifest = manifestEntry(recovery.manifestBytes)
		const record = this.createRecord({
			entries: Object.freeze([manifest]),
			lastPersistedRevision: null,
			manifestBytes: recovery.manifestBytes,
			recoveryIdentity: restored.value.identity
		})
		return Object.freeze({ ok: true as const, value: record.handle })
	}

	public discardRecovery(
		handle: RecoveryHandle,
		throughRevision: number
	): Promise<ApplicationResult<{ readonly discardedThroughRevision: number }>> {
		return this.recoveries.discard(handle, throughRevision)
	}
}
