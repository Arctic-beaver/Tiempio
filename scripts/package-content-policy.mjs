import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'
import {
	nativeHostExecutableName,
	nativeHostTarget,
	validateNativeExecutable,
	validateNativeHostManifest
} from './native-host-integrity.mjs'

const expectedDesktopFiles = Object.freeze([
	'dist/desktop/**/*',
	'resources/branding/tiempio-512.png',
	'package.json'
])
const expectedExtraResources = Object.freeze([
	Object.freeze({
		from: 'build/native/${platform}-${arch}',
		to: 'native/${platform}-${arch}',
		filter: Object.freeze([
			'tiempio-engine-native-host',
			'tiempio-engine-native-host.exe',
			'manifest.json'
		])
	})
])
const expectedElectronFuses = Object.freeze({
	runAsNode: false,
	enableCookieEncryption: true,
	enableNodeOptionsEnvironmentVariable: false,
	enableNodeCliInspectArguments: false,
	enableEmbeddedAsarIntegrityValidation: true,
	onlyLoadAppFromAsar: true
})
const expectedPlatformIcons = Object.freeze({
	win: 'resources/branding/tiempio.ico',
	mac: 'resources/branding/tiempio.icns',
	linux: 'resources/branding/linux'
})

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
	if (
		JSON.stringify(packageDocument.build?.extraResources) !==
		JSON.stringify(expectedExtraResources)
	) {
		errors.push(
			'Desktop extraResources must contain only the architecture-specific native host'
		)
	}
	if (
		JSON.stringify(packageDocument.build?.electronFuses) !==
		JSON.stringify(expectedElectronFuses)
	) {
		errors.push('Desktop Electron fuses do not match the production security profile')
	}
	for (const [platform, icon] of Object.entries(expectedPlatformIcons)) {
		if (packageDocument.build?.[platform]?.icon !== icon) {
			errors.push(`Desktop ${platform} icon must be ${icon}`)
		}
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

function nativeHostDirectoryErrors(directory, platform, architecture, label) {
	const target = nativeHostTarget(platform, architecture)
	const fileName = nativeHostExecutableName(platform)
	const errors = []
	if (!existsSync(directory)) return [`${label} native host directory is missing`]
	const entries = collectFiles(directory, directory).sort()
	const expectedEntries = [`${target}/${fileName}`, `${target}/manifest.json`].sort()
	if (
		entries.length !== expectedEntries.length ||
		entries.some((entry, index) => entry !== expectedEntries[index])
	) {
		errors.push(`${label} native host entries are not the exact target pair`)
		return errors
	}
	const targetRoot = resolve(directory, target)
	const executable = readFileSync(resolve(targetRoot, fileName))
	let manifest
	try {
		manifest = JSON.parse(readFileSync(resolve(targetRoot, 'manifest.json'), 'utf8'))
	} catch {
		return [`${label} native host manifest is unreadable`]
	}
	errors.push(
		...validateNativeExecutable(executable, platform, architecture).map(
			(error) => `${label}: ${error}`
		)
	)
	errors.push(
		...validateNativeHostManifest(manifest, executable, platform, architecture).map(
			(error) => `${label}: ${error}`
		)
	)
	return errors
}

function packagedResourcesRoots(directory) {
	if (!existsSync(directory)) return []
	const roots = []
	const pending = [directory]
	while (pending.length > 0) {
		const current = pending.pop()
		if (current === undefined) continue
		const entries = readdirSync(current, { withFileTypes: true })
		if (entries.some((entry) => entry.isFile() && entry.name === 'app.asar'))
			roots.push(current)
		for (const entry of entries) {
			if (entry.isDirectory()) pending.push(resolve(current, entry.name))
		}
	}
	return roots
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
	requirePackage = false,
	report = console.log
} = {}) {
	const packageDocument = JSON.parse(
		readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
	)
	const errors = validateDesktopPackageConfiguration(packageDocument)
	for (const icon of Object.values(expectedPlatformIcons)) {
		if (!existsSync(resolve(repositoryRoot, icon))) {
			errors.push(`Desktop application icon is missing at ${icon}`)
		}
	}
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
	if (requirePackage) {
		errors.push(
			...nativeHostDirectoryErrors(
				resolve(repositoryRoot, 'build/native'),
				process.platform,
				process.arch,
				'staged'
			)
		)
		const resourcesRoots = packagedResourcesRoots(resolve(repositoryRoot, 'artifacts/packages'))
		if (resourcesRoots.length !== 1) {
			errors.push(
				`Desktop package must contain exactly one resources/app.asar; observed ${String(resourcesRoots.length)}`
			)
		} else {
			errors.push(
				...nativeHostDirectoryErrors(
					resolve(resourcesRoots[0], 'native'),
					process.platform,
					process.arch,
					'packaged'
				)
			)
		}
	}
	if (errors.length > 0) {
		throw new Error(`Desktop package content policy failed:\n- ${errors.join('\n- ')}`)
	}
	const message = `PASS Desktop package content policy${requireBuild ? ' with production output' : ''}${requirePackage ? ' and verified native resources' : ''}.`
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Desktop package content policy')
	auditPackageContent({
		requireBuild: process.argv.includes('--require-build'),
		requirePackage: process.argv.includes('--require-package')
	})
}
