import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { access, link, mkdir, open, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PersistenceBoundaryError } from './persistence-error.js'

export type PersistenceFaultPoint =
	| 'open-source'
	| 'archive-read'
	| 'write'
	| 'flush'
	| 'conflict-check'
	| 'replace'
	| 'recovery-write'
	| 'cleanup'

export interface PersistenceFaultInjector {
	hit(point: PersistenceFaultPoint): void | Promise<void>
}

export interface AtomicWriteOptions {
	readonly expectedFingerprint: string | null
	readonly faults?: PersistenceFaultInjector
	readonly faultPoint?: Extract<PersistenceFaultPoint, 'recovery-write' | 'write'>
}

const noFaults: PersistenceFaultInjector = Object.freeze({ hit: () => undefined })
const maxAtomicComparisonBytes = 64 * 1024 * 1024

function nodeErrorCode(error: unknown): string | null {
	return typeof error === 'object' && error !== null && 'code' in error
		? String((error as { code: unknown }).code)
		: null
}

export function sha256Fingerprint(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex').toUpperCase()}`
}

export async function canonicalExistingFile(sourcePath: string): Promise<string> {
	let canonical: string
	try {
		canonical = await realpath(sourcePath)
		const metadata = await stat(canonical)
		if (!metadata.isFile())
			throw new PersistenceBoundaryError(
				'PROJECT_INVALID',
				'The selected project is not a file.'
			)
	} catch (error) {
		if (error instanceof PersistenceBoundaryError) throw error
		if (nodeErrorCode(error) === 'ENOENT') {
			throw new PersistenceBoundaryError(
				'PROJECT_MISSING',
				'The selected project no longer exists.'
			)
		}
		throw new PersistenceBoundaryError(
			'STORAGE_UNAVAILABLE',
			'The selected project could not be inspected.',
			true
		)
	}
	return process.platform === 'win32' ? canonical.toLocaleLowerCase('en-US') : canonical
}

export async function canonicalDestination(destinationPath: string): Promise<string> {
	const absolute = resolve(destinationPath)
	let canonicalParent: string
	try {
		canonicalParent = await realpath(dirname(absolute))
	} catch {
		throw new PersistenceBoundaryError(
			'PROJECT_MISSING',
			'The selected destination folder no longer exists.'
		)
	}
	const candidate = join(canonicalParent, basename(absolute))
	return process.platform === 'win32' ? candidate.toLocaleLowerCase('en-US') : candidate
}

export async function readBoundedFile(
	path: string,
	maximumBytes: number,
	faults: PersistenceFaultInjector = noFaults
): Promise<Uint8Array> {
	await faults.hit('open-source')
	let file
	try {
		file = await open(path, 'r')
		const metadata = await file.stat()
		if (!metadata.isFile()) {
			throw new PersistenceBoundaryError(
				'PROJECT_INVALID',
				'The selected source is not a regular file.'
			)
		}
		if (
			!Number.isSafeInteger(metadata.size) ||
			metadata.size < 0 ||
			metadata.size > maximumBytes
		) {
			throw new PersistenceBoundaryError(
				'PROJECT_TOO_LARGE',
				'The selected source exceeds its size limit.'
			)
		}
		await faults.hit('archive-read')
		const result = new Uint8Array(metadata.size)
		let offset = 0
		while (offset < result.byteLength) {
			const { bytesRead } = await file.read(
				result,
				offset,
				result.byteLength - offset,
				offset
			)
			if (bytesRead === 0) {
				throw new PersistenceBoundaryError(
					'PROJECT_CHANGED',
					'The source changed while it was being read.',
					true
				)
			}
			offset += bytesRead
		}
		const sentinel = new Uint8Array(1)
		if ((await file.read(sentinel, 0, 1, result.byteLength)).bytesRead !== 0) {
			throw new PersistenceBoundaryError(
				'PROJECT_CHANGED',
				'The source changed while it was being read.',
				true
			)
		}
		return result
	} catch (error) {
		if (error instanceof PersistenceBoundaryError) throw error
		if (nodeErrorCode(error) === 'ENOENT') {
			throw new PersistenceBoundaryError('PROJECT_MISSING', 'The project source is missing.')
		}
		if (nodeErrorCode(error) === 'EACCES' || nodeErrorCode(error) === 'EPERM') {
			throw new PersistenceBoundaryError(
				'PERMISSION_DENIED',
				'The project source cannot be read.'
			)
		}
		throw new PersistenceBoundaryError(
			'STORAGE_UNAVAILABLE',
			'The project source could not be read.',
			true
		)
	} finally {
		await file?.close().catch(() => undefined)
	}
}

