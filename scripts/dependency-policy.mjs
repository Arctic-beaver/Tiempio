import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

export function validateDependencyDocuments(packageDocument, lockDocument) {
	const errors = []
	if (!/^npm@\d+\.\d+\.\d+$/u.test(packageDocument.packageManager ?? '')) {
		errors.push('packageManager must pin an exact npm version')
	}
	if (lockDocument.lockfileVersion !== 3)
		errors.push('package-lock.json must use lockfileVersion 3')
	const lockRoot = lockDocument.packages?.['']
	if (lockRoot === undefined) errors.push('package-lock.json has no root package record')
	for (const dependencyClass of ['dependencies', 'devDependencies']) {
		const declared = packageDocument[dependencyClass] ?? {}
		const lockedDeclarations = lockRoot?.[dependencyClass] ?? {}
		for (const [name, version] of Object.entries(declared)) {
			if (typeof version !== 'string' || !exactVersion.test(version)) {
				errors.push(`${dependencyClass}.${name} is not pinned exactly: ${String(version)}`)
			}
			if (lockedDeclarations[name] !== version) {
				errors.push(
					`${dependencyClass}.${name} differs between package.json and package-lock.json`
				)
			}
			const installedVersion = lockDocument.packages?.[`node_modules/${name}`]?.version
			if (installedVersion !== version) {
				errors.push(
					`${dependencyClass}.${name} resolves to ${String(installedVersion)}, expected ${version}`
				)
			}
		}
		for (const name of Object.keys(lockedDeclarations)) {
			if (!Object.hasOwn(declared, name)) {
				errors.push(`package-lock.json contains undeclared root ${dependencyClass}.${name}`)
			}
		}
	}
	return errors.sort()
}

export function auditDependencyPolicy({
	repositoryRoot = resolve('.'),
	report = console.log
} = {}) {
	const packageDocument = JSON.parse(
		readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
	)
	const lockDocument = JSON.parse(
		readFileSync(resolve(repositoryRoot, 'package-lock.json'), 'utf8')
	)
	const errors = validateDependencyDocuments(packageDocument, lockDocument)
	if (errors.length > 0) throw new Error(`Dependency policy failed:\n- ${errors.join('\n- ')}`)
	const count =
		Object.keys(packageDocument.dependencies ?? {}).length +
		Object.keys(packageDocument.devDependencies ?? {}).length
	const message = `PASS dependency policy: ${String(count)} direct dependencies are exactly pinned and locked.`
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Pinned dependency policy')
	auditDependencyPolicy()
}
