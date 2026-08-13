import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

export const lazySurfaceGroups = Object.freeze({
	workflow: Object.freeze([
		'packages/application/src/app/surfaces/WorkflowSurface.tsx',
		'packages/application/src/features/first-layer/FirstLayerView.tsx',
		'packages/application/src/features/first-layer/useFirstLayerActions.ts',
		'packages/application/src/features/sound-chooser/SoundChooserView.tsx',
		'packages/application/src/features/sound-chooser/useSoundChooserActions.ts'
	]),
	editors: Object.freeze([
		'packages/application/src/app/surfaces/EditorSurface.tsx',
		'packages/application/src/features/piano-roll/PianoRollView.tsx',
		'packages/application/src/features/piano-roll/usePianoRollActions.ts',
		'packages/application/src/features/drums/DrumsView.tsx',
		'packages/application/src/features/drums/useDrumsActions.ts',
		'packages/application/src/features/arrangement/ArrangementView.tsx',
		'packages/application/src/features/arrangement/useArrangementActions.ts',
		'packages/application/src/features/sound-sculpt/SoundSculptView.tsx',
		'packages/application/src/features/sound-sculpt/useSoundSculptActions.ts'
	])
})

const eagerHomeModules = Object.freeze([
	'packages/application/src/features/home/HomeView.tsx',
	'packages/application/src/features/home/useHomeActions.ts'
])
const futureRuntimeTokens = Object.freeze([
	'/runtime/audio/',
	'audioworklet',
	'web-worklet',
	'.wasm'
])
const webForbiddenRuntimeTokens = Object.freeze([
	'packages/engine-client/',
	'applicationruntimecontroller.ts',
	'/audio/webengineruntime.ts',
	'webaudioworkletadapter.ts',
	'webengineworkletprocessor.ts',
	'webprojectsruntime.ts',
	'webindexeddbruntime.ts',
	'physical-archive.ts',
	'web-worklet',
	'.wasm'
])
const webDeferredRuntimeModules = Object.freeze([
	'apps/web/bootstrap/mountRuntimeApplication.ts',
	'packages/application/src/runtime/ApplicationRuntimeController.ts',
	'packages/engine-client/src/EngineClient.ts',
	'apps/web/runtime/audio/WebEngineRuntime.ts',
	'apps/web/runtime/audio/webAudioWorkletAdapter.ts',
	'apps/web/runtime/persistence/WebProjectsRuntime.ts',
	'apps/web/runtime/persistence/WebIndexedDbRuntime.ts',
	'packages/project-format/src/physical-archive.ts'
])

function normalizedModuleId(module) {
	return module.replaceAll('\\', '/').toLowerCase()
}

function singletonModuleKey(module) {
	const normalized = normalizedModuleId(module).replace(/\?.*$/u, '')
	const nodeModulesIndex = normalized.lastIndexOf('node_modules/')
	if (nodeModulesIndex >= 0) {
		const dependencyPath = normalized.slice(nodeModulesIndex + 'node_modules/'.length)
		if (
			/^(?:i18next|react|react-dom|react-i18next|scheduler|use-sync-external-store)\//u.test(
				dependencyPath
			)
		) {
			return `framework:${dependencyPath}`
		}
	}
	const packageMatch = /packages\/(contracts|localization|project-core)\/(.+)$/u.exec(normalized)
	if (packageMatch === null) return null
	const [, packageName, packagePath] = packageMatch
	if (
		packageName === 'contracts' &&
		!/(?:^|\/)(?:engine-|generated\/engine-protocol)/u.test(packagePath)
	) {
		return null
	}
	return `${packageName}:${packagePath}`
}

function initialChunkFiles(chunks, errors) {
	const entries = chunks.filter((chunk) => chunk.isEntry === true)
	if (entries.length !== 1) {
		errors.push(`expected exactly one entry chunk; observed ${String(entries.length)}`)
	}
	const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]))
	const initial = new Set()
	const pending = entries.map((chunk) => chunk.file)
	while (pending.length > 0) {
		const file = pending.pop()
		if (file === undefined || initial.has(file)) continue
		initial.add(file)
		const chunk = byFile.get(file)
		if (chunk === undefined) {
			errors.push(`initial graph references missing chunk ${file}`)
			continue
		}
		for (const imported of chunk.imports) pending.push(imported)
	}
	return initial
}

