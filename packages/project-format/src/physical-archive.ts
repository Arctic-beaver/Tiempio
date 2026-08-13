import {
	Unzip,
	UnzipInflate,
	zipSync,
	type UnzipFile,
	type Zippable,
	type ZipOptions
} from 'fflate'
import {
	openLogicalProjectArchive,
	projectArchiveLimits,
	validateLogicalArchive,
	type LogicalArchiveEntry,
	type ProjectArchiveOpenResult
} from './index.js'

const endOfCentralDirectorySignature = 0x06054b50
const centralDirectorySignature = 0x02014b50
const zip64ExtraIdentifier = 0x0001
const utf8 = new TextDecoder('utf-8', { fatal: true })

export const physicalProjectArchiveLimits = Object.freeze({
	maxArchiveBytes: projectArchiveLimits.maxTotalBytes + 2 * 1024 * 1024,
	maxCentralDirectoryBytes: 512 * 1024,
	maxCommentBytes: 4 * 1024
})

interface CentralDirectoryEntry {
	readonly compressedBytes: number
	readonly compression: 0 | 8
	readonly crc32: number
	readonly declaredBytes: number
	readonly path: string
}

export interface PhysicalProjectArchive {
	readonly archiveBytes: Uint8Array
	readonly logical: ProjectArchiveOpenResult
}

export type PhysicalProjectArchiveErrorCode = 'INVALID_ARCHIVE' | 'ARCHIVE_LIMIT_EXCEEDED'

export class PhysicalProjectArchiveError extends Error {
	public constructor(
		readonly code: PhysicalProjectArchiveErrorCode,
		message: string
	) {
		super(message)
		this.name = 'PhysicalProjectArchiveError'
	}
}

function archiveError(message: string, tooLarge = false): PhysicalProjectArchiveError {
	return new PhysicalProjectArchiveError(
		tooLarge ? 'ARCHIVE_LIMIT_EXCEEDED' : 'INVALID_ARCHIVE',
		message
	)
}

function view(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
	const minimumLength = 22
	if (bytes.byteLength < minimumLength) throw archiveError('The project archive is truncated.')
	const data = view(bytes)
	const lowerBound = Math.max(0, bytes.byteLength - 65_535 - minimumLength)
	for (let offset = bytes.byteLength - minimumLength; offset >= lowerBound; offset -= 1) {
		if (data.getUint32(offset, true) === endOfCentralDirectorySignature) return offset
	}
	throw archiveError('The project archive has no valid central directory.')
}

function containsZip64Extra(bytes: Uint8Array): boolean {
	const data = view(bytes)
	let offset = 0
	while (offset < bytes.byteLength) {
		if (offset + 4 > bytes.byteLength) return true
		const identifier = data.getUint16(offset, true)
		const size = data.getUint16(offset + 2, true)
		offset += 4
		if (offset + size > bytes.byteLength) return true
		if (identifier === zip64ExtraIdentifier) return true
		offset += size
	}
	return false
}

function normalizedArchivePath(path: string): string | null {
	if (
		path.length === 0 ||
		path.length > projectArchiveLimits.maxPathLength ||
		path.startsWith('/') ||
		path.endsWith('/') ||
		path.includes('\\') ||
		path !== path.normalize('NFC')
	) {
		return null
	}
	const segments = path.split('/')
	if (
		segments.some(
			(segment) =>
				segment.length === 0 ||
				segment === '.' ||
				segment === '..' ||
				!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)
		)
	) {
		return null
	}
	return segments.join('/').toLocaleLowerCase('en-US')
}

