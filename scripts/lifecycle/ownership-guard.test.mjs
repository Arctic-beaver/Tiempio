import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { requireLifecycleOwnership } from './ownership-guard.mjs'

const variableNames = Object.freeze([
	'TIEMPIO_LIFECYCLE_TOKEN',
	'TIEMPIO_LIFECYCLE_WORKFLOW',
	'TIEMPIO_LIFECYCLE_STEP'
])

function withLifecycleEnvironment(values, run) {
	const previous = Object.fromEntries(
		variableNames.map((name) => [name, process.env[name]])
	)
	try {
		for (const name of variableNames) {
			if (values[name] === undefined) delete process.env[name]
			else process.env[name] = values[name]
		}
		return run()
	} finally {
		for (const name of variableNames) {
			if (previous[name] === undefined) delete process.env[name]
			else process.env[name] = previous[name]
		}
	}
}

describe('lifecycle ownership guard', () => {
	it('rejects direct execution without lifecycle evidence', () => {
		withLifecycleEnvironment({}, () => {
			assert.throws(
				() => requireLifecycleOwnership('code generation'),
				/must run through Tiempio's lifecycle owner/u
			)
		})
	})

	it('rejects incomplete or weak ownership evidence', () => {
		withLifecycleEnvironment(
			{
				TIEMPIO_LIFECYCLE_TOKEN: 'short',
				TIEMPIO_LIFECYCLE_WORKFLOW: 'build',
				TIEMPIO_LIFECYCLE_STEP: 'compile'
			},
			() => assert.throws(() => requireLifecycleOwnership('build'), /Direct execution/u)
		)
	})

	it('returns immutable exact ownership evidence', () => {
		withLifecycleEnvironment(
			{
				TIEMPIO_LIFECYCLE_TOKEN: '1234567890abcdef',
				TIEMPIO_LIFECYCLE_WORKFLOW: 'build',
				TIEMPIO_LIFECYCLE_STEP: 'compile'
			},
			() => {
				const evidence = requireLifecycleOwnership('build')
				assert.deepEqual(evidence, {
					token: '1234567890abcdef',
					workflow: 'build',
					step: 'compile'
				})
				assert.equal(Object.isFrozen(evidence), true)
			}
		)
	})
})
