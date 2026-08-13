import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createProject,
	projectSchemaVersion,
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

	it('preserves exact future-version bytes and blocks current save', () => {
		const bytes = encodeCanonicalJson({
			schemaVersion: projectSchemaVersion + 1,
			futureField: 'keep exactly'
		})
		const result = parseProjectManifest(bytes)
		assert.equal(result.status, 'unsupported')
		if (result.status !== 'unsupported') return
		assert.equal(result.saveAllowed, false)
		assert.deepEqual(result.originalBytes, bytes)
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
