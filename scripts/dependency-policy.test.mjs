import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateDependencyDocuments } from './dependency-policy.mjs'

function documents(version = '1.2.3') {
	return [
		{
			packageManager: 'npm@10.9.3',
			dependencies: { example: version },
			devDependencies: {}
		},
		{
			lockfileVersion: 3,
			packages: {
				'': { dependencies: { example: version }, devDependencies: {} },
				'node_modules/example': { version }
			}
		}
	]
}

describe('pinned dependency policy', () => {
	it('accepts exact matching package and lock versions', () => {
		assert.deepEqual(validateDependencyDocuments(...documents()), [])
	})

	it('rejects semver ranges', () => {
		assert.match(
			validateDependencyDocuments(...documents('^1.2.3')).join('\n'),
			/not pinned exactly/u
		)
	})

	it('rejects a resolved version different from the declaration', () => {
		const [packageDocument, lockDocument] = documents()
		lockDocument.packages['node_modules/example'].version = '1.2.4'
		assert.match(
			validateDependencyDocuments(packageDocument, lockDocument).join('\n'),
			/resolves to 1\.2\.4/u
		)
	})
})
