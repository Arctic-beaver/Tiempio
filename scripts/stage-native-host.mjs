import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'
import {
	createNativeHostManifest,
	nativeHostExecutableName,
	nativeHostTarget,
	validateNativeExecutable
} from './native-host-integrity.mjs'

requireLifecycleOwnership('Native engine staging')

const repositoryRoot = resolve('.')
const executableName = nativeHostExecutableName(process.platform)
const source = resolve(repositoryRoot, 'engine/target/release', executableName)
const stagingRoot = resolve(repositoryRoot, 'build/native')
const destinationRoot = resolve(stagingRoot, nativeHostTarget(process.platform, process.arch))
const destination = resolve(destinationRoot, executableName)

function inside(root, candidate) {
	return candidate.startsWith(`${root}${sep}`)
}

if (!inside(resolve(repositoryRoot, 'engine/target/release'), source)) {
	throw new Error(`Native host source escaped its build root: ${basename(source)}`)
}
if (!inside(stagingRoot, destinationRoot) || !inside(destinationRoot, destination)) {
	throw new Error(`Native host destination escaped its staging root: ${basename(destination)}`)
}

const bytes = readFileSync(source)
const integrityErrors = validateNativeExecutable(bytes, process.platform, process.arch)
if (integrityErrors.length > 0) {
	throw new Error(`Native host integrity failed:\n- ${integrityErrors.join('\n- ')}`)
}
rmSync(destinationRoot, { force: true, recursive: true })
mkdirSync(destinationRoot, { recursive: true })
writeFileSync(destination, bytes, { flag: 'wx' })
const manifest = createNativeHostManifest(bytes, process.platform, process.arch)
writeFileSync(resolve(destinationRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
	encoding: 'utf8',
	flag: 'wx'
})
console.log(`PASS native host staging: ${manifest.target}/${executableName} ${manifest.sha256}`)
