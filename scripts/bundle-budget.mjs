import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const acceptedStage6BundleBudgets = Object.freeze({
	desktopRenderer: 622_592,
	webInitialJavaScript: 425_984,
	webShellOutput: 585_728
})

export const stage7FeatureGrowthBudgets = Object.freeze({
	desktopRenderer: 32 * 1_024,
	webInitialJavaScript: 24 * 1_024,
	webShellOutput: 20 * 1_024
})

export const stage9FeatureGrowthBudgets = Object.freeze({
	desktopPreload: 1 * 1_024,
	desktopRenderer: 36 * 1_024,
	webDeferredApplication: 16 * 1_024,
	webInitialJavaScript: 20 * 1_024,
	webShellOutput: 44 * 1_024
})

export const emptyShellBundleBudgets = Object.freeze({
	'desktop-main': Object.freeze({ root: 'dist/desktop/main', maxBytes: 229_376 }),
	'desktop-preload': Object.freeze({
		root: 'dist/desktop/preload',
		maxBytes: 61_440 + stage9FeatureGrowthBudgets.desktopPreload
	}),
	'desktop-renderer': Object.freeze({
		root: 'dist/desktop/renderer',
		maxBytes:
			acceptedStage6BundleBudgets.desktopRenderer +
			stage7FeatureGrowthBudgets.desktopRenderer +
			stage9FeatureGrowthBudgets.desktopRenderer
	}),
	web: Object.freeze({
		root: 'dist/web',
		maxBytes:
			acceptedStage6BundleBudgets.webShellOutput +
			stage7FeatureGrowthBudgets.webShellOutput +
			stage9FeatureGrowthBudgets.webShellOutput
	})
})

export const webArtifactBudgets = Object.freeze({
	initialJavaScript:
		acceptedStage6BundleBudgets.webInitialJavaScript +
		stage7FeatureGrowthBudgets.webInitialJavaScript +
		stage9FeatureGrowthBudgets.webInitialJavaScript,
	deferredApplication: 81_920 + stage9FeatureGrowthBudgets.webDeferredApplication,
	webRuntimeJavaScript: 196_608,
	workletJavaScript: 65_536,
	wasmRelease: 786_432
})

const webRuntimeRootModules = Object.freeze([
	'apps/web/bootstrap/mountRuntimeApplication.ts',
	'apps/web/runtime/audio/WebEngineRuntime.ts',
	'apps/web/runtime/audio/webAudioWorkletAdapter.ts',
	'apps/web/runtime/persistence/WebProjectsRuntime.ts'
])

export function evaluateBundleClass(bundleClass, files) {
	const budget = emptyShellBundleBudgets[bundleClass]
	if (budget === undefined) throw new Error(`Unknown bundle class ${String(bundleClass)}.`)
	const bytes = files.reduce((total, file) => total + file.bytes, 0)
	return Object.freeze({
		bundleClass,
		bytes,
		maxBytes: budget.maxBytes,
		remainingBytes: budget.maxBytes - bytes,
		passed: bytes <= budget.maxBytes,
		files: Object.freeze([...files])
	})
}

function collectFileSizes(root, directory) {
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...collectFileSizes(root, path))
		else if (entry.isFile() && !entry.name.endsWith('.map')) {
			files.push({
				path: relative(root, path).replaceAll('\\', '/'),
				bytes: statSync(path).size
			})
		}
	}
	return files.sort((left, right) => right.bytes - left.bytes)
}

function initialChunkFiles(chunks) {
	const entries = chunks.filter((chunk) => chunk.isEntry === true)
	if (entries.length !== 1)
		throw new Error('Web attribution must contain exactly one entry chunk.')
	const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]))
	const files = new Set()
	const pending = [entries[0].file]
	while (pending.length > 0) {
		const file = pending.pop()
		if (file === undefined || files.has(file)) continue
		files.add(file)
		const chunk = byFile.get(file)
		if (chunk === undefined)
			throw new Error(`Web attribution references missing chunk ${file}.`)
		for (const imported of chunk.imports) pending.push(imported)
	}
	return files
}

function webRuntimeChunkFiles(chunks, initialFiles) {
	const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]))
	const roots = new Set()
	for (const rootModule of webRuntimeRootModules) {
		const owners = chunks.filter((chunk) =>
			chunk.modules.some((module) => module.module === rootModule)
		)
		if (owners.length !== 1) {
			throw new Error(`Web runtime module ${rootModule} must have exactly one chunk owner.`)
		}
		roots.add(owners[0].file)
	}
	const files = new Set()
	const pending = [...roots]
	while (pending.length > 0) {
		const file = pending.pop()
		if (file === undefined || files.has(file) || initialFiles.has(file)) continue
		files.add(file)
		const chunk = byFile.get(file)
		if (chunk === undefined) throw new Error(`Web runtime references missing chunk ${file}.`)
		for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
			if (!initialFiles.has(dependency)) pending.push(dependency)
		}
	}
	return files
}

function measuredClass(name, bytes, maxBytes, files = []) {
	return Object.freeze({
		name,
		bytes,
		maxBytes,
		remainingBytes: maxBytes - bytes,
		passed: bytes <= maxBytes,
		files: Object.freeze([...files])
	})
}