function preflightCentralDirectory(bytes: Uint8Array): readonly CentralDirectoryEntry[] {
	if (bytes.byteLength > physicalProjectArchiveLimits.maxArchiveBytes) {
		throw archiveError('The physical project archive exceeds its size limit.', true)
	}
	const data = view(bytes)
	const endOffset = findEndOfCentralDirectory(bytes)
	const disk = data.getUint16(endOffset + 4, true)
	const centralDisk = data.getUint16(endOffset + 6, true)
	const diskEntries = data.getUint16(endOffset + 8, true)
	const totalEntries = data.getUint16(endOffset + 10, true)
	const centralSize = data.getUint32(endOffset + 12, true)
	const centralOffset = data.getUint32(endOffset + 16, true)
	const commentLength = data.getUint16(endOffset + 20, true)
	if (
		disk !== 0 ||
		centralDisk !== 0 ||
		diskEntries !== totalEntries ||
		totalEntries === 0xffff ||
		centralSize === 0xffffffff ||
		centralOffset === 0xffffffff
	) {
		throw archiveError('Multi-disk and ZIP64 project archives are unsupported.')
	}
	if (
		totalEntries === 0 ||
		totalEntries > projectArchiveLimits.maxEntries ||
		centralSize > physicalProjectArchiveLimits.maxCentralDirectoryBytes ||
		commentLength > physicalProjectArchiveLimits.maxCommentBytes ||
		centralOffset + centralSize !== endOffset ||
		endOffset + 22 + commentLength !== bytes.byteLength
	) {
		throw archiveError('The project central directory is inconsistent or excessive.')
	}

	const entries: CentralDirectoryEntry[] = []
	let offset = centralOffset
	let totalBytes = 0
	const normalized = new Set<string>()
	for (let index = 0; index < totalEntries; index += 1) {
		if (offset + 46 > endOffset || data.getUint32(offset, true) !== centralDirectorySignature) {
			throw archiveError('The project central directory entry is truncated.')
		}
		const madeBy = data.getUint16(offset + 4, true)
		const flags = data.getUint16(offset + 8, true)
		const compression = data.getUint16(offset + 10, true)
		const checksum = data.getUint32(offset + 16, true)
		const compressedBytes = data.getUint32(offset + 20, true)
		const declaredBytes = data.getUint32(offset + 24, true)
		const nameLength = data.getUint16(offset + 28, true)
		const extraLength = data.getUint16(offset + 30, true)
		const entryCommentLength = data.getUint16(offset + 32, true)
		const startDisk = data.getUint16(offset + 34, true)
		const externalAttributes = data.getUint32(offset + 38, true)
		const end = offset + 46 + nameLength + extraLength + entryCommentLength
		if (end > endOffset || nameLength === 0 || startDisk !== 0) {
			throw archiveError('The project central directory entry is inconsistent.')
		}
		if ((flags & 0x41) !== 0 || (compression !== 0 && compression !== 8)) {
			throw archiveError('Encrypted or unsupported-compression project entries are rejected.')
		}
		const extra = bytes.subarray(
			offset + 46 + nameLength,
			offset + 46 + nameLength + extraLength
		)
		if (containsZip64Extra(extra)) throw archiveError('ZIP64 project entries are unsupported.')
		const operatingSystem = madeBy >>> 8
		const unixMode = externalAttributes >>> 16
		const unixType = unixMode & 0xf000
		if (
			(externalAttributes & 0x10) !== 0 ||
			(operatingSystem === 3 && unixType !== 0 && unixType !== 0x8000)
		) {
			throw archiveError('Directory, link and device entries are rejected.')
		}
		let path: string
		try {
			path = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
		} catch {
			throw archiveError('Project entry paths must be valid UTF-8.')
		}
		const identity = normalizedArchivePath(path)
		if (identity === null)
			throw archiveError('Archive paths must be canonical safe relative paths.')
		if (
			declaredBytes > projectArchiveLimits.maxEntryBytes ||
			compressedBytes > projectArchiveLimits.maxEntryBytes ||
			(declaredBytes > 0 && compressedBytes === 0) ||
			(declaredBytes > 0 &&
				declaredBytes / Math.max(1, compressedBytes) >
					projectArchiveLimits.maxCompressionRatio)
		) {
			throw archiveError('Archive entry sizes are inconsistent or excessive.', true)
		}
		if (normalized.has(identity))
			throw archiveError('The archive has duplicate normalized paths.')
		normalized.add(identity)
		if (totalBytes > projectArchiveLimits.maxTotalBytes - declaredBytes) {
			throw archiveError('The archive exceeds its total decompressed size limit.', true)
		}
		totalBytes += declaredBytes
		entries.push({
			path,
			compression,
			compressedBytes,
			declaredBytes,
			crc32: checksum
		})
		offset = end
	}
	if (offset !== endOffset) throw archiveError('The central directory has trailing records.')
	return Object.freeze(entries)
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff
	for (const byte of bytes) {
		crc ^= byte
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
	}
	return (crc ^ 0xffffffff) >>> 0
}

