import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveNativeHostBinary } from './native-host-resolver.js'

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
		await writeFile(executable, 'fixture')
		const resolved = await resolveNativeHostBinary({
			appPath: root,
			architecture: process.arch,
			isPackaged: false,
			platform: process.platform,
			resourcesPath: join(root, 'resources')
		})
		assert.equal(resolved.executablePath, executable)
		assert.equal(resolved.target, target)
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