export function evaluateWebArtifacts({ attribution, files, wasmBytes }) {
	if (attribution.schemaVersion !== 2 || attribution.bundleClass !== 'web') {
		throw new Error('Web artifact budgets require current Web module attribution.')
	}
	const chunks = attribution.chunks
	const initialFiles = initialChunkFiles(chunks)
	const runtimeFiles = webRuntimeChunkFiles(chunks, initialFiles)
	const initialChunks = chunks.filter((chunk) => initialFiles.has(chunk.file))
	const runtimeChunks = chunks.filter((chunk) => runtimeFiles.has(chunk.file))
	const deferredApplicationChunks = chunks.filter(
		(chunk) => !initialFiles.has(chunk.file) && !runtimeFiles.has(chunk.file)
	)
	const workletFiles = files.filter((file) =>
		/^assets\/web-worklet-[\w-]{8}\.js$/u.test(file.path)
	)
	if (workletFiles.length !== 1) {
		throw new Error(
			`Web build must emit exactly one content-hashed worklet; observed ${String(workletFiles.length)}.`
		)
	}
	const [worklet] = workletFiles
	const encodedWasmBytes = Math.ceil(wasmBytes / 3) * 4
	const workletOverhead = worklet.bytes - encodedWasmBytes
	if (workletOverhead < 0)
		throw new Error('The packaged worklet is smaller than its encoded WASM payload.')
	const runtimeOutputFiles = new Set(runtimeChunks.map((chunk) => chunk.file))
	const shellFiles = files.filter(
		(file) => file.path !== worklet.path && !runtimeOutputFiles.has(file.path)
	)
	const classes = Object.freeze([
		measuredClass(
			'initialJavaScript',
			initialChunks.reduce((total, chunk) => total + chunk.bytes, 0),
			webArtifactBudgets.initialJavaScript,
			initialChunks.map((chunk) => chunk.file)
		),
		measuredClass(
			'deferredApplication',
			deferredApplicationChunks.reduce((total, chunk) => total + chunk.bytes, 0),
			webArtifactBudgets.deferredApplication,
			deferredApplicationChunks.map((chunk) => chunk.file)
		),
		measuredClass(
			'webRuntimeJavaScript',
			runtimeChunks.reduce((total, chunk) => total + chunk.bytes, 0),
			webArtifactBudgets.webRuntimeJavaScript,
			runtimeChunks.map((chunk) => chunk.file)
		),
		measuredClass('workletJavaScript', workletOverhead, webArtifactBudgets.workletJavaScript, [
			worklet.path
		]),
		measuredClass('wasmRelease', wasmBytes, webArtifactBudgets.wasmRelease),
		measuredClass(
			'shellOutput',
			shellFiles.reduce((total, file) => total + file.bytes, 0),
			emptyShellBundleBudgets.web.maxBytes,
			shellFiles.map((file) => file.path)
		)
	])
	return Object.freeze({
		bundleClass: 'web',
		passed: classes.every((result) => result.passed),
		classes
	})
}

function classesForTarget(target) {
	if (target === 'desktop') {
		return ['desktop-main', 'desktop-preload', 'desktop-renderer']
	}
	if (target === 'web') return ['web']
	if (target === 'all') return Object.keys(emptyShellBundleBudgets)
	throw new Error(`Bundle target must be desktop, web or all; received ${target}.`)
}

export function auditBundleBudgets({
	repositoryRoot = resolve('.'),
	target = 'all',
	report = console.log
} = {}) {
	const results = []
	for (const bundleClass of classesForTarget(target)) {
		const budget = emptyShellBundleBudgets[bundleClass]
		const root = resolve(repositoryRoot, budget.root)
		if (!existsSync(root))
			throw new Error(`${bundleClass} output is missing at ${budget.root}.`)
		const files = collectFileSizes(root, root)
		if (bundleClass !== 'web') {
			results.push(evaluateBundleClass(bundleClass, files))
			continue
		}
		const attributionPath = resolve(
			repositoryRoot,
			'artifacts/stage-1/bundle/web-module-attribution.json'
		)
		const wasmPath = resolve(
			repositoryRoot,
			'engine/target/wasm32-unknown-unknown/release/tiempio_engine_web_worklet.wasm'
		)
		if (!existsSync(attributionPath) || !existsSync(wasmPath)) {
			throw new Error('Web attribution or release WASM is missing.')
		}
		results.push(
			evaluateWebArtifacts({
				attribution: JSON.parse(readFileSync(attributionPath, 'utf8')),
				files,
				wasmBytes: statSync(wasmPath).size
			})
		)
	}
	const failures = results.filter((result) => !result.passed)
	if (failures.length > 0) {
		throw new Error(
			`Bundle budget failed:\n- ${failures
				.flatMap((result) =>
					'classes' in result
						? result.classes
								.filter((item) => !item.passed)
								.map(
									(item) =>
										`${result.bundleClass}/${item.name}: ${String(item.bytes)} > ${String(item.maxBytes)} bytes`
								)
						: [
								`${result.bundleClass}: ${String(result.bytes)} > ${String(result.maxBytes)} bytes`
							]
				)
				.join('\n- ')}`
		)
	}
	const outputPath = resolve(repositoryRoot, 'artifacts/stage-1/bundle/budget-report.json')
	mkdirSync(resolve(outputPath, '..'), { recursive: true })
	writeFileSync(
		outputPath,
		`${JSON.stringify({ schemaVersion: 1, target, results }, null, 2)}\n`,
		'utf8'
	)
	const message = `PASS bundle budgets for ${target}: ${results
		.flatMap((result) =>
			'classes' in result
				? result.classes.map(
						(item) =>
							`${result.bundleClass}/${item.name}=${String(item.bytes)}/${String(item.maxBytes)}`
					)
				: [`${result.bundleClass}=${String(result.bytes)}/${String(result.maxBytes)}`]
		)
		.join(', ')}.`
	report(message)
	return Object.freeze(results)
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Empty-shell bundle budget policy')
	auditBundleBudgets({ target: process.argv[2] ?? 'all' })
}