function concatenate(chunks: readonly Uint8Array[], length: number): Uint8Array {
	const result = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.byteLength
	}
	return result
}

function extractEntries(
	archiveBytes: Uint8Array,
	centralEntries: readonly CentralDirectoryEntry[]
): readonly LogicalArchiveEntry[] {
	const expected = new Map(centralEntries.map((entry) => [entry.path, entry]))
	const extracted = new Map<string, LogicalArchiveEntry>()
	let failure: Error | null = null
	const unzip = new Unzip((file: UnzipFile) => {
		const metadata = expected.get(file.name)
		if (failure !== null || metadata === undefined || extracted.has(file.name)) {
			failure ??= archiveError('Local ZIP entries do not match the central directory.')
			file.terminate()
			return
		}
		if (
			file.compression !== metadata.compression ||
			(file.size !== undefined && file.size !== metadata.compressedBytes) ||
			(file.originalSize !== undefined && file.originalSize !== metadata.declaredBytes)
		) {
			failure = archiveError('Local ZIP metadata does not match the central directory.')
			file.terminate()
			return
		}
		const chunks: Uint8Array[] = []
		let length = 0
		file.ondata = (error, chunk, final) => {
			if (failure !== null) return
			if (error !== null) {
				failure = archiveError('A project entry could not be decompressed.')
				return
			}
			if (length > metadata.declaredBytes - chunk.byteLength) {
				failure = archiveError('A project entry inflated beyond its declared limit.', true)
				return
			}
			chunks.push(new Uint8Array(chunk))
			length += chunk.byteLength
			if (!final) return
			const bytes = concatenate(chunks, length)
			if (length !== metadata.declaredBytes || crc32(bytes) !== metadata.crc32) {
				failure = archiveError('A project entry failed its size or checksum check.')
				return
			}
			extracted.set(
				file.name,
				Object.freeze({
					path: file.name,
					bytes,
					compressedBytes: metadata.compressedBytes,
					declaredBytes: metadata.declaredBytes
				})
			)
		}
		file.start()
	})
	unzip.register(UnzipInflate)
	try {
		unzip.push(archiveBytes, true)
	} catch {
		failure ??= archiveError('The project archive stream is malformed.')
	}
	if (failure !== null) throw failure
	if (extracted.size !== centralEntries.length) {
		throw archiveError('The project archive did not yield every declared entry.')
	}
	return Object.freeze(centralEntries.map((entry) => extracted.get(entry.path)!))
}

export function decodePhysicalProjectArchive(input: Uint8Array): PhysicalProjectArchive {
	const archiveBytes = new Uint8Array(input)
	const centralEntries = preflightCentralDirectory(archiveBytes)
	const entries = extractEntries(archiveBytes, centralEntries)
	const logical = openLogicalProjectArchive(entries)
	if (logical.status === 'invalid') throw archiveError(logical.error.message)
	return Object.freeze({ archiveBytes, logical })
}

export function encodePhysicalProjectArchive(entries: readonly LogicalArchiveEntry[]): Uint8Array {
	const validated = validateLogicalArchive(entries)
	if (!validated.ok) {
		throw archiveError(
			validated.error.message,
			validated.error.code === 'ARCHIVE_LIMIT_EXCEEDED'
		)
	}
	const zippable: Zippable = Object.fromEntries(
		validated.entries.map((entry) => [
			entry.path,
			[
				entry.bytes,
				{ level: 6, mtime: '1980-01-01T00:00:00.000Z' } satisfies ZipOptions
			] as const
		])
	)
	const archive = zipSync(zippable, { level: 6, mtime: '1980-01-01T00:00:00.000Z' })
	if (archive.byteLength > physicalProjectArchiveLimits.maxArchiveBytes) {
		throw archiveError('The encoded project archive exceeds its physical limit.', true)
	}
	return new Uint8Array(archive)
}
