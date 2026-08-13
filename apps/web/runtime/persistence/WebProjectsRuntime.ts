import {
	applicationError,
	validateProjectSnapshotEnvelope,
	type ApplicationError,
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
import type { PhysicalProjectArchive } from '../../../../packages/project-format/src/physical-archive.js'
import {
	BrowserProjectFilePort,
	type WebProjectFile,
	type WebProjectFileHandle,
	type WebProjectFilePort,
	type WebProjectOpenSelection,
	type WebProjectPickerPort,
	type WebProjectSaveSelection
} from './browserProjectFiles.js'
import { downloadProjectFile } from './browserProjectDownload.js'
import {
	WebIndexedDbRuntime,
	WebPersistenceError,
	webPersistenceApplicationError
} from './WebIndexedDbRuntime.js'

const suggestedProjectName = 'project.tiempio'

interface PhysicalArchiveCodec {
	decodePhysicalProjectArchive(bytes: Uint8Array): PhysicalProjectArchive
	encodePhysicalProjectArchive(entries: readonly LogicalArchiveEntry[]): Uint8Array
	physicalProjectArchiveLimits: { readonly maxArchiveBytes: number }
	PhysicalProjectArchiveError: typeof import('../../../../packages/project-format/src/physical-archive.js').PhysicalProjectArchiveError
}

export interface WebProjectsRuntimeDependencies {
	readonly createIdentity: () => string
	readonly files: WebProjectFilePort
	readonly fingerprint: (bytes: Uint8Array) => Promise<string>
	readonly loadArchiveCodec: () => Promise<PhysicalArchiveCodec>
	readonly storage: WebIndexedDbRuntime
}

interface MutableWebProjectRecord {
	readonly handle: ProjectHandle
	readonly recoveryIdentity: string
	compatibility: 'supported' | 'unsupported'
	entries: readonly LogicalArchiveEntry[]
	fingerprint: string | null
	formatSaveAllowed: boolean
	lastPersistedRevision: number | null
	manifestBytes: Uint8Array | null
	queue: Promise<void>
	sourceArchiveBytes: Uint8Array | null
	sourceHandle: WebProjectFileHandle | null
}

function bytesToHex(bytes: Uint8Array): string {
	let result = ''
	for (const byte of bytes) result += byte.toString(16).padStart(2, '0')
	return result.toUpperCase()
}

function defaultIdentity(): string {
	const bytes = new Uint8Array(32)
	globalThis.crypto.getRandomValues(bytes)
	return bytesToHex(bytes)
}

async function defaultFingerprint(bytes: Uint8Array): Promise<string> {
	if (globalThis.crypto?.subtle === undefined) {
		throw new WebPersistenceError(
			'STORAGE_UNAVAILABLE',
			'Browser cryptography is unavailable.',
			true
		)
	}
	const owned = new Uint8Array(bytes)
	const digest = await globalThis.crypto.subtle.digest('SHA-256', owned)
	return `sha256:${bytesToHex(new Uint8Array(digest))}`
}

function defaultDependencies(
	overrides: {
		readonly files?: WebProjectFilePort
		readonly storage?: WebIndexedDbRuntime
	} = {}
): WebProjectsRuntimeDependencies {
	return Object.freeze({
		createIdentity: defaultIdentity,
		files: overrides.files ?? browserFilePort(new BrowserProjectFilePort()),
		fingerprint: defaultFingerprint,
		loadArchiveCodec: () =>
			import('../../../../packages/project-format/src/physical-archive.js'),
		storage: overrides.storage ?? new WebIndexedDbRuntime()
	})
}

function browserFilePort(picker: WebProjectPickerPort): WebProjectFilePort {
	return Object.freeze({
		download: downloadProjectFile,
		open: () => picker.open(),
		save: (suggestedName: string) => picker.save(suggestedName)
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

function projectHandle(identity: string): ProjectHandle {
	if (!/^[A-F0-9]{64}$/u.test(identity)) {
		throw new WebPersistenceError('INTERNAL_ERROR', 'The project identity is invalid.')
	}
	return `project:${identity}` as ProjectHandle
}

function recoveryHandle(identity: string): RecoveryHandle {
	return `recovery:${identity}` as RecoveryHandle
}

function physicalArchiveApplicationError(
	error: unknown,
	codec: PhysicalArchiveCodec | null
): ApplicationError {
	if (codec !== null && error instanceof codec.PhysicalProjectArchiveError) {
		return applicationError(
			error.code === 'ARCHIVE_LIMIT_EXCEEDED' ? 'PROJECT_TOO_LARGE' : 'PROJECT_INVALID',
			error.message
		)
	}
	if (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		String((error as { readonly name: unknown }).name) === 'NotAllowedError'
	) {
		return applicationError('PERMISSION_DENIED', 'The browser denied project file access.')
	}
	return webPersistenceApplicationError(error)
}

function failedPersistence(
	revision: number,
	error: unknown,
	codec: PhysicalArchiveCodec | null = null
): PersistenceOutcome {
	return Object.freeze({
		status: 'failed' as const,
		revision,
		error: physicalArchiveApplicationError(error, codec)
	})
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) return false
	for (let index = 0; index < left.byteLength; index += 1) {
		if (left[index] !== right[index]) return false
	}
	return true
}

export class WebProjectsRuntime implements ProjectsRuntime {
	readonly #dependencies: WebProjectsRuntimeDependencies
	readonly #records = new Map<ProjectHandle, MutableWebProjectRecord>()

	public constructor(dependencies: WebProjectsRuntimeDependencies = defaultDependencies()) {
		this.#dependencies = dependencies
	}

	#createRecord(
		initial: Partial<
			Pick<
				MutableWebProjectRecord,
				| 'compatibility'
				| 'entries'
				| 'fingerprint'
				| 'formatSaveAllowed'
				| 'lastPersistedRevision'
				| 'manifestBytes'
				| 'recoveryIdentity'
				| 'sourceArchiveBytes'
				| 'sourceHandle'
			>
		> = {}
	): MutableWebProjectRecord {
		const handle = projectHandle(this.#dependencies.createIdentity())
		const recoveryIdentity = initial.recoveryIdentity ?? this.#dependencies.createIdentity()
		if (!/^[A-F0-9]{64}$/u.test(recoveryIdentity)) {
			throw new WebPersistenceError('INTERNAL_ERROR', 'The recovery identity is invalid.')
		}
		const record: MutableWebProjectRecord = {
			handle,
			recoveryIdentity,
			compatibility: initial.compatibility ?? 'supported',
			entries: Object.freeze((initial.entries ?? []).map(ownedEntry)),
			fingerprint: initial.fingerprint ?? null,
			formatSaveAllowed: initial.formatSaveAllowed ?? true,
			lastPersistedRevision: initial.lastPersistedRevision ?? null,
			manifestBytes:
				initial.manifestBytes === undefined || initial.manifestBytes === null
					? null
					: new Uint8Array(initial.manifestBytes),
			queue: Promise.resolve(),
			sourceArchiveBytes:
				initial.sourceArchiveBytes === undefined || initial.sourceArchiveBytes === null
					? null
					: new Uint8Array(initial.sourceArchiveBytes),
			sourceHandle: initial.sourceHandle ?? null
		}
		this.#records.set(handle, record)
		return record
	}

	#record(handle: ProjectHandle): MutableWebProjectRecord {
		if (!/^project:[A-F0-9]{64}$/u.test(handle)) {
			throw new WebPersistenceError('INVALID_REQUEST', 'The project handle is invalid.')
		}
		const record = this.#records.get(handle)
		if (record === undefined) {
			throw new WebPersistenceError('INVALID_REQUEST', 'The project handle is not active.')
		}
		return record
	}

	async #serialize<Value>(
		record: MutableWebProjectRecord,
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

	async #readFile(file: WebProjectFile, maximumBytes: number): Promise<Uint8Array> {
		if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maximumBytes) {
			throw new WebPersistenceError('PROJECT_TOO_LARGE', 'The selected project is too large.')
		}
		const bytes = new Uint8Array(await file.arrayBuffer())
		if (bytes.byteLength !== file.size || bytes.byteLength > maximumBytes) {
			throw new WebPersistenceError(
				'PROJECT_CHANGED',
				'The selected project changed while it was read.',
				true
			)
		}
		return bytes
	}

	async #permission(handle: WebProjectFileHandle): Promise<'denied' | 'granted' | 'prompt'> {
		try {
			return await handle.queryPermission({ mode: 'readwrite' })
		} catch {
			return 'denied'
		}
	}

	async #sameOpenHandle(handle: WebProjectFileHandle): Promise<ProjectHandle | null> {
		if (handle.isSameEntry === undefined) return null
		for (const record of this.#records.values()) {
			if (record.sourceHandle === null) continue
			try {
				if (await handle.isSameEntry(record.sourceHandle)) return record.handle
			} catch {
				// A browser that cannot compare handles may still open a separate bounded snapshot.
			}
		}
		return null
	}

	public async create(): Promise<ApplicationResult<ProjectHandle>> {
		try {
			return Object.freeze({ ok: true as const, value: this.#createRecord().handle })
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public open(): Promise<ApplicationResult<ProjectHandle>> {
		try {
			return this.openSelection(this.#dependencies.files.open())
		} catch (error) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: webPersistenceApplicationError(error)
				})
			)
		}
	}

	public async openSelection(
		selectionPromise: Promise<WebProjectOpenSelection | null>
	): Promise<ApplicationResult<ProjectHandle>> {
		let codec: PhysicalArchiveCodec | null = null
		try {
			const selection = await selectionPromise
			if (selection === null) {
				return Object.freeze({
					ok: false as const,
					error: applicationError('OPERATION_CANCELED', 'Open project was canceled.')
				})
			}
			if (selection.handle !== null) {
				const existing = await this.#sameOpenHandle(selection.handle)
				if (existing !== null) return Object.freeze({ ok: true as const, value: existing })
			}
			codec = await this.#dependencies.loadArchiveCodec()
			const archiveBytes = await this.#readFile(
				selection.file,
				codec.physicalProjectArchiveLimits.maxArchiveBytes
			)
			const opened = codec.decodePhysicalProjectArchive(archiveBytes)
			const logical = opened.logical
			if (logical.status === 'invalid') {
				throw new WebPersistenceError('PROJECT_INVALID', logical.error.message)
			}
			const manifestBytes =
				logical.status === 'loaded'
					? logical.entries.find(
							(entry) => entry.path.toLocaleLowerCase('en-US') === projectManifestPath
						)?.bytes
					: logical.originalManifestBytes
			if (manifestBytes === undefined) {
				throw new WebPersistenceError('PROJECT_INVALID', 'The project manifest is missing.')
			}
			const record = this.#createRecord({
				compatibility: logical.status === 'loaded' ? 'supported' : 'unsupported',
				entries: logical.entries,
				fingerprint: await this.#dependencies.fingerprint(archiveBytes),
				formatSaveAllowed: logical.saveAllowed,
				manifestBytes,
				sourceArchiveBytes: opened.archiveBytes,
				sourceHandle: selection.handle
			})
			return Object.freeze({ ok: true as const, value: record.handle })
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: physicalArchiveApplicationError(error, codec)
			})
		}
	}

	public async load(handle: ProjectHandle): Promise<ApplicationResult<ProjectLoadEnvelope>> {
		try {
			const record = this.#record(handle)
			if (record.manifestBytes === null) {
				throw new WebPersistenceError(
					'PROJECT_MISSING',
					'The in-memory project has no snapshot yet.'
				)
			}
			const directWriteAllowed =
				record.sourceHandle !== null &&
				record.formatSaveAllowed &&
				(await this.#permission(record.sourceHandle)) === 'granted'
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({
					compatibility: record.compatibility,
					fingerprint: record.fingerprint,
					saveAllowed: directWriteAllowed,
					snapshot: Object.freeze({
						revision: record.lastPersistedRevision ?? 0,
						bytes: new Uint8Array(record.manifestBytes)
					})
				})
			})
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	#validatedSnapshot(snapshot: ProjectSnapshotEnvelope): ProjectSnapshotEnvelope {
		const validated = validateProjectSnapshotEnvelope(snapshot)
		if (!validated.ok) {
			throw new WebPersistenceError('INVALID_REQUEST', validated.error.message)
		}
		if (parseProjectManifest(validated.value.bytes).status !== 'loaded') {
			throw new WebPersistenceError(
				'PROJECT_INVALID',
				'The project manifest cannot be persisted.'
			)
		}
		return validated.value
	}

	async #buildArchive(
		record: MutableWebProjectRecord,
		snapshot: ProjectSnapshotEnvelope
	): Promise<{
		readonly bytes: Uint8Array
		readonly codec: PhysicalArchiveCodec
		readonly entries: readonly LogicalArchiveEntry[]
	}> {
		const entries = replaceManifest(record.entries, snapshot.bytes)
		const codec = await this.#dependencies.loadArchiveCodec()
		return Object.freeze({ bytes: codec.encodePhysicalProjectArchive(entries), codec, entries })
	}

	async #archiveForCopy(
		record: MutableWebProjectRecord,
		snapshot: ProjectSnapshotEnvelope
	): Promise<{ readonly bytes: Uint8Array; readonly codec: PhysicalArchiveCodec | null }> {
		if (!record.formatSaveAllowed && record.sourceArchiveBytes !== null) {
			return Object.freeze({ bytes: new Uint8Array(record.sourceArchiveBytes), codec: null })
		}
		const validated = this.#validatedSnapshot(snapshot)
		const archive = await this.#buildArchive(record, validated)
		return Object.freeze({ bytes: archive.bytes, codec: archive.codec })
	}

	async #persistToHandle(
		record: MutableWebProjectRecord,
		snapshotInput: ProjectSnapshotEnvelope,
		handle: WebProjectFileHandle,
		expectedFingerprint: string | null,
		updateSource: boolean
	): Promise<PersistenceOutcome> {
		let codec: PhysicalArchiveCodec | null = null
		let writable: Awaited<ReturnType<WebProjectFileHandle['createWritable']>> | null = null
		try {
			if (!record.formatSaveAllowed) {
				throw new WebPersistenceError(
					'PROJECT_READ_ONLY',
					'This project version is read-only.'
				)
			}
			const permission = await this.#permission(handle)
			if (permission !== 'granted') {
				throw new WebPersistenceError(
					permission === 'denied' ? 'PERMISSION_DENIED' : 'PROJECT_READ_ONLY',
					permission === 'denied'
						? 'Browser write permission was denied.'
						: 'Grant write permission from an explicit Save As action.'
				)
			}
			const snapshot = this.#validatedSnapshot(snapshotInput)
			if (
				record.lastPersistedRevision !== null &&
				snapshot.revision < record.lastPersistedRevision
			) {
				throw new WebPersistenceError(
					'PROJECT_CHANGED',
					'The save revision is stale.',
					true
				)
			}
			const archive = await this.#buildArchive(record, snapshot)
			codec = archive.codec
			const beforeBytes = await this.#readFile(
				await handle.getFile(),
				codec.physicalProjectArchiveLimits.maxArchiveBytes
			)
			const beforeFingerprint = await this.#dependencies.fingerprint(beforeBytes)
			if (expectedFingerprint !== null && beforeFingerprint !== expectedFingerprint) {
				throw new WebPersistenceError(
					'PROJECT_CHANGED',
					'The project file changed outside Tiempio.',
					true
				)
			}
			writable = await handle.createWritable({ keepExistingData: false })
			await writable.write(new Uint8Array(archive.bytes))
			await writable.close()
			writable = null
			const verifiedBytes = await this.#readFile(
				await handle.getFile(),
				codec.physicalProjectArchiveLimits.maxArchiveBytes
			)
			if (!bytesEqual(verifiedBytes, archive.bytes)) {
				throw new WebPersistenceError(
					'PROJECT_CHANGED',
					'The browser could not verify the completed project write.',
					true
				)
			}
			const fingerprint = await this.#dependencies.fingerprint(verifiedBytes)
			if (updateSource) {
				record.sourceHandle = handle
				record.fingerprint = fingerprint
				record.lastPersistedRevision = snapshot.revision
				record.compatibility = 'supported'
				record.formatSaveAllowed = true
				record.entries = archive.entries.map(ownedEntry)
				record.manifestBytes = new Uint8Array(snapshot.bytes)
				record.sourceArchiveBytes = new Uint8Array(verifiedBytes)
				void this.#dependencies.storage
					.discardRecovery(recoveryHandle(record.recoveryIdentity), snapshot.revision)
					.catch(() => undefined)
			}
			return Object.freeze({
				status: updateSource ? ('persisted' as const) : ('copy-written' as const),
				revision: snapshot.revision,
				...(updateSource ? { fingerprint } : {})
			}) as PersistenceOutcome
		} catch (error) {
			if (writable?.abort !== undefined) await writable.abort().catch(() => undefined)
			return failedPersistence(snapshotInput.revision, error, codec)
		}
	}

	public async persist(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			const record = this.#record(handle)
			return await this.#serialize(record, async () => {
				if (record.sourceHandle === null || record.fingerprint === null) {
					throw new WebPersistenceError(
						'PROJECT_READ_ONLY',
						'Use Save As to choose a browser project destination.'
					)
				}
				return await this.#persistToHandle(
					record,
					snapshot,
					record.sourceHandle,
					record.fingerprint,
					true
				)
			})
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
	}

	public persistAs(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			return this.persistAsSelection(
				handle,
				snapshot,
				this.#dependencies.files.save(suggestedProjectName)
			)
		} catch (error) {
			return Promise.resolve(failedPersistence(snapshot.revision, error))
		}
	}

	public async persistAsSelection(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope,
		selectionPromise: Promise<WebProjectSaveSelection>
	): Promise<PersistenceOutcome> {
		let record: MutableWebProjectRecord
		try {
			record = this.#record(handle)
			if (!record.formatSaveAllowed) {
				throw new WebPersistenceError(
					'PROJECT_READ_ONLY',
					'This project version is read-only.'
				)
			}
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
		return await this.#serialize(record, async () => {
			try {
				const selection = await selectionPromise
				if (selection.status === 'canceled') {
					return Object.freeze({
						status: 'canceled' as const,
						revision: snapshot.revision
					})
				}
				if (selection.status === 'unavailable') {
					const archive = await this.#archiveForCopy(record, snapshot)
					this.#dependencies.files.download(archive.bytes, suggestedProjectName)
					return Object.freeze({
						status: 'download-requested' as const,
						revision: snapshot.revision,
						suggestedName: suggestedProjectName
					})
				}
				return await this.#persistToHandle(record, snapshot, selection.handle, null, true)
			} catch (error) {
				return failedPersistence(snapshot.revision, error)
			}
		})
	}

	public async saveCopy(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<PersistenceOutcome> {
		try {
			const record = this.#record(handle)
			return await this.#serialize(record, async () => {
				let codec: PhysicalArchiveCodec | null = null
				try {
					const archive = await this.#archiveForCopy(record, snapshot)
					codec = archive.codec
					this.#dependencies.files.download(archive.bytes, suggestedProjectName)
					return Object.freeze({
						status: 'download-requested' as const,
						revision: snapshot.revision,
						suggestedName: suggestedProjectName
					})
				} catch (error) {
					return failedPersistence(snapshot.revision, error, codec)
				}
			})
		} catch (error) {
			return failedPersistence(snapshot.revision, error)
		}
	}

	public async writeRecovery(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<ApplicationResult<{ readonly revision: number }>> {
		try {
			const record = this.#record(handle)
			return await this.#serialize(record, () =>
				this.#dependencies.storage.writeRecovery(
					record.recoveryIdentity,
					snapshot.bytes,
					snapshot.revision
				)
			)
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public listRecoveries(): Promise<ApplicationResult<readonly RecoveryCandidate[]>> {
		return this.#dependencies.storage.listRecoveries()
	}

	public async restoreRecovery(
		handle: RecoveryHandle
	): Promise<ApplicationResult<ProjectHandle>> {
		const restored = await this.#dependencies.storage.restoreRecovery(handle)
		if (!restored.ok) return restored
		try {
			const recovery = restored.value.recovery
			const record = this.#createRecord({
				compatibility: recovery.status === 'loaded' ? 'supported' : 'unsupported',
				entries: Object.freeze([manifestEntry(recovery.manifestBytes)]),
				formatSaveAllowed: recovery.status === 'loaded',
				lastPersistedRevision: recovery.revision,
				manifestBytes: recovery.manifestBytes,
				recoveryIdentity: restored.value.identity
			})
			return Object.freeze({ ok: true as const, value: record.handle })
		} catch (error) {
			return Object.freeze({
				ok: false as const,
				error: webPersistenceApplicationError(error)
			})
		}
	}

	public discardRecovery(
		handle: RecoveryHandle,
		throughRevision: number
	): Promise<ApplicationResult<{ readonly discardedThroughRevision: number }>> {
		return this.#dependencies.storage.discardRecovery(handle, throughRevision)
	}
}

export function createWebProjectsRuntime(): ProjectsRuntime {
	return new WebProjectsRuntime()
}

export function createWebPersistenceRuntime(
	files: WebProjectPickerPort = new BrowserProjectFilePort()
): Readonly<{ readonly projects: WebProjectsRuntime; readonly settings: WebIndexedDbRuntime }> {
	const settings = new WebIndexedDbRuntime()
	return Object.freeze({
		projects: new WebProjectsRuntime(
			defaultDependencies({ files: browserFilePort(files), storage: settings })
		),
		settings
	})
}
