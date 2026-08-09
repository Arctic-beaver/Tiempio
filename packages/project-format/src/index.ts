import {
	assertValidProject,
	loadProjectDocument,
	type ProjectDocument,
	type ProjectLoadResult,
	type ProjectValidationIssue
} from '../../project-core/src/index.js'
import { decodeUtf8, encodeCanonicalJson } from './canonical-json.js'

export const projectFormatVersion = 1 as const
export const projectManifestPath = 'project.json' as const

export const projectArchiveLimits = Object.freeze({
	maxCompressionRatio: 200,
	maxEntries: 512,
	maxEntryBytes: 16 * 1024 * 1024,
	maxManifestBytes: 4 * 1024 * 1024,
	maxPathLength: 240,
	maxTotalBytes: 32 * 1024 * 1024
})

export interface LogicalArchiveEntry {
	readonly bytes: Uint8Array
	readonly compressedBytes: number
	readonly declaredBytes: number
	readonly path: string
}

export type ProjectFormatErrorCode =
	| 'ARCHIVE_LIMIT_EXCEEDED'
	| 'DUPLICATE_PATH'
	| 'INVALID_ARCHIVE'
	| 'INVALID_MANIFEST'
	| 'INVALID_PATH'
	| 'MISSING_MANIFEST'

export interface ProjectFormatError {
	readonly code: ProjectFormatErrorCode
	readonly message: string
	readonly path: string | null
}

export type ManifestReadResult =
	| {
			readonly migratedFromSchemaVersion: number | null
			readonly project: ProjectDocument
			readonly status: 'loaded'
	  }
	| {
			readonly error: ProjectFormatError
			readonly issues: readonly ProjectValidationIssue[]
			readonly status: 'invalid'
	  }
	| {
			readonly compatibility: Extract<ProjectLoadResult, { status: 'unsupported' }>
			readonly originalBytes: Uint8Array
			readonly saveAllowed: false
			readonly status: 'unsupported'
	  }

export type LogicalArchiveValidationResult =
	| { readonly entries: readonly LogicalArchiveEntry[]; readonly ok: true }
	| { readonly error: ProjectFormatError; readonly ok: false }

export type ProjectArchiveOpenResult =
	| {
			readonly entries: readonly LogicalArchiveEntry[]
			readonly project: ProjectDocument
			readonly saveAllowed: true
			readonly status: 'loaded'
	  }
	| {
			readonly compatibility: Extract<ProjectLoadResult, { status: 'unsupported' }>
			readonly entries: readonly LogicalArchiveEntry[]
			readonly originalManifestBytes: Uint8Array
			readonly saveAllowed: false
			readonly status: 'unsupported'
	  }
	| { readonly error: ProjectFormatError; readonly status: 'invalid' }

function formatError(
	code: ProjectFormatErrorCode,
	message: string,
	path: string | null = null
): ProjectFormatError {
	return Object.freeze({ code, message, path })
}

function ownedBytes(bytes: Uint8Array): Uint8Array {
	return new Uint8Array(bytes)
}

