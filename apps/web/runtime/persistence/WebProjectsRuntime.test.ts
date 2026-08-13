import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createProject } from '../../../../packages/project-core/src/index.js'
import {
	createLogicalProjectArchive,
	decodeUtf8,
	encodeCanonicalJson,
	encodeProjectManifest,
	projectManifestPath
} from '../../../../packages/project-format/src/index.js'
import {
	decodePhysicalProjectArchive,
	encodePhysicalProjectArchive,
	physicalProjectArchiveLimits
} from '../../../../packages/project-format/src/physical-archive.js'
import {
	type WebProjectFile,
	type WebProjectFileHandle,
	type WebProjectFilePort,
	type WebProjectOpenSelection,
	type WebProjectPermissionState,
	type WebProjectSaveSelection,
	type WebProjectWritable
} from './browserProjectFiles.js'
import {
	WebIndexedDbRuntime,
	type WebIndexedDbPort,
	type WebIndexedDbStore,
	type WebIndexedDbStoreName
} from './WebIndexedDbRuntime.js'
import { WebProjectsRuntime, type WebProjectsRuntimeDependencies } from './WebProjectsRuntime.js'

function clone<Value>(value: Value): Value {
	return value === undefined ? value : structuredClone(value)
}

class MemoryIndexedDbPort implements WebIndexedDbPort {
	readonly #stores = new Map<WebIndexedDbStoreName, Map<IDBValidKey, unknown>>([
		['recoveries', new Map()],
		['settings', new Map()]
	])

	public async transaction<Value>(
		storeName: WebIndexedDbStoreName,
		_mode: IDBTransactionMode,
		operation: (store: WebIndexedDbStore) => Promise<Value>
	): Promise<Value> {
		const values = this.#stores.get(storeName)
		assert.notEqual(values, undefined)
		return await operation({
			delete: async (key) => {
				values?.delete(key)
			},
			get: async (key) => clone(values?.get(key)),
			getAll: async (limit) =>
				[...(values?.values() ?? [])].slice(0, limit).map((value) => clone(value)),
			put: async (key, value) => {
				values?.set(key, clone(value))
			}
		})
	}
}

class FakeFile implements WebProjectFile {
	public constructor(
		private readonly bytes: Uint8Array,
		public readonly size = bytes.byteLength
	) {}

	public async arrayBuffer(): Promise<ArrayBuffer> {
		return new Uint8Array(this.bytes).buffer
	}
}

class FakeFileHandle implements WebProjectFileHandle {
	public corruptAfterClose = false
	public failWrite = false
	public permission: WebProjectPermissionState = 'granted'
	public bytes: Uint8Array

	public constructor(bytes: Uint8Array = new Uint8Array()) {
		this.bytes = new Uint8Array(bytes)
	}

	public async createWritable(): Promise<WebProjectWritable> {
		if (this.permission === 'denied') {
			throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
		}
		let pending = new Uint8Array()
		return {
			abort: async () => undefined,
			close: async () => {
				this.bytes = new Uint8Array(pending)
				if (this.corruptAfterClose && this.bytes.byteLength > 0) this.bytes[0] ^= 0xff
			},
			write: async (bytes) => {
				if (this.failWrite) throw new Error('write failed')
				pending = new Uint8Array(bytes)
			}
		}
	}

	public async getFile(): Promise<WebProjectFile> {
		return new FakeFile(this.bytes)
	}

	public async isSameEntry(other: WebProjectFileHandle): Promise<boolean> {
		return other === this
	}

	public async queryPermission(): Promise<WebProjectPermissionState> {
		return this.permission
	}
}

class FakeFiles implements WebProjectFilePort {
	public readonly downloads: Array<{ readonly bytes: Uint8Array; readonly name: string }> = []
	public readonly openSelections: Array<WebProjectOpenSelection | null> = []
	public readonly saveSelections: WebProjectSaveSelection[] = []

	public download(bytes: Uint8Array, suggestedName: string): void {
		this.downloads.push({ bytes: new Uint8Array(bytes), name: suggestedName })
	}

	public async open(): Promise<WebProjectOpenSelection | null> {
		return this.openSelections.shift() ?? null
	}

	public async save(): Promise<WebProjectSaveSelection> {
		return this.saveSelections.shift() ?? { status: 'unavailable' }
	}
}

function testFingerprint(bytes: Uint8Array): Promise<string> {
	let hash = 0x811c9dc5
	for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
	return Promise.resolve(`sha256:${hash.toString(16).toUpperCase().padStart(64, '0')}`)
}

