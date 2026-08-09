import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	plannedWorkflowNames,
	workflowNames,
	workflowSteps,
	workflowTimeoutMs
} from './workflow-catalog.mjs'

function withNpmExecPath(run) {
	const previous = process.env.npm_execpath
	process.env.npm_execpath = 'C:\\npm\\npm-cli.js'
	try {
		return run()
	} finally {
		if (previous === undefined) delete process.env.npm_execpath
		else process.env.npm_execpath = previous
	}
}

describe('closed lifecycle workflow catalog', () => {
	it('exposes only unique active and reserved workflow names', () => {
		assert.equal(new Set(workflowNames).size, workflowNames.length)
		assert.equal(new Set(plannedWorkflowNames).size, plannedWorkflowNames.length)
		assert.deepEqual(
			workflowNames.filter((name) => plannedWorkflowNames.includes(name)),
			[]
		)
	})

	it('returns immutable direct-launch steps with bounded timeouts', () => {
		withNpmExecPath(() => {
			for (const name of workflowNames) {
				const steps = workflowSteps(name)
				assert.equal(Object.isFrozen(steps), true)
				assert.ok(steps.length > 0)
				assert.ok(workflowTimeoutMs(name) > 0)
				for (const step of steps) {
					assert.equal(Object.isFrozen(step), true)
					assert.equal(Object.isFrozen(step.arguments), true)
					assert.equal(typeof step.command, 'string')
					assert.ok(step.command.length > 0)
					assert.ok(Number.isSafeInteger(step.timeoutMs))
					assert.ok(step.timeoutMs > 0)
					assert.equal(Object.hasOwn(step, 'shell'), false)
				}
			}
		})
	})

	it('runs npm installs through Node with scripts disabled', () => {
		withNpmExecPath(() => {
			for (const name of ['dependencies:install', 'dependencies:ci']) {
				const [step] = workflowSteps(name)
				assert.equal(step.command, process.execPath)
				assert.equal(step.arguments[0], 'C:\\npm\\npm-cli.js')
				assert.ok(step.arguments.includes('--ignore-scripts'))
				assert.ok(step.arguments.includes('--no-audit'))
				assert.ok(step.arguments.includes('--no-fund'))
			}
		})
	})

	it('rejects missing npm ownership context and unknown workflows', () => {
		const previous = process.env.npm_execpath
		delete process.env.npm_execpath
		try {
			assert.throws(() => workflowSteps('dependencies:install'), /npm_execpath is required/u)
		} finally {
			if (previous !== undefined) process.env.npm_execpath = previous
		}
		assert.throws(() => workflowSteps('unknown'), /Unknown lifecycle workflow/u)
	})
})
