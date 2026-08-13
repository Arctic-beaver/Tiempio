import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	emptyShellBundleBudgets,
	evaluateBundleClass,
	evaluateWebStage6Artifacts,
	webStage6ArtifactBudgets
} from './bundle-budget.mjs'

describe('empty-shell bundle budgets', () => {
	it('defines independent initial classes for both targets', () => {
		assert.deepEqual(emptyShellBundleBudgets, {
			'desktop-main': { root: 'dist/desktop/main', maxBytes: 229_376 },
			'desktop-preload': { root: 'dist/desktop/preload', maxBytes: 61_440 },
			'desktop-renderer': { root: 'dist/desktop/renderer', maxBytes: 622_592 },
			web: { root: 'dist/web', maxBytes: 585_728 }
		})
	})

	it('owns separate Stage 6 Web artifact ceilings', () => {
		assert.deepEqual(webStage6ArtifactBudgets, {
			initialJavaScript: 425_984,
			deferredApplication: 81_920,
			webRuntimeJavaScript: 196_608,
			workletJavaScript: 65_536,
			wasmRelease: 786_432
		})
	})

	it('reports remaining attribution budget', () => {
		const result = evaluateBundleClass('desktop-main', [
			{ path: 'index.js', bytes: 1_024 },
			{ path: 'chunk.js', bytes: 2_048 }
		])
		assert.equal(result.passed, true)
		assert.equal(result.remainingBytes, result.maxBytes - 3_072)
	})

	it('fails a bundle class above its initial ceiling', () => {
		const result = evaluateBundleClass('web', [
			{ path: 'assets/web.js', bytes: emptyShellBundleBudgets.web.maxBytes + 1 }
		])
		assert.equal(result.passed, false)
	})

	it('attributes Web runtime, worklet and WASM without spending shell budget', () => {
		const module = (module) => ({ module, renderedBytes: 1 })
		const attribution = {
			schemaVersion: 2,
			bundleClass: 'web',
			chunks: [
				{
					file: 'assets/entry.js',
					bytes: 400_000,
					isEntry: true,
					imports: [],
					dynamicImports: ['assets/controller.js', 'assets/ui.js'],
					modules: []
				},
				{
					file: 'assets/controller.js',
					bytes: 20_000,
					isEntry: false,
					imports: ['assets/entry.js'],
					dynamicImports: ['assets/engine-client.js'],
					modules: [module('apps/web/bootstrap/mountRuntimeApplication.ts')]
				},
				{
					file: 'assets/engine-client.js',
					bytes: 10_000,
					isEntry: false,
					imports: ['assets/entry.js'],
					dynamicImports: [],
					modules: []
				},
				...[
					['engine.js', 'apps/web/runtime/audio/WebEngineRuntime.ts'],
					['adapter.js', 'apps/web/runtime/audio/webAudioWorkletAdapter.ts'],
					['projects.js', 'apps/web/runtime/persistence/WebProjectsRuntime.ts']
				].map(([file, source]) => ({
					file: `assets/${file}`,
					bytes: 5_000,
					isEntry: false,
					imports: ['assets/entry.js'],
					dynamicImports: [],
					modules: [module(source)]
				})),
				{
					file: 'assets/ui.js',
					bytes: 50_000,
					isEntry: false,
					imports: ['assets/entry.js'],
					dynamicImports: [],
					modules: []
				}
			]
		}
		const wasmBytes = 600_000
		const encodedWasmBytes = Math.ceil(wasmBytes / 3) * 4
		const result = evaluateWebStage6Artifacts({
			attribution,
			wasmBytes,
			files: [
				{ path: 'assets/entry.js', bytes: 400_000 },
				{ path: 'assets/controller.js', bytes: 20_000 },
				{ path: 'assets/engine-client.js', bytes: 10_000 },
				{ path: 'assets/engine.js', bytes: 5_000 },
				{ path: 'assets/adapter.js', bytes: 5_000 },
				{ path: 'assets/projects.js', bytes: 5_000 },
				{ path: 'assets/ui.js', bytes: 50_000 },
				{ path: 'assets/web-worklet-ABC12345.js', bytes: encodedWasmBytes + 4_000 },
				{ path: 'index.html', bytes: 500 }
			]
		})
		assert.equal(result.passed, true)
		assert.deepEqual(
			result.classes.map(({ name, bytes }) => ({ name, bytes })),
			[
				{ name: 'initialJavaScript', bytes: 400_000 },
				{ name: 'deferredApplication', bytes: 50_000 },
				{ name: 'webRuntimeJavaScript', bytes: 45_000 },
				{ name: 'workletJavaScript', bytes: 4_000 },
				{ name: 'wasmRelease', bytes: 600_000 },
				{ name: 'shellOutput', bytes: 450_500 }
			]
		)
	})
})
