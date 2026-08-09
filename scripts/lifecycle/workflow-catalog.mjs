import { resolve } from 'node:path'

const minute = 60_000
const node = process.execPath

function nodeFileStep(name, path, arguments_ = [], timeoutMs = minute) {
	return Object.freeze({
		name,
		command: node,
		arguments: Object.freeze([resolve(path), ...arguments_]),
		timeoutMs
	})
}

function nodeArgumentsStep(name, arguments_, timeoutMs = minute) {
	return Object.freeze({
		name,
		command: node,
		arguments: Object.freeze([...arguments_]),
		timeoutMs
	})
}

function npmStep(name, arguments_, timeoutMs) {
	const npmExecPath = process.env.npm_execpath
	if (typeof npmExecPath !== 'string' || npmExecPath.length === 0) {
		throw new Error(
			`npm_execpath is required for ${name}. Start dependency workflows through npm.`
		)
	}
	return nodeArgumentsStep(name, [npmExecPath, ...arguments_], timeoutMs)
}

function gitStep(name, arguments_, timeoutMs = minute) {
	return Object.freeze({
		name,
		command: 'git',
		arguments: Object.freeze([...arguments_]),
		timeoutMs
	})
}

const lifecycleTestFiles = Object.freeze([
	resolve('scripts/lifecycle/lifecycle-owner.test.mjs'),
	resolve('scripts/lifecycle/ownership-guard.test.mjs'),
	resolve('scripts/lifecycle/process-adapter.test.mjs'),
	resolve('scripts/lifecycle/workflow-catalog.test.mjs'),
	resolve('scripts/lifecycle-audit.test.mjs'),
	resolve('scripts/lifecycle-policy.test.mjs')
])

const steps = Object.freeze({
	dependencyInstall: (clean) =>
		npmStep(
			clean ? 'npm ci without lifecycle scripts' : 'npm install without lifecycle scripts',
			[clean ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
			8 * minute
		),
	policy: () => nodeFileStep('lifecycle policy', 'scripts/lifecycle-policy.mjs', [], minute),
	tests: () =>
		nodeArgumentsStep(
			'lifecycle tests',
			['--test', '--test-reporter=spec', ...lifecycleTestFiles],
			3 * minute
		),
	stagedWhitespace: () => gitStep('staged whitespace check', ['diff', '--cached', '--check'])
})

const workflowFactories = Object.freeze({
	'dependencies:install': () => [steps.dependencyInstall(false)],
	'dependencies:ci': () => [steps.dependencyInstall(true)],
	test: () => [steps.tests()],
	'test:lifecycle': () => [steps.tests()],
	'check:quick': () => [steps.policy(), steps.tests()],
	precommit: () => [steps.policy(), steps.stagedWhitespace(), steps.tests()]
})

export const plannedWorkflowNames = Object.freeze([
	'format',
	'format:check',
	'lint',
	'lint:fix',
	'typecheck:node',
	'typecheck:web',
	'typecheck',
	'quality',
	'build',
	'build:web',
	'build:engine',
	'package:check',
	'check:target-boundaries',
	'check:security',
	'check:audio',
	'check:visual-a11y',
	'release:check'
])

export const workflowNames = Object.freeze(Object.keys(workflowFactories))

const workflowTimeoutOverrides = Object.freeze({
	'dependencies:install': 9 * minute,
	'dependencies:ci': 9 * minute,
	test: 4 * minute,
	'test:lifecycle': 4 * minute,
	'check:quick': 4 * minute,
	precommit: 4 * minute
})

export function workflowSteps(name) {
	const factory = workflowFactories[name]
	if (factory === undefined) {
		throw new Error(
			`Unknown lifecycle workflow ${String(name)}. Allowed workflows: ${workflowNames.join(', ')}.`
		)
	}
	return Object.freeze(factory().map((step) => Object.freeze({ ...step })))
}

export function workflowTimeoutMs(name) {
	const workflow = workflowSteps(name)
	return (
		workflowTimeoutOverrides[name] ??
		workflow.reduce((total, step) => total + step.timeoutMs, 30_000)
	)
}
