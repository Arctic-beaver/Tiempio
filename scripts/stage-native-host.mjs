import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

requireLifecycleOwnership('Native engine staging')

const repositoryRoot = resolve('.')
const executableName =
	process.platform === 'win32' ? 'tiempio-engine-native-host.exe' : 'tiempio-engine-native-host'
const source = resolve(repositoryRoot, 'engine/target/release', executableName)
const destination = resolve(
	repositoryRoot,
	'build/native',
	`${process.platform}-${process.arch}`,
	executableName
)

function inside(root, candidate) {
	return candidate.startsWith(`${root}${sep}`)
}

if (!inside(resolve(repositoryRoot, 'engine/target/release'), source)) {
	throw new Error(`Native host source escaped its build root: ${basename(source)}`)
}
if (!inside(resolve(repositoryRoot, 'build/native'), destination)) {
	throw new Error(`Native host destination escaped its staging root: ${basename(destination)}`)
}

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
console.log(`PASS native host staging: ${process.platform}-${process.arch}/${executableName}`)
