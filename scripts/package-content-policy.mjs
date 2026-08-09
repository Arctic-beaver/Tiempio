import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const expectedDesktopFiles = Object.freeze(['dist/desktop/**/*', 'package.json'])

function normalizePath(path) {
	return path.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/^\//u, '')
}

export function validateDesktopPackageConfiguration(packageDocument) {
	const files = packageDocument.build?.files
	const errors = []
	if (!Array.isArray(files)) return ['package.json build.files must be an explicit array']
	if (JSON.stringify(files) !== JSON.stringify(expectedDesktopFiles)) {
		errors.push(`Desktop build.files must be exactly ${JSON.stringify(expectedDesktopFiles)}`)
	}
	for (const pattern of files) {
		if (typeof pattern !== 'string')
			errors.push('Desktop build.files contains a non-string entry')
		else if (/dist\/web|apps\/web|^\*\*\/\*|^dist\/\*\*/u.test(normalizePath(pattern))) {
			errors.push(`Desktop package pattern can include Web or unbounded content: ${pattern}`)
		}
	}
	return errors
}

export function validateDesktopPackageEntries(entries) {
	const forbidden = entries
		.map(normalizePath)
		.filter(
			(path) =>
				path.startsWith('dist/web/') ||
				path.startsWith('apps/web/') ||
				path.startsWith('node_modules/')
		)
	return forbidden.map((path) => `Desktop package includes forbidden entry ${path}`)
}

function collectFiles(root, directory) {
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...collectFiles(root, path))
		else if (entry.isFile()) files.push(normalizePath(relative(root, path)))
	}
	return files
}

export function auditPackageContent({
	repositoryRoot = resolve('.'),
	requireBuild = false,
	report = console.log
} = {}) {
	const packageDocument = JSON.parse(
		readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
	)
	const errors = validateDesktopPackageConfiguration(packageDocument)
	const desktopRoot = resolve(repositoryRoot, 'dist/desktop')
	if (requireBuild && !existsSync(desktopRoot)) {
		errors.push('Desktop production output is required but missing')
	} else if (existsSync(desktopRoot)) {
		const entries = collectFiles(repositoryRoot, desktopRoot)
		errors.push(...validateDesktopPackageEntries(entries))
		for (const required of [
			'dist/desktop/main/index.js',
			'dist/desktop/preload/index.cjs',
			'dist/desktop/renderer/index.html'
		]) {
			if (!entries.includes(required)) errors.push(`Desktop output is missing ${required}`)
		}
	}
	if (errors.length > 0) {
		throw new Error(`Desktop package content policy failed:\n- ${errors.join('\n- ')}`)
	}
	const message = `PASS Desktop package content policy${requireBuild ? ' with production output' : ''}.`
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Desktop package content policy')
	auditPackageContent({ requireBuild: process.argv.includes('--require-build') })
}
