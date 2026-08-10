import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	selectPolicyPaths,
	selectWorktreePolicyPaths,
	validateNeutralContracts,
	validateRendererBridgeAccess,
	validateRustCrateDependencies,
	validateRustBoundaries,
	validateTargetBoundaries
} from './target-boundary-policy.mjs'

describe('target boundary policy', () => {
	it('rejects platform imports from shared and Web code', () => {
		const errors = validateTargetBoundaries([
			{ path: 'packages/contracts/src/index.ts', source: "import 'electron'" },
			{ path: 'apps/web/runtime/index.ts', source: "import 'node:fs'" }
		])
		assert.equal(errors.length, 2)
	})

	it('rejects shared imports of target composition roots', () => {
		const errors = validateTargetBoundaries([
			{
				path: 'packages/application/src/index.ts',
				source: "import '../../../apps/desktop/renderer/main.js'"
			},
			{ path: 'apps/desktop/renderer/main.tsx', source: '' }
		])
		assert.match(errors.join('\n'), /shared code imports desktop-renderer/u)
	})

	it('enforces the approved shared package dependency direction', () => {
		const allowed = validateTargetBoundaries([
			{
				path: 'packages/application/src/index.ts',
				source: "export * from '../../contracts/src/index.js'"
			},
			{ path: 'packages/contracts/src/index.ts', source: '' }
		])
		assert.deepEqual(allowed, [])

		const forbidden = validateTargetBoundaries([
			{
				path: 'packages/design-system/src/index.ts',
				source: "export * from '../../application/src/index.js'"
			},
			{ path: 'packages/application/src/index.ts', source: '' }
		])
		assert.match(
			forbidden.join('\n'),
			/shared package design-system may not depend on application/u
		)
		assert.deepEqual(
			validateTargetBoundaries([{ path: 'packages/experimental/src/index.ts', source: '' }]),
			['packages/experimental: unknown shared package']
		)
	})

	it('keeps neutral contracts free of native transport types', () => {
		assert.deepEqual(
			validateNeutralContracts([
				{
					path: 'packages/contracts/src/runtime.ts',
					source: 'export type Handle = FileSystemFileHandle'
				}
			]),
			['packages/contracts/src/runtime.ts: neutral contract contains FileSystemFileHandle']
		)
	})

	it('allows exactly one Desktop bridge reader in the runtime adapter', () => {
		assert.deepEqual(
			validateRendererBridgeAccess([
				{
					path: 'apps/desktop/renderer/runtime/desktopRuntime.ts',
					source: 'window.tiempioRuntime'
				},
				{
					path: 'apps/desktop/renderer/global.d.ts',
					source: 'window.tiempioRuntime'
				}
			]),
			[]
		)
	})

	it('rejects engine dependencies on application packages', () => {
		assert.deepEqual(
			validateRustBoundaries([
				{
					path: 'engine/crates/core/Cargo.toml',
					source: 'ui = { path = "../../../packages/application" }'
				}
			]),
			['engine/crates/core/Cargo.toml: engine references application/UI code']
		)
	})

	it('enforces the approved Rust crate dependency direction', () => {
		assert.deepEqual(
			validateRustCrateDependencies([
				{
					path: 'engine/crates/core/Cargo.toml',
					source: 'tiempio-engine-dsp = { path = "../dsp" }'
				}
			]),
			[]
		)
		assert.deepEqual(
			validateRustCrateDependencies([
				{
					path: 'engine/crates/dsp/Cargo.toml',
					source: '[dependencies.local-core]\npath = "../core"'
				}
			]),
			['engine/crates/dsp/Cargo.toml: Rust crate dsp may not depend on core']
		)
	})

	it('selects owned source inputs without generated build trees', () => {
		assert.deepEqual(
			selectPolicyPaths([
				'engine/target/debug/build/generated.rs',
				'packages/application/src/index.ts',
				'apps/web/bootstrap/main.tsx',
				'dist/web/index.js',
				'artifacts/report.json'
			]),
			['apps/web/bootstrap/main.tsx', 'packages/application/src/index.ts']
		)
	})

	it('excludes deleted tracked paths while retaining replacement runtime contracts', () => {
		const existing = new Set(['apps/desktop/host/runtime-channels.ts'])
		assert.deepEqual(
			selectWorktreePolicyPaths(
				['apps/desktop/host/window-channels.ts', 'apps/desktop/host/runtime-channels.ts'],
				(path) => existing.has(path)
			),
			['apps/desktop/host/runtime-channels.ts']
		)
	})
})
