import { createHash } from 'node:crypto'

export const nativeHostIntegrityLimits = Object.freeze({
	maxExecutableBytes: 64 * 1024 * 1024
})

export function nativeHostExecutableName(platform) {
	return platform === 'win32' ? 'tiempio-engine-native-host.exe' : 'tiempio-engine-native-host'
}

export function nativeHostTarget(platform, architecture) {
	return `${platform}-${architecture}`
}

export function nativeHostSha256(bytes) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex').toUpperCase()}`
}

function windowsMachine(bytes) {
	if (bytes.byteLength < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null
	const peOffset = bytes.readUInt32LE(0x3c)
	if (
		peOffset > bytes.byteLength - 6 ||
		bytes[peOffset] !== 0x50 ||
		bytes[peOffset + 1] !== 0x45 ||
		bytes[peOffset + 2] !== 0 ||
		bytes[peOffset + 3] !== 0
	) {
		return null
	}
	return bytes.readUInt16LE(peOffset + 4)
}

function elfMachine(bytes) {
	if (
		bytes.byteLength < 20 ||
		bytes[0] !== 0x7f ||
		bytes[1] !== 0x45 ||
		bytes[2] !== 0x4c ||
		bytes[3] !== 0x46 ||
		bytes[5] !== 1
	) {
		return null
	}
	return bytes.readUInt16LE(18)
}

function machMachine(bytes) {
	if (bytes.byteLength < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf) return null
	return bytes.readUInt32LE(4)
}

export function validateNativeExecutable(bytes, platform, architecture) {
	const errors = []
	if (!Buffer.isBuffer(bytes)) return ['native host bytes must use a Buffer']
	if (bytes.byteLength === 0 || bytes.byteLength > nativeHostIntegrityLimits.maxExecutableBytes) {
		errors.push('native host executable size is outside the accepted bound')
		return errors
	}
	const expected =
		platform === 'win32'
			? { x64: 0x8664, ia32: 0x014c, arm64: 0xaa64 }[architecture]
			: platform === 'linux'
				? { x64: 0x003e, ia32: 0x0003, arm64: 0x00b7 }[architecture]
				: platform === 'darwin'
					? { x64: 0x01000007, arm64: 0x0100000c }[architecture]
					: undefined
	const actual =
		platform === 'win32'
			? windowsMachine(bytes)
			: platform === 'linux'
				? elfMachine(bytes)
				: platform === 'darwin'
					? machMachine(bytes)
					: null
	if (expected === undefined || actual !== expected) {
		errors.push(`native host executable does not match ${platform}-${architecture}`)
	}
	return errors
}

export function createNativeHostManifest(bytes, platform, architecture) {
	return Object.freeze({
		schemaVersion: 1,
		platform,
		architecture,
		target: nativeHostTarget(platform, architecture),
		fileName: nativeHostExecutableName(platform),
		bytes: bytes.byteLength,
		sha256: nativeHostSha256(bytes)
	})
}

export function validateNativeHostManifest(manifest, bytes, platform, architecture) {
	if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
		return ['native host manifest must be an object']
	}
	const keys = Object.keys(manifest).sort()
	const expectedKeys = [
		'architecture',
		'bytes',
		'fileName',
		'platform',
		'schemaVersion',
		'sha256',
		'target'
	].sort()
	const errors = []
	if (
		keys.length !== expectedKeys.length ||
		keys.some((key, index) => key !== expectedKeys[index])
	) {
		errors.push('native host manifest has unexpected fields')
	}
	const expected = createNativeHostManifest(bytes, platform, architecture)
	for (const [key, value] of Object.entries(expected)) {
		if (manifest[key] !== value) errors.push(`native host manifest ${key} is invalid`)
	}
	return errors
}
