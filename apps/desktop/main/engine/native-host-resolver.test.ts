import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveNativeHostBinary } from './native-host-resolver.js'

function executableFixture(architecture = process.arch): Buffer {
	const bytes = Buffer.alloc(256)
	if (process.platform === 'win32') {
		const machine = (
			{ x64: 0x8664, ia32: 0x014c, arm64: 0xaa64 } as Readonly<Record<string, number>>
		)[architecture]
		if (machine === undefined)
			throw new Error(`Unsupported fixture architecture ${architecture}`)
		bytes.write('MZ', 0, 'ascii')
		bytes.writeUInt32LE(128, 0x3c)
		bytes.write('PE\0\0', 128, 'binary')
		bytes.writeUInt16LE(machine, 132)
	} else if (process.platform === 'linux') {
		const machine = (
			{ x64: 0x003e, ia32: 0x0003, arm64: 0x00b7 } as Readonly<Record<string, number>>
		)[architecture]
		if (machine === undefined)
			throw new Error(`Unsupported fixture architecture ${architecture}`)
		bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0)
		bytes.writeUInt16LE(machine, 18)
	} else {
		const machine = (
			{ x64: 0x01000007, arm64: 0x0100000c } as Readonly<Record<string, number>>
		)[architecture]
		if (machine === undefined)
			throw new Error(`Unsupported fixture architecture ${architecture}`)
		bytes.writeUInt32LE(0xfeedfacf, 0)
		bytes.writeUInt32LE(machine, 4)
	}
	return bytes
}

function manifestFor(
	bytes: Buffer,
	target: string
): Readonly<{
	architecture: string
	bytes: number
	fileName: string
	platform: NodeJS.Platform
	schemaVersion: 1
	sha256: string
	target: string
}> {
	return {
		schemaVersion: 1,
		platform: process.platform,
		architecture: process.arch,
		target,
		fileName:
			process.platform === 'win32'
				? 'tiempio-engine-native-host.exe'
				: 'tiempio-engine-native-host',
		bytes: bytes.byteLength,
		sha256: `sha256:${createHash('sha256').update(bytes).digest('hex').toUpperCase()}`
	}
}

test('native host resolution accepts only the explicit development platform target', async () => {
	const root = await mkdtemp(join(tmpdir(), 'tiempio-native-resolution-'))
	try {
		const target = `${process.platform}-${process.arch}`
		const directory = join(root, 'build', 'native', target)
		const executable = join(
			directory,
			process.platform === 'win32'
				? 'tiempio-engine-native-host.exe'
				: 'tiempio-engine-native-host'
		)
		await mkdir(directory, { recursive: true })
		const bytes = executableFixture()
		const sha256 = manifestFor(bytes, target).sha256
		await writeFile(executable, bytes)
		await writeFile(
			join(directory, 'manifest.json'),
			JSON.stringify(manifestFor(bytes, target))
		)
		const resolved = await resolveNativeHostBinary({
			appPath: root,
			architecture: process.arch,
			isPackaged: false,
			platform: process.platform,
			resourcesPath: join(root, 'resources')
		})
		assert.equal(resolved.executablePath, executable)
		assert.equal(resolved.target, target)
		assert.equal(resolved.bytes, bytes.byteLength)
		assert.equal(resolved.sha256, sha256)
		const unexpected = join(directory, 'source.rs')
		await writeFile(unexpected, 'forbidden')
		await assert.rejects(() =>
			resolveNativeHostBinary({
				appPath: root,
				architecture: process.arch,
				isPackaged: false,
				platform: process.platform,
				resourcesPath: join(root, 'resources')
			})
		)
		await unlink(unexpected)
		const otherArchitecture = process.arch === 'x64' ? 'arm64' : 'x64'
		const wrongArchitecture = executableFixture(otherArchitecture)
		await writeFile(executable, wrongArchitecture)
		await writeFile(
			join(directory, 'manifest.json'),
			JSON.stringify(manifestFor(wrongArchitecture, target))
		)
		await assert.rejects(
			() =>
				resolveNativeHostBinary({
					appPath: root,
					architecture: process.arch,
					isPackaged: false,
					platform: process.platform,
					resourcesPath: join(root, 'resources')
				}),
			/architecture/u
		)
		await writeFile(executable, 'corrupt')
		await assert.rejects(() =>
			resolveNativeHostBinary({
				appPath: root,
				architecture: process.arch,
				isPackaged: false,
				platform: process.platform,
				resourcesPath: join(root, 'resources')
			})
		)
		await assert.rejects(() =>
			resolveNativeHostBinary({
				appPath: join(root, 'missing'),
				architecture: process.arch,
				isPackaged: false,
				platform: process.platform,
				resourcesPath: join(root, 'resources')
			})
		)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
