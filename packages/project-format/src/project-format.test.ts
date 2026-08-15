import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createLayer,
	createMidiMaterial,
	createMidiNote,
	createProject,
	createSongInstance,
	ProjectSession
} from '../../project-core/src/index.js'
import {
	createLogicalProjectArchive,
	decodeRecoveryEnvelope,
	decodeUtf8,
	encodeCanonicalJson,
	encodeProjectManifest,
	encodeRecoveryEnvelope,
	openLogicalProjectArchive,
	parseProjectManifest,
	projectManifestPath,
	validateLogicalArchive,
	type LogicalArchiveEntry
} from './index.js'
import {
	decodePhysicalProjectArchive,
	encodePhysicalProjectArchive,
	PhysicalProjectArchiveError
} from './physical-archive.js'

const project = createProject({ projectId: 'project.format', title: 'Формат 🎛️' })

function entry(
	path: string,
	bytes: Uint8Array,
	compressedBytes = bytes.byteLength
): LogicalArchiveEntry {
	return { path, bytes, declaredBytes: bytes.byteLength, compressedBytes }
}

describe('project format', () => {
	it('round-trips canonical manifests byte-for-byte', () => {
		const first = encodeProjectManifest(project)
		const loaded = parseProjectManifest(first)
		assert.equal(loaded.status, 'loaded')
		if (loaded.status !== 'loaded') return
		const second = encodeProjectManifest(loaded.project)
		assert.deepEqual(second, first)
		assert.match(decodeUtf8(first), /Формат/u)
	})

	it('round-trips an applied song palette as canonical project intent', () => {
		const session = new ProjectSession(project)
		session.dispatch({
			type: 'transport.key.set',
			baseRevision: 0,
			key: { tonic: 1, mode: 'major' }
		})
		const loaded = parseProjectManifest(encodeProjectManifest(session.getSnapshot().project))
		assert.equal(loaded.status, 'loaded')
		if (loaded.status === 'loaded') {
			assert.deepEqual(loaded.project.transport.key, { tonic: 1, mode: 'major' })
		}
	})

	it('preserves linked source edits and song instances through archive and recovery', () => {
		const source = {
			...createLayer({ id: 'layer.linked', name: 'Linked lead', role: 'melody' }),
			material: createMidiMaterial({
				materialLengthTicks: 1_920,
				tailRestTicks: 960,
				notes: [
					createMidiNote({
						id: 'note.linked',
						pitch: 60,
						startTick: 0,
						durationTicks: 480
					})
				]
			})
		}
		const linkedProject = {
			...createProject({ projectId: 'project.linked', title: 'Linked composition' }),
			layers: [source],
			song: {
				instances: [
					createSongInstance({
						id: 'instance.linked.a',
						sourceLayerId: source.id,
						startTick: 0,
						durationTicks: 2_880
					}),
					createSongInstance({
						id: 'instance.linked.b',
						sourceLayerId: source.id,
						startTick: 3_840,
						durationTicks: 1_440,
						sourceOffsetTicks: 480
					})
				]
			}
		}
		const session = new ProjectSession(linkedProject)
		session.dispatch({
			type: 'note.update',
			baseRevision: 0,
			layerId: source.id,
			noteId: source.material.notes[0]!.id,
			pitch: 67,
			startTick: 240,
			durationTicks: 720,
			velocity: 108
		})
		assert.equal(session.getSnapshot().revision, 1)
		const undone = session.undo(1)
		const undoneMaterial = undone.project.layers[0]?.material
		assert.equal(undoneMaterial?.kind, 'midi')
		if (undoneMaterial?.kind === 'midi') assert.equal(undoneMaterial.notes[0]?.pitch, 60)
		const redone = session.redo(2)
		const redoneMaterial = redone.project.layers[0]?.material
		assert.equal(redoneMaterial?.kind, 'midi')
		if (redoneMaterial?.kind === 'midi') assert.equal(redoneMaterial.notes[0]?.pitch, 67)
		const edited = session.getSnapshot().project

		const physical = decodePhysicalProjectArchive(
			encodePhysicalProjectArchive(createLogicalProjectArchive(edited))
		)
		assert.equal(physical.logical.status, 'loaded')
		if (physical.logical.status === 'loaded') {
			const reopened = physical.logical.project
			assert.equal(reopened.layers.length, 1)
			assert.equal(reopened.song.instances.length, 2)
			assert.equal(reopened.song.instances[0]?.sourceLayerId, reopened.layers[0]?.id)
			assert.equal(reopened.song.instances[1]?.sourceLayerId, reopened.layers[0]?.id)
			assert.equal(reopened.song.instances[1]?.sourceOffsetTicks, 480)
			const material = reopened.layers[0]?.material
			assert.equal(material?.kind, 'midi')
			if (material?.kind === 'midi') assert.equal(material.notes[0]?.pitch, 67)
			assert.deepEqual(encodeProjectManifest(reopened), encodeProjectManifest(edited))
		}

		const recovered = decodeRecoveryEnvelope(encodeRecoveryEnvelope(edited, 3))
		assert.equal(recovered.status, 'loaded')
		if (recovered.status === 'loaded') {
			assert.equal(recovered.revision, 3)
			assert.deepEqual(recovered.project, edited)
		}
	})

	it('rejects every non-current manifest without retaining it', () => {
		const bytes = encodeCanonicalJson({
			schemaVersion: Number.MAX_SAFE_INTEGER,
			nonCurrentField: 'reject'
		})
		const result = parseProjectManifest(bytes)
		assert.equal(result.status, 'invalid')
		if (result.status === 'invalid') assert.equal(result.error.code, 'INVALID_MANIFEST')
	})

	it('validates owned logical archives before decoding entries', () => {
		const archive = createLogicalProjectArchive(project)
		const opened = openLogicalProjectArchive(archive)
		assert.equal(opened.status, 'loaded')
		if (opened.status === 'loaded') assert.equal(opened.project.title, project.title)

		const source = encodeProjectManifest(project)
		const validation = validateLogicalArchive([entry(projectManifestPath, source)])
		assert.equal(validation.ok, true)
		if (validation.ok) {
			source[0] = 0
			assert.notEqual(validation.entries[0]?.bytes[0], 0)
		}
	})

	it('rejects traversal, normalized duplicates and suspicious compression ratios', () => {
		const bytes = encodeProjectManifest(project)
		assert.equal(validateLogicalArchive([entry('../project.json', bytes)]).ok, false)
		assert.equal(
			validateLogicalArchive([entry('project.json', bytes), entry('PROJECT.JSON', bytes)]).ok,
			false
		)
		const expanded = new Uint8Array(201)
		assert.equal(validateLogicalArchive([entry('project.json', expanded, 1)]).ok, false)
		assert.equal(
			validateLogicalArchive([null] as unknown as readonly LogicalArchiveEntry[]).ok,
			false
		)
	})

	it('preflights and checksum-validates the shared physical ZIP boundary', () => {
		const encoded = encodePhysicalProjectArchive(createLogicalProjectArchive(project))
		const decoded = decodePhysicalProjectArchive(encoded)
		assert.equal(decoded.logical.status, 'loaded')
		assert.deepEqual(encodePhysicalProjectArchive(decoded.logical.entries), encoded)

		const corrupt = new Uint8Array(encoded)
		corrupt[Math.floor(corrupt.byteLength / 3)] ^= 0xff
		assert.throws(
			() => decodePhysicalProjectArchive(corrupt),
			(error: unknown) =>
				error instanceof PhysicalProjectArchiveError && error.code === 'INVALID_ARCHIVE'
		)

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

	it('round-trips recovery with CRC32 corruption detection', () => {
		const envelope = encodeRecoveryEnvelope(project, 9)
		const recovered = decodeRecoveryEnvelope(envelope)
		assert.equal(recovered.status, 'loaded')
		if (recovered.status === 'loaded') {
			assert.equal(recovered.revision, 9)
			assert.deepEqual(recovered.project, project)
		}

		const parsed = JSON.parse(decodeUtf8(envelope)) as {
			checksum: string
			payload: { manifestBase64: string; recoveryVersion: number; revision: number }
		}
		const first = parsed.payload.manifestBase64[0]
		const corrupted = encodeCanonicalJson({
			...parsed,
			payload: {
				...parsed.payload,
				manifestBase64: `${first === 'A' ? 'B' : 'A'}${parsed.payload.manifestBase64.slice(1)}`
			}
		})
		assert.equal(decodeRecoveryEnvelope(corrupted).status, 'invalid')
	})
})
