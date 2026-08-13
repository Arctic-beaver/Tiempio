import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lazySurfaceGroups, validateChunkTopology } from './chunk-topology.mjs'

function module(module) {
	return { module, renderedBytes: 100 }
}

function validReport() {
	const lazyChunks = Object.entries(lazySurfaceGroups).map(([surface, modules]) => ({
		file: `assets/${surface}.js`,
		bytes: 1_000,
		isEntry: false,
		isDynamicEntry: true,
		imports: ['assets/entry.js'],
		dynamicImports: [],
		modules: modules.map(module)
	}))
	const runtimeModules = [
		'apps/web/bootstrap/mountRuntimeApplication.ts',
		'packages/application/src/runtime/ApplicationRuntimeController.ts',
		'packages/engine-client/src/EngineClient.ts',
		'apps/web/runtime/audio/WebEngineRuntime.ts',
		'apps/web/runtime/audio/webAudioWorkletAdapter.ts',
		'apps/web/runtime/persistence/WebProjectsRuntime.ts',
		'apps/web/runtime/persistence/WebIndexedDbRuntime.ts',
		'packages/project-format/src/physical-archive.ts'
	]
	const runtimeChunk = {
		file: 'assets/web-runtime.js',
		bytes: 10_000,
		isEntry: false,
		isDynamicEntry: true,
		imports: ['assets/entry.js'],
		dynamicImports: [],
		modules: runtimeModules.map(module)
	}
	return {
		schemaVersion: 2,
		bundleClass: 'web',
		chunks: [
			{
				file: 'assets/entry.js',
				bytes: 250_000,
				isEntry: true,
				isDynamicEntry: false,
				imports: [],
				dynamicImports: [...lazyChunks.map((chunk) => chunk.file), runtimeChunk.file],
				modules: [
					module('node_modules/react/index.js'),
					module('packages/localization/src/index.ts'),
					module('packages/project-core/src/session.ts'),
					module('packages/contracts/src/engine-protocol.ts'),
					module('packages/application/src/features/home/HomeView.tsx'),
					module('packages/application/src/features/home/useHomeActions.ts')
				]
			},
			...lazyChunks,
			runtimeChunk
		]
	}
}

describe('chunk topology policy', () => {
	it('keeps Home eager and groups later features behind two lazy entries', () => {
		const result = validateChunkTopology(validReport())
		assert.deepEqual(result.errors, [])
		assert.equal(result.initialBytes, 250_000)
		assert.equal(result.deferredBytes, 12_000)
		assert.equal(result.lazyFeatureChunks.length, 2)
	})

	it('rejects feature, future-runtime and singleton code in unsafe chunks', () => {
		const report = validReport()
		const firstLazy = report.chunks[1]
		report.chunks[0].modules.push(module(lazySurfaceGroups.workflow[0]))
		report.chunks.at(-1).modules = report.chunks
			.at(-1)
			.modules.filter(
				(candidate) => candidate.module !== 'packages/engine-client/src/EngineClient.ts'
			)
		report.chunks[0].modules.push(module('packages/engine-client/src/EngineClient.ts'))
		firstLazy.modules.push(module('packages/project-core/src/session.ts'))
		const errors = validateChunkTopology(report).errors.join('\n')
		assert.match(errors, /workflow must have exactly one lazy surface chunk/u)
		assert.match(errors, /future runtime module/u)
		assert.match(errors, /singleton module project-core:src\/session\.ts is duplicated/u)
	})

	it('rejects stale attribution and missing entry chunks', () => {
		const report = validReport()
		report.schemaVersion = 1
		report.chunks[0].isEntry = false
		const errors = validateChunkTopology(report).errors.join('\n')
		assert.match(errors, /schema must be version 2/u)
		assert.match(errors, /exactly one entry chunk/u)
	})
})
