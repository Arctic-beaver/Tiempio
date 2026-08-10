import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { type ProjectHandle } from '../../../../packages/contracts/src/index.js'
import { createProject } from '../../../../packages/project-core/src/index.js'
import {
	createLogicalProjectArchive,
	encodeCanonicalJson,
	encodeProjectManifest
} from '../../../../packages/project-format/src/index.js'
import {
	atomicReplaceFile,
	sha256Fingerprint,
	type PersistenceFaultInjector,
	type PersistenceFaultPoint
} from './atomic-file.js'
import { type ProjectDialogPort, type SaveTargetSelection } from './native-project-dialogs.js'
import {
	decodePhysicalProjectArchive,
	encodePhysicalProjectArchive
} from './physical-project-archive.js'
import { ProjectPersistenceService } from './project-persistence-service.js'
import { RecoveryStore, SettingsStore } from './recovery-settings-store.js'

class FakeDialogs implements ProjectDialogPort {
	readonly openSelections: Array<string | null> = []
	readonly saveSelections: Array<SaveTargetSelection | null> = []

	public async chooseOpenProject(): Promise<string | null> {
		return this.openSelections.shift() ?? null
	}

	public async chooseProjectDestination(): Promise<SaveTargetSelection | null> {
		return this.saveSelections.shift() ?? null
	}
}

class Faults implements PersistenceFaultInjector {
	readonly observed: PersistenceFaultPoint[] = []

	public constructor(private readonly rejected: ReadonlySet<PersistenceFaultPoint>) {}

	public hit(point: PersistenceFaultPoint): void {
		this.observed.push(point)
		if (this.rejected.has(point)) throw new Error(`Injected ${point}`)
	}
}

class BlockingRecoveryFault implements PersistenceFaultInjector {
	private unblock: () => void = () => undefined
	private readonly blocked = new Promise<void>((resolve) => {
		this.unblock = resolve
	})

	public async hit(point: PersistenceFaultPoint): Promise<void> {
		if (point === 'recovery-write') await this.blocked
	}

	public release(): void {
		this.unblock()
	}
}

class NextWriteGate implements PersistenceFaultInjector {
	private armed = false
	private enter: () => void = () => undefined
	private unblock: () => void = () => undefined
	private entered = Promise.resolve()
	private blocked = Promise.resolve()

	public arm(): void {
		this.armed = true
		this.entered = new Promise<void>((resolve) => {
			this.enter = resolve
		})
		this.blocked = new Promise<void>((resolve) => {
			this.unblock = resolve
		})
	}

	public async hit(point: PersistenceFaultPoint): Promise<void> {
		if (point !== 'write' || !this.armed) return
		this.armed = false
		this.enter()
		await this.blocked
	}

	public async waitUntilEntered(): Promise<void> {
		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			await Promise.race([
				this.entered,
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Write gate was not entered.')),
						1_000
					)
				})
			])
		} finally {
			if (timeout !== undefined) clearTimeout(timeout)
		}
	}

	public release(): void {
		this.unblock()
	}
}

function projectBytes(title: string): Uint8Array {
	return encodeProjectManifest(createProject({ projectId: `project.${title}`, title }))
}

async function temporaryDirectory(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'tiempio-stage-5b-'))
}