export async function fingerprintFile(
	path: string,
	maximumBytes: number,
	faults: PersistenceFaultInjector = noFaults
): Promise<string> {
	return sha256Fingerprint(await readBoundedFile(path, maximumBytes, faults))
}

async function destinationExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK)
		return true
	} catch (error) {
		if (nodeErrorCode(error) === 'ENOENT') return false
		throw error
	}
}

async function syncParentDirectory(path: string): Promise<void> {
	if (process.platform === 'win32') return
	const directory = await open(dirname(path), 'r')
	try {
		await directory.sync()
	} finally {
		await directory.close()
	}
}

async function replaceExistingFile(
	temporary: string,
	destination: string,
	expectedFingerprint: string
): Promise<void> {
	const retryDelaysMs = process.platform === 'win32' ? [0, 10, 25, 50] : [0]
	for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
		if (attempt > 0) {
			await delay(retryDelaysMs[attempt])
			const observed = await fingerprintFile(destination, maxAtomicComparisonBytes, noFaults)
			if (observed !== expectedFingerprint) {
				throw new PersistenceBoundaryError(
					'PROJECT_CHANGED',
					'The project changed outside Tiempio.',
					true
				)
			}
		}
		try {
			await rename(temporary, destination)
			return
		} catch (error) {
			const code = nodeErrorCode(error)
			const canRetry = process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY')
			if (!canRetry || attempt === retryDelaysMs.length - 1) throw error
		}
	}
}

export async function atomicReplaceFile(
	destination: string,
	bytes: Uint8Array,
	options: AtomicWriteOptions
): Promise<string> {
	const faults = options.faults ?? noFaults
	const parent = dirname(destination)
	await mkdir(parent, { recursive: true })
	const temporary = join(
		parent,
		`.${basename(destination)}.${randomBytes(16).toString('hex')}.tiempio-tmp`
	)
	let temporaryExists = false
	let file
	try {
		file = await open(temporary, 'wx', 0o600)
		temporaryExists = true
		await faults.hit(options.faultPoint ?? 'write')
		await file.writeFile(bytes)
		await faults.hit('flush')
		await file.sync()
		await file.close()
		file = undefined
		await faults.hit('conflict-check')
		if (typeof options.expectedFingerprint === 'string') {
			const observed = await fingerprintFile(destination, maxAtomicComparisonBytes, noFaults)
			if (observed !== options.expectedFingerprint) {
				throw new PersistenceBoundaryError(
					'PROJECT_CHANGED',
					'The project changed outside Tiempio.',
					true
				)
			}
		} else if (options.expectedFingerprint === null && (await destinationExists(destination))) {
			throw new PersistenceBoundaryError(
				'PROJECT_DESTINATION_CONFLICT',
				'The selected destination is already occupied.'
			)
		}
		await faults.hit('replace')
		if (options.expectedFingerprint === null) {
			try {
				await link(temporary, destination)
			} catch (error) {
				if (nodeErrorCode(error) === 'EEXIST') {
					throw new PersistenceBoundaryError(
						'PROJECT_DESTINATION_CONFLICT',
						'The selected destination became occupied.'
					)
				}
				throw error
			}
			await rm(temporary)
			temporaryExists = false
		} else {
			await replaceExistingFile(temporary, destination, options.expectedFingerprint)
			temporaryExists = false
		}
		await syncParentDirectory(destination)
		return sha256Fingerprint(bytes)
	} catch (error) {
		if (error instanceof PersistenceBoundaryError) throw error
		if (nodeErrorCode(error) === 'EACCES' || nodeErrorCode(error) === 'EPERM') {
			throw new PersistenceBoundaryError(
				'PROJECT_READ_ONLY',
				'The project destination is read-only.'
			)
		}
		throw new PersistenceBoundaryError(
			'STORAGE_UNAVAILABLE',
			'The project could not be written atomically.',
			true
		)
	} finally {
		await file?.close().catch(() => undefined)
		if (temporaryExists) {
			try {
				await faults.hit('cleanup')
			} catch {
				// Cleanup is still attempted without replacing the original operation error.
			}
			await rm(temporary, { force: true }).catch(() => undefined)
		}
	}
}
