import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	validateDesktopPackageConfiguration,
	validateDesktopPackageEntries
} from './package-content-policy.mjs'

describe('Desktop package content separation', () => {
	it('accepts the exact bounded Desktop file set', () => {
		assert.deepEqual(
			validateDesktopPackageConfiguration({
				build: { files: ['dist/desktop/**/*', 'package.json'] }
			}),
			[]
		)
	})

	it('rejects a package pattern that can include Web output', () => {
		assert.match(
			validateDesktopPackageConfiguration({ build: { files: ['dist/**/*'] } }).join('\n'),
			/must be exactly|unbounded/u
		)
	})

	it('rejects fixture entries from Web and node_modules', () => {
		assert.deepEqual(
			validateDesktopPackageEntries([
				'dist/desktop/main/index.js',
				'dist/web/assets/web.js',
				'node_modules/electron/index.js'
			]),
			[
				'Desktop package includes forbidden entry dist/web/assets/web.js',
				'Desktop package includes forbidden entry node_modules/electron/index.js'
			]
		)
	})
})
