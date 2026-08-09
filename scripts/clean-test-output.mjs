import { rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

requireLifecycleOwnership('Compiled test output cleanup')

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(repositoryRoot, '.test-out')

if (dirname(outputRoot) !== repositoryRoot || basename(outputRoot) !== '.test-out') {
	throw new Error(`Refusing to clean unexpected test output path: ${outputRoot}`)
}

await rm(outputRoot, { recursive: true, force: true })
console.log('PASS compiled test output cleanup: .test-out is absent before compilation.')
