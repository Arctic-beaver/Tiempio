import { type ProjectDocument } from '../../project-core/src/index.js'
import { decodeUtf8, encodeCanonicalJson } from './canonical-json.js'
import {
	encodeProjectManifest,
	parseProjectManifest,
	projectArchiveLimits,
	type ProjectFormatError
} from './index.js'

export const recoveryEnvelopeVersion = 1 as const

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

interface RecoveryPayloadV1 {
	readonly manifestBase64: string
	readonly recoveryVersion: typeof recoveryEnvelopeVersion
	readonly revision: number
}

export type RecoveryDecodeResult =
	| {
			readonly manifestBytes: Uint8Array
			readonly project: ProjectDocument
			readonly revision: number
			readonly status: 'loaded'
	  }
	| {
			readonly manifestBytes: Uint8Array
			readonly revision: number
			readonly saveAllowed: false
			readonly status: 'unsupported'
	  }
	| { readonly error: ProjectFormatError; readonly status: 'invalid' }

function recoveryError(message: string): ProjectFormatError {
	return Object.freeze({ code: 'INVALID_MANIFEST', message, path: null })
}

function encodeBase64(bytes: Uint8Array): string {
	let result = ''
	for (let index = 0; index < bytes.length; index += 3) {
		const first = bytes[index] ?? 0
		const second = bytes[index + 1] ?? 0
		const third = bytes[index + 2] ?? 0
		const combined = (first << 16) | (second << 8) | third
		result += base64Alphabet[(combined >>> 18) & 63]
		result += base64Alphabet[(combined >>> 12) & 63]
		result += index + 1 < bytes.length ? base64Alphabet[(combined >>> 6) & 63] : '='
		result += index + 2 < bytes.length ? base64Alphabet[combined & 63] : '='
	}
	return result
}

function decodeBase64(value: string): Uint8Array | null {
	if (
		value.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
	) {
		return null
	}
	const outputLength =
		(value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
	const output = new Uint8Array(outputLength)
	let outputIndex = 0
	for (let index = 0; index < value.length; index += 4) {
		const first = base64Alphabet.indexOf(value[index] ?? '')
		const second = base64Alphabet.indexOf(value[index + 1] ?? '')
		const third = value[index + 2] === '=' ? 0 : base64Alphabet.indexOf(value[index + 2] ?? '')
		const fourth = value[index + 3] === '=' ? 0 : base64Alphabet.indexOf(value[index + 3] ?? '')
		if (first < 0 || second < 0 || third < 0 || fourth < 0) return null
		const combined = (first << 18) | (second << 12) | (third << 6) | fourth
		if (outputIndex < outputLength) output[outputIndex++] = (combined >>> 16) & 255
		if (outputIndex < outputLength) output[outputIndex++] = (combined >>> 8) & 255
		if (outputIndex < outputLength) output[outputIndex++] = combined & 255
	}
	return output
}

function crc32(bytes: Uint8Array): string {
	let crc = 0xffffffff
	for (const byte of bytes) {
		crc ^= byte
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
	}
	return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

function plainRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
		? (value as Record<string, unknown>)
		: null
}

export function encodeRecoveryEnvelope(project: ProjectDocument, revision: number): Uint8Array {
	if (!Number.isSafeInteger(revision) || revision < 0) {
		throw new RangeError('Recovery revision must be a non-negative safe integer.')
	}
	const payload: RecoveryPayloadV1 = {
		recoveryVersion: recoveryEnvelopeVersion,
		revision,
		manifestBase64: encodeBase64(encodeProjectManifest(project))
	}
	return encodeCanonicalJson({
		checksum: `crc32:${crc32(encodeCanonicalJson(payload))}`,
		payload
	})
}

export function decodeRecoveryEnvelope(bytes: Uint8Array): RecoveryDecodeResult {
	if (bytes.byteLength > projectArchiveLimits.maxManifestBytes * 2) {
		return { status: 'invalid', error: recoveryError('The recovery envelope is too large.') }
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(decodeUtf8(bytes)) as unknown
	} catch (error) {
		return {
			status: 'invalid',
			error: recoveryError(
				`The recovery envelope is not valid UTF-8 JSON: ${error instanceof Error ? error.message : 'unknown error'}`
			)
		}
	}
	const envelope = plainRecord(parsed)
	const payload = envelope === null ? null : plainRecord(envelope.payload)
	if (
		envelope === null ||
		payload === null ||
		typeof envelope.checksum !== 'string' ||
		payload.recoveryVersion !== recoveryEnvelopeVersion ||
		typeof payload.revision !== 'number' ||
		!Number.isSafeInteger(payload.revision) ||
		payload.revision < 0 ||
		typeof payload.manifestBase64 !== 'string'
	) {
		return {
			status: 'invalid',
			error: recoveryError('The recovery envelope shape is invalid.')
		}
	}
	const expectedChecksum = `crc32:${crc32(encodeCanonicalJson(payload))}`
	if (envelope.checksum !== expectedChecksum) {
		return {
			status: 'invalid',
			error: recoveryError('The recovery checksum does not match its payload.')
		}
	}
	const manifestBytes = decodeBase64(payload.manifestBase64)
	if (
		manifestBytes === null ||
		manifestBytes.byteLength > projectArchiveLimits.maxManifestBytes
	) {
		return {
			status: 'invalid',
			error: recoveryError('The recovery manifest payload is invalid or excessive.')
		}
	}
	const manifest = parseProjectManifest(manifestBytes)
	if (manifest.status === 'invalid') return { status: 'invalid', error: manifest.error }
	if (manifest.status === 'unsupported') {
		return {
			status: 'unsupported',
			revision: payload.revision,
			manifestBytes: manifest.originalBytes,
			saveAllowed: false
		}
	}
	return {
		status: 'loaded',
		revision: payload.revision,
		manifestBytes,
		project: manifest.project
	}
}
