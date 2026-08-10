import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	validateDesktopPackageConfiguration,
	validateDesktopPackageEntries
} from './package-content-policy.mjs'
import {
	createNativeHostManifest,
	validateNativeExecutable,
	validateNativeHostManifest
} from './native-host-integrity.mjs'

const exactBuildConfiguration = Object.freeze({
	files: ['dist/desktop/**/*', 'package.json'],
	extraResources: [
		{
			from: 'build/native/${platform}-${arch}',
			to: 'native/${platform}-${arch}',
			filter: [
				'tiempio-engine-native-host',
				'tiempio-engine-native-host.exe',
				'manifest.json'
			]
		}
	],
	electronFuses: {
		runAsNode: false,
		enableCookieEncryption: true,
		enableNodeOptionsEnvironmentVariable: false,
		enableNodeCliInspectArguments: false,
		enableEmbeddedAsarIntegrityValidation: true,
		onlyLoadAppFromAsar: true
	}
})

function executableFixture(platform, architecture) {
	const bytes = Buffer.alloc(256)
	if (platform === 'win32') {
		bytes.write('MZ', 0, 'ascii')
		bytes.writeUInt32LE(128, 0x3c)
		bytes.write('PE\0\0', 128, 'binary')
		bytes.writeUInt16LE({ x64: 0x8664, ia32: 0x014c, arm64: 0xaa64 }[architecture], 132)
	} else if (platform === 'linux') {
		bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0)
		bytes.writeUInt16LE({ x64: 0x003e, ia32: 0x0003, arm64: 0x00b7 }[architecture], 18)
	} else {
		bytes.writeUInt32LE(0xfeedfacf, 0)
		bytes.writeUInt32LE({ x64: 0x01000007, arm64: 0x0100000c }[architecture], 4)
	}
	return bytes
}

describe('Desktop package content separation', () => {
	it('accepts the exact bounded Desktop file set', () => {
		assert.deepEqual(
			validateDesktopPackageConfiguration({
				build: exactBuildConfiguration
			}),
			[]
		)
	})

	it('binds the native host manifest to target, bytes and executable architecture', () => {
		const bytes = executableFixture(process.platform, process.arch)
		const manifest = createNativeHostManifest(bytes, process.platform, process.arch)
		assert.deepEqual(validateNativeExecutable(bytes, process.platform, process.arch), [])
		assert.deepEqual(
			validateNativeHostManifest(manifest, bytes, process.platform, process.arch),
			[]
		)
		assert.match(
			validateNativeHostManifest(
				{ ...manifest, sha256: `sha256:${'0'.repeat(64)}` },
				bytes,
				process.platform,
				process.arch
			).join('\n'),
			/sha256/u
		)
		assert.equal(
			validateNativeExecutable(
				bytes,
				process.platform,
				process.arch === 'x64' ? 'arm64' : 'x64'
			).length > 0,
			true
		)
	})

	it('rejects a package pattern that can include Web output', () => {
		assert.match(
			validateDesktopPackageConfiguration({ build: { files: ['dist/**/*'] } }).join('\n'),
			/must be exactly|unbounded/u
		)
	})

	it('rejects fixture entries from Web and node_modules', () => {
		assert.deepEqual(
			validateDesktopPackageEntries([
				'dist/desktop/main/index.js',
				'dist/web/assets/web.js',
				'node_modules/electron/index.js'
			]),
			[
				'Desktop package includes forbidden entry dist/web/assets/web.js',
				'Desktop package includes forbidden entry node_modules/electron/index.js'
			]
		)
	})
})
