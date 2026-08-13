import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { posix, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const sourceExtensions = Object.freeze(['.ts', '.tsx', '.d.ts'])
const importPatterns = Object.freeze([
	/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
	/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu
])
const requiredPaths = Object.freeze([
	'apps/desktop/host/native-host-contract.ts',
	'apps/desktop/host/runtime-channels.ts',
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
const allowedPackageDependencies = Object.freeze({
	application: Object.freeze([
		'contracts',
		'design-system',
		'engine-client',
		'localization',
		'music-theory',
		'project-core'
	]),
	contracts: Object.freeze([]),
	'design-system': Object.freeze([]),
	'engine-client': Object.freeze(['contracts']),
	localization: Object.freeze([]),
	'music-theory': Object.freeze([]),
	'project-core': Object.freeze(['contracts']),
	'project-format': Object.freeze(['project-core'])
})
const allowedRustCrateDependencies = Object.freeze({
	core: Object.freeze(['dsp']),
	drums: Object.freeze(['core', 'dsp']),
	dsp: Object.freeze([]),
	'native-host': Object.freeze(['core', 'drums', 'dsp', 'protocol', 'realtime', 'synth']),
	'offline-render': Object.freeze(['core', 'drums', 'dsp', 'protocol', 'synth']),
	protocol: Object.freeze(['core']),
	realtime: Object.freeze(['core', 'drums', 'dsp', 'protocol', 'synth']),
	synth: Object.freeze(['core', 'dsp']),
	'web-worklet': Object.freeze(['core', 'drums', 'dsp', 'protocol', 'realtime', 'synth'])
})
const generatedPathPattern =
	/(?:^|\/)(?:\.git|\.test-out|artifacts|dist|node_modules)(?:\/|$)|^engine\/target(?:\/|$)/u
const rustSiblingPathPattern = /\bpath\s*=\s*["']\.\.\/([a-z0-9-]+)["']/gu

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

function packageDependencyViolation(ownerPath, targetPath) {
	const ownerPackage = packageName(ownerPath)
	const targetPackage = packageName(targetPath)
	if (ownerPackage === null || targetPackage === null || ownerPackage === targetPackage)
		return null
	const allowed = allowedPackageDependencies[ownerPackage]
	if (allowed === undefined) return null
	if (!Object.hasOwn(allowedPackageDependencies, targetPackage)) {
		return `shared package ${ownerPackage} imports unknown package ${targetPackage}`
	}
	return allowed.includes(targetPackage)
		? null
		: `shared package ${ownerPackage} may not depend on ${targetPackage}`
}

export function validateTargetBoundaries(files) {
	const normalizedFiles = files.map((file) => ({
		path: normalizePath(file.path),
		source: file.source
	}))
	const knownPaths = new Set(normalizedFiles.map((file) => file.path))
	const errors = []
	for (const owner of new Set(normalizedFiles.map((file) => packageName(file.path)))) {
		if (owner !== null && !Object.hasOwn(allowedPackageDependencies, owner)) {
			errors.push(`packages/${owner}: unknown shared package`)
		}
	}
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
				const dependencyViolation = packageDependencyViolation(file.path, targetPath)
				if (dependencyViolation !== null) {
					errors.push(`${file.path}: ${dependencyViolation} (${specifier})`)
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

export function validateRustCrateDependencies(files) {
	const errors = []
	for (const file of files) {
		const ownerMatch = /^engine\/crates\/([^/]+)\/Cargo\.toml$/u.exec(normalizePath(file.path))
		if (ownerMatch === null) continue
		const owner = ownerMatch[1]
		const allowed = allowedRustCrateDependencies[owner]
		if (allowed === undefined) {
			errors.push(`${file.path}: unknown Rust workspace crate ${owner}`)
			continue
		}
		for (const match of file.source.matchAll(rustSiblingPathPattern)) {
			const dependency = match[1]
			if (!Object.hasOwn(allowedRustCrateDependencies, dependency)) {
				errors.push(
					`${file.path}: Rust crate ${owner} depends on unknown crate ${dependency}`
				)
			} else if (!allowed.includes(dependency)) {
				errors.push(`${file.path}: Rust crate ${owner} may not depend on ${dependency}`)
			}
		}
	}
	return errors.sort()
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

export function selectPolicyPaths(paths) {
	return [
		...new Set(
			paths
				.map(normalizePath)
				.filter((path) => /^(?:apps|engine|packages)\//u.test(path))
				.filter((path) => !generatedPathPattern.test(path))
		)
	].sort()
}

export function selectWorktreePolicyPaths(paths, pathExists) {
	return selectPolicyPaths(paths).filter(pathExists)
}

function repositoryPolicyPaths(repositoryRoot) {
	const result = spawnSync(
		'git',
		[
			'ls-files',
			'--cached',
			'--others',
			'--exclude-standard',
			'-z',
			'--',
			'apps',
			'packages',
			'engine'
		],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			maxBuffer: 2 * 1024 * 1024,
			shell: false,
			timeout: 10_000,
			windowsHide: true
		}
	)
	if (result.error !== undefined) {
		throw new Error(`Could not enumerate repository policy inputs: ${result.error.message}`, {
			cause: result.error
		})
	}
	if (result.status !== 0) {
		throw new Error(
			`Could not enumerate repository policy inputs: ${result.stderr.trim() || `git exited ${String(result.status)}`}`
		)
	}
	return selectWorktreePolicyPaths(result.stdout.split('\0').filter(Boolean), (path) =>
		existsSync(resolve(repositoryRoot, path))
	)
}

async function readRepositoryFiles(repositoryRoot, paths) {
	return Promise.all(
		paths.map(async (path) => ({
			path,
			source: await readFile(resolve(repositoryRoot, path), 'utf8')
		}))
	)
}

export async function auditTargetBoundaries(
	repositoryRoot = resolve('.'),
	listPaths = repositoryPolicyPaths
) {
	const paths = listPaths(repositoryRoot)
	const sourceFiles = await readRepositoryFiles(
		repositoryRoot,
		paths.filter((path) => /^(?:apps|packages)\/.*\.(?:ts|tsx)$/u.test(path))
	)
	const rustFiles = await readRepositoryFiles(
		repositoryRoot,
		paths.filter((path) => /^engine\/.*\.(?:rs|toml)$/u.test(path))
	)
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
		...validateRustCrateDependencies(rustFiles),
		...validateRepositoryLayout(paths, configurationSource)
	]
	if (errors.length > 0) {
		throw new Error(`Target boundary policy failed:\n- ${errors.join('\n- ')}`)
	}
	const message =
		'PASS target boundaries: owned shared, Desktop, Web and Rust crate graphs are isolated.'
	console.log(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Target boundary policy')
	await auditTargetBoundaries()
}