function canonicalPath(path: string): string | null {
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

function validSize(value: number, maximum: number): boolean {
	return Number.isSafeInteger(value) && value >= 0 && value <= maximum
}

export function encodeProjectManifest(project: ProjectDocument): Uint8Array {
	return encodeCanonicalJson(assertValidProject(project))
}

export function parseProjectManifest(bytes: Uint8Array): ManifestReadResult {
	const originalBytes = ownedBytes(bytes)
	if (originalBytes.byteLength > projectArchiveLimits.maxManifestBytes) {
		return {
			status: 'invalid',
			error: formatError(
				'ARCHIVE_LIMIT_EXCEEDED',
				'The project manifest is too large.',
				projectManifestPath
			),
			issues: Object.freeze([])
		}
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(decodeUtf8(originalBytes)) as unknown
	} catch (error) {
		return {
			status: 'invalid',
			error: formatError(
				'INVALID_MANIFEST',
				`The project manifest is not valid UTF-8 JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
				projectManifestPath
			),
			issues: Object.freeze([])
		}
	}
	const loaded = loadProjectDocument(parsed)
	if (loaded.status === 'loaded') {
		return {
			status: 'loaded',
			project: loaded.project,
			migratedFromSchemaVersion: loaded.migratedFromSchemaVersion
		}
	}
	if (loaded.status === 'unsupported') {
		return {
			status: 'unsupported',
			compatibility: loaded,
			originalBytes,
			saveAllowed: false
		}
	}
	return {
		status: 'invalid',
		error: formatError(
			'INVALID_MANIFEST',
			'The project manifest failed schema validation.',
			projectManifestPath
		),
		issues: loaded.issues
	}
}

export function validateLogicalArchive(
	entries: readonly LogicalArchiveEntry[]
): LogicalArchiveValidationResult {
	if (entries.length === 0 || entries.length > projectArchiveLimits.maxEntries) {
		return {
			ok: false,
			error: formatError(
				'ARCHIVE_LIMIT_EXCEEDED',
				'The logical archive has an invalid entry count.'
			)
		}
	}
	const paths = new Set<string>()
	const owned: LogicalArchiveEntry[] = []
	let totalBytes = 0
	let manifestCount = 0
	for (const candidate of entries as readonly unknown[]) {
		if (
			typeof candidate !== 'object' ||
			candidate === null ||
			Array.isArray(candidate) ||
			(Object.getPrototypeOf(candidate) !== Object.prototype &&
				Object.getPrototypeOf(candidate) !== null)
		) {
			return {
				ok: false,
				error: formatError(
					'INVALID_ARCHIVE',
					'Every archive entry must have typed path, bytes and sizes.'
				)
			}
		}
		const record = candidate as Record<string, unknown>
		const path = record.path
		const bytes = record.bytes
		const declaredBytes = record.declaredBytes
		const compressedBytes = record.compressedBytes
		if (
			typeof path !== 'string' ||
			!(bytes instanceof Uint8Array) ||
			typeof declaredBytes !== 'number' ||
			typeof compressedBytes !== 'number'
		) {
			return {
				ok: false,
				error: formatError(
					'INVALID_ARCHIVE',
					'Every archive entry must have typed path, bytes and sizes.'
				)
			}
		}
		const entry: LogicalArchiveEntry = { path, bytes, declaredBytes, compressedBytes }
		const normalizedPath = canonicalPath(entry.path)
		if (normalizedPath === null) {
			return {
				ok: false,
				error: formatError(
					'INVALID_PATH',
					'Archive paths must be canonical safe relative paths.',
					entry.path
				)
			}
		}
		if (paths.has(normalizedPath)) {
			return {
				ok: false,
				error: formatError(
					'DUPLICATE_PATH',
					'The archive contains duplicate normalized paths.',
					entry.path
				)
			}
		}
		paths.add(normalizedPath)
		if (
			!validSize(entry.declaredBytes, projectArchiveLimits.maxEntryBytes) ||
			!validSize(entry.compressedBytes, projectArchiveLimits.maxEntryBytes) ||
			(entry.declaredBytes > 0 && entry.compressedBytes === 0) ||
			entry.bytes.byteLength !== entry.declaredBytes
		) {
			return {
				ok: false,
				error: formatError(
					'INVALID_ARCHIVE',
					'Archive entry sizes are inconsistent or excessive.',
					entry.path
				)
			}
		}
		if (
			entry.declaredBytes > 0 &&
			entry.declaredBytes / Math.max(1, entry.compressedBytes) >
				projectArchiveLimits.maxCompressionRatio
		) {
			return {
				ok: false,
				error: formatError(
					'ARCHIVE_LIMIT_EXCEEDED',
					'Archive entry compression ratio is suspicious.',
					entry.path
				)
			}
		}
		if (totalBytes > projectArchiveLimits.maxTotalBytes - entry.declaredBytes) {
			return {
				ok: false,
				error: formatError(
					'ARCHIVE_LIMIT_EXCEEDED',
					'The archive exceeds its total decompressed size limit.'
				)
			}
		}
		totalBytes += entry.declaredBytes
		if (normalizedPath === projectManifestPath) {
			manifestCount += 1
			if (entry.declaredBytes > projectArchiveLimits.maxManifestBytes) {
				return {
					ok: false,
					error: formatError(
						'ARCHIVE_LIMIT_EXCEEDED',
						'The project manifest is too large.',
						entry.path
					)
				}
			}
		}
		owned.push(
			Object.freeze({
				path: entry.path,
				bytes: ownedBytes(entry.bytes),
				declaredBytes: entry.declaredBytes,
				compressedBytes: entry.compressedBytes
			})
		)
	}
	if (manifestCount !== 1) {
		return {
			ok: false,
			error: formatError(
				'MISSING_MANIFEST',
				'The archive must contain exactly one project.json.'
			)
		}
	}
	return { ok: true, entries: Object.freeze(owned) }
}

export function createLogicalProjectArchive(
	project: ProjectDocument
): readonly LogicalArchiveEntry[] {
	const bytes = encodeProjectManifest(project)
	return Object.freeze([
		Object.freeze({
			path: projectManifestPath,
			bytes,
			declaredBytes: bytes.byteLength,
			compressedBytes: bytes.byteLength
		})
	])
}

export function openLogicalProjectArchive(
	entries: readonly LogicalArchiveEntry[]
): ProjectArchiveOpenResult {
	const validation = validateLogicalArchive(entries)
	if (!validation.ok) return { status: 'invalid', error: validation.error }
	const manifest = validation.entries.find(
		(entry) => entry.path.toLocaleLowerCase('en-US') === projectManifestPath
	)
	if (manifest === undefined) {
		return {
			status: 'invalid',
			error: formatError('MISSING_MANIFEST', 'The archive has no project.json.')
		}
	}
	const loaded = parseProjectManifest(manifest.bytes)
	if (loaded.status === 'invalid') return { status: 'invalid', error: loaded.error }
	if (loaded.status === 'unsupported') {
		return {
			status: 'unsupported',
			compatibility: loaded.compatibility,
			entries: validation.entries,
			originalManifestBytes: loaded.originalBytes,
			saveAllowed: false
		}
	}
	return {
		status: 'loaded',
		project: loaded.project,
		entries: validation.entries,
		saveAllowed: true
	}
}

export { canonicalJson, decodeUtf8, encodeCanonicalJson } from './canonical-json.js'
export {
	decodeRecoveryEnvelope,
	encodeRecoveryEnvelope,
	recoveryEnvelopeVersion,
	type RecoveryDecodeResult
} from './recovery.js'
