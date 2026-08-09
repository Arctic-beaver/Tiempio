import { readdir, readFile } from 'node:fs/promises'
import { posix, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const sourceExtensions = Object.freeze(['.ts', '.tsx', '.d.ts'])
const importPatterns = Object.freeze([
	/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
	/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu
])
const requiredPaths = Object.freeze([
	'apps/desktop/main/index.ts',
	'apps/desktop/preload/index.ts',
	'apps/desktop/renderer/main.tsx',
	'apps/desktop/renderer/runtime/desktopRuntime.ts',
	'apps/web/bootstrap/main.tsx',
	'apps/web/runtime/webRuntime.ts',
	'packages/application/src/mount-application.ts',
	'packages/contracts/src/application-runtime.ts',
	'packages/contracts/src/engine-protocol.ts',
	'packages/project-core/src/index.ts',
	'packages/project-format/src/index.ts',
	'packages/engine-client/src/index.ts',
	'packages/music-theory/src/index.ts',
	'packages/design-system/src/index.ts',
	'packages/localization/src/index.ts',
	'engine/Cargo.toml',
	'engine/crates/protocol/Cargo.toml',
	'engine/crates/native-host/Cargo.toml',
	'engine/crates/web-worklet/Cargo.toml'
])

function normalizePath(path) {
	return path.split(sep).join('/').replace(/^\.\//u, '')
}

function sourceArea(path) {
	if (path.startsWith('packages/')) return 'shared'
	if (path.startsWith('apps/web/')) return 'web'
	if (path.startsWith('apps/desktop/renderer/')) return 'desktop-renderer'
	if (path.startsWith('apps/desktop/main/') || path.startsWith('apps/desktop/preload/')) {
		return 'desktop-host'
	}
	return 'other'
}

function packageName(path) {
	const match = /^packages\/([^/]+)\//u.exec(path)
	return match?.[1] ?? null
}

function importedSpecifiers(source) {
	return [
		...new Set(
			importPatterns.flatMap((pattern) =>
				[...source.matchAll(pattern)].map((match) => match[1])
			)
		)
	]
}

function resolveSourcePath(ownerPath, specifier, knownPaths) {
	if (!specifier.startsWith('.')) return null
	const base = posix.normalize(posix.join(posix.dirname(ownerPath), specifier))
	const stem = base.replace(/\.(?:c|m)?jsx?$/u, '')
	const candidates = [
		base,
		...sourceExtensions.map((extension) => `${stem}${extension}`),
		...sourceExtensions.map((extension) => `${stem}/index${extension}`)
	]
	return candidates.find((candidate) => knownPaths.has(candidate)) ?? stem
}

function platformViolation(area, targetArea, specifier, testFile) {
	const importsNode = specifier.startsWith('node:')
	const importsElectron = specifier === 'electron' || specifier.startsWith('electron/')
	if (!testFile && ['shared', 'web', 'desktop-renderer'].includes(area)) {
		if (importsNode || importsElectron) return `${area} imports platform module ${specifier}`
	}
	if (area === 'shared' && ['desktop-host', 'desktop-renderer', 'web'].includes(targetArea)) {
		return `shared code imports ${targetArea}`
	}
	if (area === 'web' && ['desktop-host', 'desktop-renderer'].includes(targetArea)) {
		return `Web imports ${targetArea}`
	}
	if (area === 'desktop-renderer' && ['desktop-host', 'web'].includes(targetArea)) {
		return `Desktop renderer imports ${targetArea}`
	}
	if (area === 'desktop-host' && ['desktop-renderer', 'web'].includes(targetArea)) {
		return `Desktop host imports ${targetArea}`
	}
	return null
}

function publicPackageViolation(ownerPath, targetPath) {
	const ownerPackage = packageName(ownerPath)
	const targetPackage = packageName(targetPath)
	if (ownerPackage === null || targetPackage === null || ownerPackage === targetPackage)
		return null
	if (targetPath === `packages/${targetPackage}/src/index.ts`) return null
	return `cross-package import bypasses packages/${targetPackage}/src/index.ts`
}

export function validateTargetBoundaries(files) {
	const normalizedFiles = files.map((file) => ({
		path: normalizePath(file.path),
		source: file.source
	}))
	const knownPaths = new Set(normalizedFiles.map((file) => file.path))
	const errors = []
	for (const file of normalizedFiles) {
		const area = sourceArea(file.path)
		for (const specifier of importedSpecifiers(file.source)) {
			const targetPath = resolveSourcePath(file.path, specifier, knownPaths)
			const targetArea = targetPath === null ? null : sourceArea(targetPath)
			const violation = platformViolation(
				area,
				targetArea,
				specifier,
				file.path.includes('.test.')
			)
			if (violation !== null) errors.push(`${file.path}: ${violation} (${specifier})`)
			if (targetPath !== null) {
				const publicViolation = publicPackageViolation(file.path, targetPath)
				if (publicViolation !== null) {
					errors.push(`${file.path}: ${publicViolation} (${specifier})`)
				}
			}
		}
	}
	return errors.sort()
}

export function validateNeutralContracts(files) {
	const forbiddenTokens = [
		'electron',
		'node:child_process',
		'node:fs',
		'node:path',
		'ChildProcess',
		'FileSystemHandle',
		'FileSystemFileHandle',
		'ipcRenderer',
		'nativePath'
	]
	const errors = []
	for (const file of files.filter((entry) => entry.path.startsWith('packages/contracts/src/'))) {
		if (file.path.includes('.test.')) continue
		for (const token of forbiddenTokens) {
			if (file.source.includes(token))
				errors.push(`${file.path}: neutral contract contains ${token}`)
		}
	}
	return errors.sort()
}

export function validateRendererBridgeAccess(files) {
	const readers = files
		.filter(
			(file) => !file.path.endsWith('.d.ts') && file.source.includes('window.tiempioRuntime')
		)
		.map((file) => normalizePath(file.path))
	return readers.length === 1 && readers[0] === 'apps/desktop/renderer/runtime/desktopRuntime.ts'
		? []
		: [
				`Desktop bridge must be read only by its runtime adapter; observed: ${readers.join(', ')}`
			]
}

export function validateRustBoundaries(files) {
	const forbidden =
		/(?:^|[\s"'])(?:\.\.\/)+(?:apps|packages)\/|\b(?:electron|react|node_modules)\b/iu
	return files
		.filter((file) => file.path.startsWith('engine/'))
		.flatMap((file) =>
			forbidden.test(file.source)
				? [`${file.path}: engine references application/UI code`]
				: []
		)
		.sort()
}

export function validateRepositoryLayout(paths, configurationSource) {
	const normalized = new Set(paths.map(normalizePath))
	const errors = requiredPaths.flatMap((path) =>
		normalized.has(path) ? [] : [`required repository path is missing: ${path}`]
	)
	for (const token of [
		'apps/desktop/main/index.ts',
		'apps/desktop/preload/index.ts',
		'apps/desktop/renderer/index.html',
		'apps/web/bootstrap/index.html',
		'dist/desktop',
		'dist/web'
	]) {
		if (!configurationSource.includes(token)) {
			errors.push(`repository configuration does not reference ${token}`)
		}
	}
	return errors.sort()
}

async function collectFiles(root, directory, predicate) {
	let entries
	try {
		entries = await readdir(directory, { withFileTypes: true })
	} catch (error) {
		if (error?.code === 'ENOENT') return []
		throw error
	}
	const files = []
	for (const entry of entries) {
		const absolutePath = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...(await collectFiles(root, absolutePath, predicate)))
		else if (entry.isFile() && predicate(entry.name)) {
			files.push({
				path: normalizePath(relative(root, absolutePath)),
				source: await readFile(absolutePath, 'utf8')
			})
		}
	}
	return files
}

async function collectPaths(root, directory) {
	return (await collectFiles(root, directory, () => true)).map((file) => file.path)
}

export async function auditTargetBoundaries(repositoryRoot = resolve('.')) {
	const sourceFiles = (
		await Promise.all(
			['apps', 'packages'].map((directory) =>
				collectFiles(repositoryRoot, resolve(repositoryRoot, directory), (name) =>
					/\.(?:ts|tsx)$/u.test(name)
				)
			)
		)
	).flat()
	const rustFiles = await collectFiles(
		repositoryRoot,
		resolve(repositoryRoot, 'engine'),
		(name) => /\.(?:rs|toml)$/u.test(name)
	)
	const paths = (
		await Promise.all(
			['apps', 'packages', 'engine'].map((directory) =>
				collectPaths(repositoryRoot, resolve(repositoryRoot, directory))
			)
		)
	).flat()
	const configurationSource = (
		await Promise.all(
			[
				'electron.vite.config.ts',
				'vite.web.config.ts',
				'package.json',
				'tsconfig.node.json',
				'tsconfig.web.json'
			].map((path) => readFile(resolve(repositoryRoot, path), 'utf8'))
		)
	).join('\n')
	const errors = [
		...validateTargetBoundaries(sourceFiles),
		...validateNeutralContracts(sourceFiles),
		...validateRendererBridgeAccess(sourceFiles),
		...validateRustBoundaries(rustFiles),
		...validateRepositoryLayout(paths, configurationSource)
	]
	if (errors.length > 0) {
		throw new Error(`Target boundary policy failed:\n- ${errors.join('\n- ')}`)
	}
	const message = 'PASS target boundaries: shared, Desktop, Web and engine graphs are isolated.'
	console.log(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Target boundary policy')
	await auditTargetBoundaries()
}