describe('Desktop native persistence', () => {
	it('preflights, inflates and checksum-validates a bounded physical archive', () => {
		const logical = createLogicalProjectArchive(
			createProject({ projectId: 'project.physical', title: 'Physical' })
		)
		const encoded = encodePhysicalProjectArchive(logical)
		const decoded = decodePhysicalProjectArchive(encoded)
		assert.equal(decoded.logical.status, 'loaded')
		assert.deepEqual(encodePhysicalProjectArchive(decoded.logical.entries), encoded)

		const corrupt = new Uint8Array(encoded)
		corrupt[Math.floor(corrupt.byteLength / 3)] ^= 0xff
		assert.throws(() => decodePhysicalProjectArchive(corrupt), /archive|entry|checksum/iu)

		const encrypted = new Uint8Array(encoded)
		const data = new DataView(encrypted.buffer)
		let central = 0
		while (
			central + 4 <= encrypted.byteLength &&
			data.getUint32(central, true) !== 0x02014b50
		) {
			central += 1
		}
		assert.ok(central + 10 < encrypted.byteLength)
		data.setUint16(central + 8, data.getUint16(central + 8, true) | 1, true)
		assert.throws(() => decodePhysicalProjectArchive(encrypted), /Encrypted/iu)
	})

	it('creates, saves, reopens and de-duplicates a project through opaque handles', async () => {
		const root = await temporaryDirectory()
		try {
			const destination = join(root, 'roundtrip.tiempio')
			const dialogs = new FakeDialogs()
			dialogs.saveSelections.push({ path: destination, overwriteConfirmed: true })
			const recoveries = new RecoveryStore(join(root, 'recovery'))
			const projects = new ProjectPersistenceService(dialogs, recoveries)
			const created = await projects.create()
			assert.equal(created.ok, true)
			if (!created.ok) return
			const snapshot = { revision: 4, bytes: projectBytes('Roundtrip') }
			const persisted = await projects.persist(created.value, snapshot)
			assert.equal(persisted.status, 'persisted')
			assert.equal(
				await readFile(destination).then((bytes) => sha256Fingerprint(bytes)),
				persisted.status === 'persisted' ? persisted.fingerprint : null
			)

			dialogs.openSelections.push(destination, destination)
			const firstOpen = await projects.open()
			const secondOpen = await projects.open()
			assert.deepEqual(firstOpen, secondOpen)
			const loaded = await projects.load(created.value)
			assert.equal(loaded.ok, true)
			if (loaded.ok) assert.deepEqual(loaded.value.snapshot.bytes, snapshot.bytes)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('serializes save races and clears recovery only through the covered revision', async () => {
		const root = await temporaryDirectory()
		try {
			const destination = join(root, 'raced.tiempio')
			const dialogs = new FakeDialogs()
			dialogs.saveSelections.push({ path: destination, overwriteConfirmed: true })
			const gate = new NextWriteGate()
			const projects = new ProjectPersistenceService(
				dialogs,
				new RecoveryStore(join(root, 'recovery')),
				gate
			)
			const created = await projects.create()
			assert.equal(created.ok, true)
			if (!created.ok) return
			assert.equal(
				(await projects.persist(created.value, { revision: 1, bytes: projectBytes('One') }))
					.status,
				'persisted'
			)

			gate.arm()
			const savingTwo = projects.persist(created.value, {
				revision: 2,
				bytes: projectBytes('Two')
			})
			const savingThree = projects.persist(created.value, {
				revision: 3,
				bytes: projectBytes('Three')
			})
			await gate.waitUntilEntered()
			gate.release()
			assert.equal((await savingTwo).status, 'persisted')
			assert.equal((await savingThree).status, 'persisted')
			const loaded = await projects.load(created.value)
			assert.equal(loaded.ok, true)
			if (loaded.ok) {
				assert.equal(loaded.value.snapshot.revision, 3)
				assert.deepEqual(loaded.value.snapshot.bytes, projectBytes('Three'))
			}

			assert.equal(
				(
					await projects.writeRecovery(created.value, {
						revision: 4,
						bytes: projectBytes('Four')
					})
				).ok,
				true
			)
			assert.equal(
				(
					await projects.persist(created.value, {
						revision: 3,
						bytes: projectBytes('Three')
					})
				).status,
				'persisted'
			)
			const retained = await projects.listRecoveries()
			assert.equal(retained.ok, true)
			if (retained.ok) assert.equal(retained.value[0]?.revision, 4)
			assert.equal(
				(
					await projects.persist(created.value, {
						revision: 4,
						bytes: projectBytes('Four')
					})
				).status,
				'persisted'
			)
			assert.deepEqual(await projects.listRecoveries(), { ok: true, value: [] })
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('keeps the source and recovery truthful across Save Copy and conflicts', async () => {
		const root = await temporaryDirectory()
		try {
			const source = join(root, 'source.tiempio')
			const copy = join(root, 'copy.tiempio')
			const retainedBytes = new Uint8Array([4, 5, 6, 7])
			const sourceEntries = [
				...createLogicalProjectArchive(
					createProject({ projectId: 'project.source', title: 'Source' })
				),
				{
					path: 'assets/opaque.bin',
					bytes: retainedBytes,
					declaredBytes: retainedBytes.byteLength,
					compressedBytes: retainedBytes.byteLength
				}
			]
			await writeFile(source, encodePhysicalProjectArchive(sourceEntries))
			const dialogs = new FakeDialogs()
			dialogs.openSelections.push(source)
			dialogs.saveSelections.push({ path: copy, overwriteConfirmed: true })
			const recoveries = new RecoveryStore(join(root, 'recovery'))
			const projects = new ProjectPersistenceService(dialogs, recoveries)
			const opened = await projects.open()
			assert.equal(opened.ok, true)
			if (!opened.ok) return
			const snapshot = { revision: 7, bytes: projectBytes('Edited') }
			assert.deepEqual(await projects.writeRecovery(opened.value, snapshot), {
				ok: true,
				value: { revision: 7 }
			})
			assert.deepEqual(await projects.saveCopy(opened.value, snapshot), {
				status: 'copy-written',
				revision: 7
			})
			const copied = decodePhysicalProjectArchive(new Uint8Array(await readFile(copy)))
			assert.equal(copied.logical.status, 'loaded')
			assert.deepEqual(
				copied.logical.entries.find((entry) => entry.path === 'assets/opaque.bin')?.bytes,
				retainedBytes
			)
			assert.equal((await projects.listRecoveries()).ok, true)

			await writeFile(source, new Uint8Array([1, 2, 3]))
			const conflicted = await projects.persist(opened.value, snapshot)
			assert.equal(conflicted.status, 'failed')
			if (conflicted.status === 'failed')
				assert.equal(conflicted.error.code, 'PROJECT_CHANGED')
			assert.deepEqual(new Uint8Array(await readFile(source)), new Uint8Array([1, 2, 3]))
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('opens future projects read-only and Save Copy preserves their exact archive bytes', async () => {
		const root = await temporaryDirectory()
		try {
			const source = join(root, 'future.tiempio')
			const copy = join(root, 'future-copy.tiempio')
			const futureManifest = encodeCanonicalJson({
				...createProject({ projectId: 'project.future', title: 'Future' }),
				schemaVersion: 999
			})
			const archive = encodePhysicalProjectArchive([
				{
					path: 'project.json',
					bytes: futureManifest,
					declaredBytes: futureManifest.byteLength,
					compressedBytes: futureManifest.byteLength
				}
			])
			await writeFile(source, archive)
			const dialogs = new FakeDialogs()
			dialogs.openSelections.push(source)
			dialogs.saveSelections.push({ path: copy, overwriteConfirmed: true })
			const projects = new ProjectPersistenceService(
				dialogs,
				new RecoveryStore(join(root, 'recovery'))
			)
			const opened = await projects.open()
			assert.equal(opened.ok, true)
			if (!opened.ok) return
			const loaded = await projects.load(opened.value)
			assert.equal(loaded.ok, true)
			if (!loaded.ok) return
			assert.equal(loaded.value.compatibility, 'unsupported')
			assert.equal(loaded.value.saveAllowed, false)
			const snapshot = { revision: 2, bytes: futureManifest }
			const persist = await projects.persist(opened.value, snapshot)
			assert.equal(persist.status, 'failed')
			if (persist.status === 'failed') assert.equal(persist.error.code, 'PROJECT_READ_ONLY')
			assert.deepEqual(await projects.saveCopy(opened.value, snapshot), {
				status: 'copy-written',
				revision: 2
			})
			assert.deepEqual(new Uint8Array(await readFile(copy)), archive)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('restores and revision-guards checksummed recovery and atomically stores settings', async () => {
		const root = await temporaryDirectory()
		try {
			const dialogs = new FakeDialogs()
			const recoveries = new RecoveryStore(join(root, 'recovery'))
			const projects = new ProjectPersistenceService(dialogs, recoveries)
			const created = await projects.create()
			assert.equal(created.ok, true)
			if (!created.ok) return
			assert.equal(
				(
					await projects.writeRecovery(created.value, {
						revision: 9,
						bytes: projectBytes('Recovery')
					})
				).ok,
				true
			)
			const listed = await projects.listRecoveries()
			assert.equal(listed.ok, true)
			if (!listed.ok || listed.value[0] === undefined) return
			const candidate = listed.value[0]
			const restored = await projects.restoreRecovery(candidate.handle)
			assert.equal(restored.ok, true)
			if (restored.ok) assert.equal((await projects.load(restored.value)).ok, true)
			assert.equal((await projects.discardRecovery(candidate.handle, 8)).ok, false)
			assert.deepEqual(await projects.discardRecovery(candidate.handle, 9), {
				ok: true,
				value: { discardedThroughRevision: 9 }
			})

			const settings = new SettingsStore(join(root, 'settings'))
			assert.deepEqual(await settings.get(), {
				ok: true,
				value: { version: 1, colorScheme: 'system' }
			})
			assert.deepEqual(await settings.set({ version: 1, colorScheme: 'dark' }), {
				ok: true,
				value: { version: 1, colorScheme: 'dark' }
			})
			assert.deepEqual(await settings.get(), {
				ok: true,
				value: { version: 1, colorScheme: 'dark' }
			})
			assert.deepEqual(await settings.set({ version: 1, colorScheme: 'light' }), {
				ok: true,
				value: { version: 1, colorScheme: 'light' }
			})
			assert.deepEqual(await settings.get(), {
				ok: true,
				value: { version: 1, colorScheme: 'light' }
			})
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('injects atomic write, cleanup and recovery faults without replacing prior data', async () => {
		const root = await temporaryDirectory()
		try {
			const destination = join(root, 'guarded.tiempio')
			const original = new Uint8Array([7, 7, 7])
			await writeFile(destination, original)
			for (const point of ['write', 'flush', 'conflict-check', 'replace'] as const) {
				await writeFile(destination, original)
				const faults = new Faults(new Set<PersistenceFaultPoint>([point]))
				await assert.rejects(
					atomicReplaceFile(destination, new Uint8Array([9, 9, 9]), {
						expectedFingerprint: sha256Fingerprint(original),
						faults
					})
				)
				assert.deepEqual(new Uint8Array(await readFile(destination)), original)
				assert.ok(faults.observed.includes(point))
				assert.equal(
					(await readdir(root)).some((name) => name.endsWith('.tiempio-tmp')),
					false
				)
			}

			const cleanupFaults = new Faults(new Set<PersistenceFaultPoint>(['write', 'cleanup']))
			await assert.rejects(
				atomicReplaceFile(destination, new Uint8Array([9]), {
					expectedFingerprint: sha256Fingerprint(original),
					faults: cleanupFaults
				})
			)
			assert.ok(cleanupFaults.observed.includes('cleanup'))
			assert.equal(
				(await readdir(root)).some((name) => name.endsWith('.tiempio-tmp')),
				false
			)

			const source = join(root, 'faulted-open.tiempio')
			await writeFile(
				source,
				encodePhysicalProjectArchive(
					createLogicalProjectArchive(
						createProject({ projectId: 'project.fault-open', title: 'Fault open' })
					)
				)
			)
			for (const point of ['open-source', 'archive-read'] as const) {
				const openFaults = new Faults(new Set<PersistenceFaultPoint>([point]))
				const dialogs = new FakeDialogs()
				dialogs.openSelections.push(source)
				const projects = new ProjectPersistenceService(
					dialogs,
					new RecoveryStore(join(root, `recovery-${point}`)),
					openFaults
				)
				assert.equal((await projects.open()).ok, false)
				assert.ok(openFaults.observed.includes(point))
			}

			const recoveryFaults = new Faults(new Set<PersistenceFaultPoint>(['recovery-write']))
			const recoveries = new RecoveryStore(join(root, 'faulted-recovery'), recoveryFaults)
			const result = await recoveries.write(
				recoveries.createIdentity(),
				projectBytes('Faulted'),
				3
			)
			assert.equal(result.ok, false)
			assert.ok(recoveryFaults.observed.includes('recovery-write'))
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('waits for the latest bounded recovery write before allowing close', async () => {
		const root = await temporaryDirectory()
		try {
			const blocking = new BlockingRecoveryFault()
			const projects = new ProjectPersistenceService(
				new FakeDialogs(),
				new RecoveryStore(join(root, 'recovery'), blocking)
			)
			const created = await projects.create()
			assert.equal(created.ok, true)
			if (!created.ok) return
			const writing = projects.writeRecovery(created.value, {
				revision: 5,
				bytes: projectBytes('Barrier')
			})
			assert.equal((await projects.awaitRecoveryBarrier(5)).ok, false)
			blocking.release()
			assert.equal((await writing).ok, true)
			assert.deepEqual(await projects.awaitRecoveryBarrier(), { ok: true, value: null })
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	it('rejects forged project handles without revealing registry contents', async () => {
		const root = await temporaryDirectory()
		try {
			const projects = new ProjectPersistenceService(
				new FakeDialogs(),
				new RecoveryStore(join(root, 'recovery'))
			)
			const result = await projects.load(`project:${'A'.repeat(64)}` as ProjectHandle)
			assert.equal(result.ok, false)
			if (!result.ok) {
				assert.equal(result.error.code, 'INVALID_REQUEST')
				assert.equal(JSON.stringify(result).includes(root), false)
			}
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})
