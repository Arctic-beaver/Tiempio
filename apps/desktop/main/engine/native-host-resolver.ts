import { createHash } from 'node:crypto'
import { access, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface NativeHostResolutionOptions {
	readonly appPath: string
	readonly architecture: NodeJS.Architecture
	readonly isPackaged: boolean
	readonly platform: NodeJS.Platform
	readonly resourcesPath: string
}

export interface ResolvedNativeHost {
	readonly approvedRoot: string
	readonly bytes: number
	readonly executablePath: string
	readonly sha256: string
	readonly target: string
}

const maximumNativeHostBytes = 64 * 1024 * 1024

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validManifest(
	value: unknown,
	options: NativeHostResolutionOptions,
	target: string,
	fileName: string,
	bytes: Uint8Array
): value is Readonly<{ readonly bytes: number; readonly sha256: string }> {
	if (!record(value)) return false
	const keys = Object.keys(value).sort()
	const expectedKeys = [
		'architecture',
		'bytes',
		'fileName',
		'platform',
		'schemaVersion',
		'sha256',
		'target'
	].sort()
	if (
		keys.length !== expectedKeys.length ||
		keys.some((key, index) => key !== expectedKeys[index])
	) {
		return false
	}
	const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex').toUpperCase()}`
	return (
		value.schemaVersion === 1 &&
		value.platform === options.platform &&
		value.architecture === options.architecture &&
		value.target === target &&
		value.fileName === fileName &&
		value.bytes === bytes.byteLength &&
		value.sha256 === sha256
	)
}

function executableName(platform: NodeJS.Platform): string {
	return platform === 'win32' ? 'tiempio-engine-native-host.exe' : 'tiempio-engine-native-host'
}

function validExecutableArchitecture(
	bytes: Buffer,
	platform: NodeJS.Platform,
	architecture: string
): boolean {
	if (platform === 'win32') {
		if (bytes.byteLength < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false
		const peOffset = bytes.readUInt32LE(0x3c)
		if (
			peOffset > bytes.byteLength - 6 ||
			bytes[peOffset] !== 0x50 ||
			bytes[peOffset + 1] !== 0x45 ||
			bytes[peOffset + 2] !== 0 ||
			bytes[peOffset + 3] !== 0
		) {
			return false
		}
		return (
			bytes.readUInt16LE(peOffset + 4) ===
			{ x64: 0x8664, ia32: 0x014c, arm64: 0xaa64 }[architecture]
		)
	}
	if (platform === 'linux') {
		return (
			bytes.byteLength >= 20 &&
			bytes[0] === 0x7f &&
			bytes[1] === 0x45 &&
			bytes[2] === 0x4c &&
			bytes[3] === 0x46 &&
			bytes[5] === 1 &&
			bytes.readUInt16LE(18) === { x64: 0x003e, ia32: 0x0003, arm64: 0x00b7 }[architecture]
		)
	}
	if (platform === 'darwin') {
		return (
			bytes.byteLength >= 8 &&
			bytes.readUInt32LE(0) === 0xfeedfacf &&
			bytes.readUInt32LE(4) === { x64: 0x01000007, arm64: 0x0100000c }[architecture]
		)
	}
	return false
}

function inside(root: string, candidate: string): boolean {
	const child = relative(root, candidate)
	return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

export async function resolveNativeHostBinary(
	options: NativeHostResolutionOptions
): Promise<ResolvedNativeHost> {
	const target = `${options.platform}-${options.architecture}`
	const fileName = executableName(options.platform)
	const configuredRoot = options.isPackaged
		? resolve(options.resourcesPath, 'native')
		: resolve(options.appPath, 'build', 'native')
	const configuredTarget = resolve(configuredRoot, target)
	const configuredExecutable = resolve(configuredTarget, fileName)
	const configuredManifest = resolve(configuredTarget, 'manifest.json')
	await access(configuredExecutable)
	const [approvedRoot, targetRoot, executablePath, manifestPath, metadata, entries] =
		await Promise.all([
			realpath(configuredRoot),
			realpath(configuredTarget),
			realpath(configuredExecutable),
			realpath(configuredManifest),
			stat(configuredExecutable),
			readdir(configuredTarget)
		])
	if (
		!metadata.isFile() ||
		metadata.size <= 0 ||
		metadata.size > maximumNativeHostBytes ||
		!inside(approvedRoot, targetRoot) ||
		!inside(targetRoot, executablePath) ||
		!inside(targetRoot, manifestPath)
	) {
		throw new Error('Native host executable is outside the approved application resource root.')
	}
	const expectedEntries = [fileName, 'manifest.json'].sort()
	if (
		entries.length !== expectedEntries.length ||
		entries.sort().some((entry, index) => entry !== expectedEntries[index])
	) {
		throw new Error('Native host resource directory contains unexpected files.')
	}
	const [bytes, manifestBytes] = await Promise.all([
		readFile(executablePath),
		readFile(manifestPath, 'utf8')
	])
	let manifest: unknown
	try {
		manifest = JSON.parse(manifestBytes) as unknown
	} catch {
		throw new Error('Native host integrity manifest is invalid.')
	}
	if (!validManifest(manifest, options, target, fileName, bytes)) {
		throw new Error('Native host integrity verification failed.')
	}
	if (!validExecutableArchitecture(bytes, options.platform, options.architecture)) {
		throw new Error('Native host executable architecture is invalid.')
	}
	if (options.isPackaged && executablePath.toLowerCase().includes('.asar')) {
		throw new Error('Packaged native host executable must remain outside app.asar.')
	}
	return Object.freeze({
		approvedRoot,
		bytes: bytes.byteLength,
		executablePath,
		sha256: manifest.sha256,
		target
	})
}