export function validateChunkTopology(report) {
	const errors = []
	if (report.schemaVersion !== 2) errors.push('bundle attribution schema must be version 2')
	if (!Array.isArray(report.chunks)) return { errors: ['bundle attribution chunks are missing'] }
	const chunks = report.chunks
	const initialFiles = initialChunkFiles(chunks, errors)
	const initialChunks = chunks.filter((chunk) => initialFiles.has(chunk.file))
	const initialModules = new Set(
		initialChunks.flatMap((chunk) => chunk.modules.map((module) => module.module))
	)
	for (const module of eagerHomeModules) {
		if (!initialModules.has(module)) errors.push(`Home shell module is not eager: ${module}`)
	}

	const featureChunkFiles = new Set()
	for (const [surface, modules] of Object.entries(lazySurfaceGroups)) {
		const surfaceModule = modules[0]
		const owners = chunks.filter((chunk) =>
			chunk.modules.some((module) => module.module === surfaceModule)
		)
		if (owners.length !== 1) {
			errors.push(`${surface} must have exactly one lazy surface chunk`)
			continue
		}
		const [owner] = owners
		featureChunkFiles.add(owner.file)
		if (initialFiles.has(owner.file)) errors.push(`${surface} is part of the initial graph`)
		if (owner.isDynamicEntry !== true) errors.push(`${surface} is not a dynamic entry`)
		const ownerModules = new Set(owner.modules.map((module) => module.module))
		for (const module of modules) {
			if (!ownerModules.has(module)) {
				errors.push(`${surface} lazy chunk does not own ${module}`)
			}
		}
	}
	if (featureChunkFiles.size !== Object.keys(lazySurfaceGroups).length) {
		errors.push('lazy surface groups must use distinct chunks')
	}

	for (const module of initialModules) {
		const normalized = normalizedModuleId(module)
		const forbiddenTokens =
			report.bundleClass === 'web' ? webForbiddenRuntimeTokens : futureRuntimeTokens
		for (const token of forbiddenTokens) {
			if (normalized.includes(token)) {
				errors.push(`initial graph contains future runtime module ${module}`)
			}
		}
	}
	if (report.bundleClass === 'web') {
		for (const module of webDeferredRuntimeModules) {
			const owners = chunks.filter((chunk) =>
				chunk.modules.some((candidate) => candidate.module === module)
			)
			if (owners.length !== 1) {
				errors.push(`Web runtime module must have exactly one owner: ${module}`)
				continue
			}
			if (initialFiles.has(owners[0].file)) {
				errors.push(`Web runtime module is part of the initial graph: ${module}`)
			}
		}
	}

	const singletonOwners = new Map()
	for (const chunk of chunks) {
		for (const { module } of chunk.modules) {
			const key = singletonModuleKey(module)
			if (key === null) continue
			const owners = singletonOwners.get(key) ?? new Set()
			owners.add(chunk.file)
			singletonOwners.set(key, owners)
		}
	}
	for (const [module, owners] of singletonOwners) {
		if (owners.size > 1) {
			errors.push(
				`singleton module ${module} is duplicated across ${[...owners].sort().join(', ')}`
			)
		}
	}

	return Object.freeze({
		errors: Object.freeze(errors.sort()),
		initialBytes: initialChunks.reduce((total, chunk) => total + chunk.bytes, 0),
		deferredBytes: chunks
			.filter((chunk) => !initialFiles.has(chunk.file))
			.reduce((total, chunk) => total + chunk.bytes, 0),
		initialChunks: Object.freeze([...initialFiles].sort()),
		lazyFeatureChunks: Object.freeze([...featureChunkFiles].sort())
	})
}

function classesForTarget(target) {
	if (target === 'desktop') return ['desktop-renderer']
	if (target === 'web') return ['web']
	if (target === 'all') return ['desktop-renderer', 'web']
	throw new Error(`Chunk topology target must be desktop, web or all; received ${target}.`)
}

export function auditChunkTopology({
	repositoryRoot = resolve('.'),
	target = 'all',
	report = console.log
} = {}) {
	const results = []
	const errors = []
	for (const bundleClass of classesForTarget(target)) {
		const attributionPath = resolve(
			repositoryRoot,
			'artifacts/stage-1/bundle',
			`${bundleClass}-module-attribution.json`
		)
		if (!existsSync(attributionPath)) {
			errors.push(`${bundleClass} attribution is missing`)
			continue
		}
		const result = validateChunkTopology(JSON.parse(readFileSync(attributionPath, 'utf8')))
		results.push(Object.freeze({ bundleClass, ...result }))
		for (const error of result.errors) errors.push(`${bundleClass}: ${error}`)
	}
	if (errors.length > 0)
		throw new Error(`Chunk topology policy failed:\n- ${errors.join('\n- ')}`)
	const outputPath = resolve(
		repositoryRoot,
		'artifacts/stage-1/bundle/chunk-topology-report.json'
	)
	mkdirSync(resolve(outputPath, '..'), { recursive: true })
	writeFileSync(
		outputPath,
		`${JSON.stringify({ schemaVersion: 1, target, results }, null, 2)}\n`,
		'utf8'
	)
	const message = `PASS chunk topology for ${target}: ${results
		.map(
			(result) =>
				`${result.bundleClass} initial=${String(result.initialBytes)} deferred=${String(result.deferredBytes)}`
		)
		.join(', ')}.`
	report(message)
	return Object.freeze(results)
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Chunk topology policy')
	auditChunkTopology({ target: process.argv[2] ?? 'all' })
}
