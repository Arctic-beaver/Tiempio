import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	validateNeutralContracts,
	validateRendererBridgeAccess,
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
})