function harness(): {
	readonly files: FakeFiles
	readonly projects: WebProjectsRuntime
	readonly storage: WebIndexedDbRuntime
} {
	let identity = 0
	const files = new FakeFiles()
	const storage = new WebIndexedDbRuntime(new MemoryIndexedDbPort())
	const dependencies: WebProjectsRuntimeDependencies = {
		createIdentity: () => (++identity).toString(16).toUpperCase().padStart(64, '0'),
		files,
		fingerprint: testFingerprint,
		loadArchiveCodec: () =>
			import('../../../../packages/project-format/src/physical-archive.js'),
		storage
	}
	return { files, projects: new WebProjectsRuntime(dependencies), storage }
}

function projectBytes(title: string): Uint8Array {
	return encodeProjectManifest(
		createProject({ projectId: `project.${title.replace(/[^A-Za-z0-9._:-]+/gu, '-')}`, title })
	)
}

function archiveBytes(title: string): Uint8Array {
	return encodePhysicalProjectArchive(
		createLogicalProjectArchive(
			createProject({
				projectId: `project.${title.replace(/[^A-Za-z0-9._:-]+/gu, '-')}`,
				title
			})
		)
	)
}

describe('Web project persistence runtime', () => {
	it('opens a bounded snapshot fallback without claiming direct-write access', async () => {
		const test = harness()
		const source = archiveBytes('Snapshot')
		test.files.openSelections.push({ file: new FakeFile(source), handle: null })
		const opened = await test.projects.open()
		assert.equal(opened.ok, true)
		if (!opened.ok) return
		const loaded = await test.projects.load(opened.value)
		assert.equal(loaded.ok, true)
		if (loaded.ok) {
			assert.equal(loaded.value.compatibility, 'supported')
			assert.equal(loaded.value.saveAllowed, false)
			assert.match(decodeUtf8(loaded.value.snapshot.bytes), /Snapshot/u)
		}

		const direct = await test.projects.persist(opened.value, {
			revision: 1,
			bytes: projectBytes('Edited snapshot')
		})
		assert.equal(direct.status, 'failed')
		if (direct.status === 'failed') assert.equal(direct.error.code, 'PROJECT_READ_ONLY')

		const downloaded = await test.projects.persistAs(opened.value, {
			revision: 1,
			bytes: projectBytes('Edited snapshot')
		})
		assert.equal(downloaded.status, 'download-requested')
		assert.equal(test.files.downloads.length, 1)
		assert.equal(
			decodePhysicalProjectArchive(test.files.downloads[0]!.bytes).logical.status,
			'loaded'
		)
	})

	it('writes only with granted permission and detects external changes', async () => {
		const test = harness()
		const handle = new FakeFileHandle(archiveBytes('Writable'))
		test.files.openSelections.push({ file: await handle.getFile(), handle })
		const opened = await test.projects.open()
		assert.equal(opened.ok, true)
		if (!opened.ok) return
		const initial = await test.projects.load(opened.value)
		assert.equal(initial.ok && initial.value.saveAllowed, true)

		const persisted = await test.projects.persist(opened.value, {
			revision: 4,
			bytes: projectBytes('Written')
		})
		assert.equal(persisted.status, 'persisted')
		const decoded = decodePhysicalProjectArchive(handle.bytes)
		assert.equal(decoded.logical.status, 'loaded')
		if (decoded.logical.status === 'loaded')
			assert.equal(decoded.logical.project.title, 'Written')

		handle.bytes = archiveBytes('External')
		const conflict = await test.projects.persist(opened.value, {
			revision: 5,
			bytes: projectBytes('Should not replace')
		})
		assert.equal(conflict.status, 'failed')
		if (conflict.status === 'failed') assert.equal(conflict.error.code, 'PROJECT_CHANGED')

		handle.permission = 'prompt'
		const prompt = await test.projects.persist(opened.value, {
			revision: 6,
			bytes: projectBytes('Prompt')
		})
		assert.equal(prompt.status, 'failed')
		if (prompt.status === 'failed') assert.equal(prompt.error.code, 'PROJECT_READ_ONLY')

		handle.permission = 'denied'
		const denied = await test.projects.persist(opened.value, {
			revision: 6,
			bytes: projectBytes('Denied')
		})
		assert.equal(denied.status, 'failed')
		if (denied.status === 'failed') assert.equal(denied.error.code, 'PERMISSION_DENIED')
	})

	it('binds Save As only after a verified write and preserves cancellation', async () => {
		const test = harness()
		const created = await test.projects.create()
		assert.equal(created.ok, true)
		if (!created.ok) return
		const destination = new FakeFileHandle()
		test.files.saveSelections.push({ status: 'selected', handle: destination })
		const saved = await test.projects.persistAs(created.value, {
			revision: 2,
			bytes: projectBytes('Save As')
		})
		assert.equal(saved.status, 'persisted')
		assert.equal(decodePhysicalProjectArchive(destination.bytes).logical.status, 'loaded')

		const next = await test.projects.persist(created.value, {
			revision: 3,
			bytes: projectBytes('Bound destination')
		})
		assert.equal(next.status, 'persisted')

		const second = await test.projects.create()
		assert.equal(second.ok, true)
		if (!second.ok) return
		test.files.saveSelections.push({ status: 'canceled' })
		assert.deepEqual(
			await test.projects.persistAs(second.value, {
				revision: 1,
				bytes: projectBytes('Canceled')
			}),
			{ status: 'canceled', revision: 1 }
		)
	})

	it('preserves unsupported archives byte-for-byte through Download', async () => {
		const test = harness()
		const futureManifest = encodeCanonicalJson({ schemaVersion: 999, future: 'preserve' })
		const futureArchive = encodePhysicalProjectArchive([
			{
				path: projectManifestPath,
				bytes: futureManifest,
				declaredBytes: futureManifest.byteLength,
				compressedBytes: futureManifest.byteLength
			}
		])
		test.files.openSelections.push({ file: new FakeFile(futureArchive), handle: null })
		const opened = await test.projects.open()
		assert.equal(opened.ok, true)
		if (!opened.ok) return
		const loaded = await test.projects.load(opened.value)
		assert.equal(loaded.ok && loaded.value.compatibility, 'unsupported')
		const outcome = await test.projects.saveCopy(opened.value, {
			revision: 9,
			bytes: projectBytes('Ignored current snapshot')
		})
		assert.equal(outcome.status, 'download-requested')
		assert.deepEqual(test.files.downloads[0]?.bytes, futureArchive)
		const saveAs = await test.projects.persistAs(opened.value, {
			revision: 9,
			bytes: projectBytes('Ignored current snapshot')
		})
		assert.equal(saveAs.status, 'failed')
		if (saveAs.status === 'failed') assert.equal(saveAs.error.code, 'PROJECT_READ_ONLY')
	})

	it('round-trips recovery while rejecting corrupt input and unverifiable writes', async () => {
		const test = harness()
		const created = await test.projects.create()
		assert.equal(created.ok, true)
		if (!created.ok) return
		assert.deepEqual(
			await test.projects.writeRecovery(created.value, {
				revision: 7,
				bytes: projectBytes('Recovered')
			}),
			{ ok: true, value: { revision: 7 } }
		)
		const candidates = await test.projects.listRecoveries()
		assert.equal(candidates.ok, true)
		if (candidates.ok) {
			const restored = await test.projects.restoreRecovery(candidates.value[0]!.handle)
			assert.equal(restored.ok, true)
			if (restored.ok) {
				const loaded = await test.projects.load(restored.value)
				assert.equal(loaded.ok && loaded.value.snapshot.revision, 7)
			}
		}

		const corrupt = archiveBytes('Corrupt')
		corrupt[Math.floor(corrupt.byteLength / 2)] ^= 0xff
		test.files.openSelections.push({ file: new FakeFile(corrupt), handle: null })
		const rejected = await test.projects.open()
		assert.equal(rejected.ok, false)
		if (!rejected.ok) assert.equal(rejected.error.code, 'PROJECT_INVALID')

		const destination = new FakeFileHandle()
		destination.corruptAfterClose = true
		const another = await test.projects.create()
		assert.equal(another.ok, true)
		if (!another.ok) return
		test.files.saveSelections.push({ status: 'selected', handle: destination })
		const unverified = await test.projects.persistAs(another.value, {
			revision: 1,
			bytes: projectBytes('Verify')
		})
		assert.equal(unverified.status, 'failed')
		if (unverified.status === 'failed') assert.equal(unverified.error.code, 'PROJECT_CHANGED')

		test.files.openSelections.push({
			file: new FakeFile(new Uint8Array(), physicalProjectArchiveLimits.maxArchiveBytes + 1),
			handle: null
		})
		const oversized = await test.projects.open()
		assert.equal(oversized.ok, false)
		if (!oversized.ok) assert.equal(oversized.error.code, 'PROJECT_TOO_LARGE')
	})
})
