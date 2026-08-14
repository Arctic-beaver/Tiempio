import assert from 'node:assert/strict'
import { glob } from 'node:fs/promises'
import { resolve } from 'node:path'
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

async function compiledSourceTestOutputs() {
	const patterns = [
		'apps/desktop/main/**/*.test.ts',
		'apps/desktop/renderer/**/*.test.ts',
		'apps/web/runtime/**/*.test.ts',
		'packages/**/*.test.ts',
		'packages/**/*.test.tsx'
	]
	const outputs = []
	for (const pattern of patterns) {
		for await (const path of glob(pattern)) {
			outputs.push(resolve('.test-out', path.replace(/\.(?:ts|tsx)$/u, '.js')))
		}
	}
	return [...new Set(outputs)].sort()
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

	it('keeps Cargo stages inside the same direct-launch catalog', () => {
		for (const name of [
			'generate:cargo-lock',
			'toolchain:rust',
			'toolchain:rust-clippy',
			'toolchain:web-wasm',
			'format:rust',
			'check:rust',
			'check:web-engine',
			'evidence:engine',
			'evidence:synth-quality-primitives',
			'check:synth-quality-primitives',
			'evidence:sq-d-macros',
			'check:sq-d-macros',
			'baseline:sq-e-catalog',
			'evidence:sq-e-catalog',
			'check:sq-e-catalog',
			'build:engine',
			'build:web-engine',
			'check:audio',
			'check:audio-live'
		]) {
			const steps = workflowSteps(name)
			assert.ok(
				steps.some((step) => /(?:cargo|rustc|rustup)(?:\.exe)?$/iu.test(step.command))
			)
			assert.ok(steps.every((step) => Object.hasOwn(step, 'shell') === false))
		}
	})

	it('owns SQ-D generation and audio evidence in one bounded sequence', () => {
		for (const name of ['evidence:sq-d-macros', 'check:sq-d-macros']) {
			const workflow = workflowSteps(name)
			assert.deepEqual(
				workflow.map((step) => step.name),
				[
					'compiled test output cleanup',
					'test TypeScript compile',
					'SQ-D current macro render matrix',
					name.startsWith('check:')
						? 'SQ-D macro audio evidence check'
						: 'SQ-D macro audio evidence'
				]
			)
			assert.equal(workflow[3].arguments.includes('render-sq-d-macro-evidence'), true)
			assert.equal(workflow[3].arguments.includes('--release'), true)
			assert.ok(workflow.every((step) => Object.hasOwn(step, 'shell') === false))
		}
	})

	it('owns SQ-E matrix and release evidence in one bounded sequence', () => {
		for (const name of [
			'baseline:sq-e-catalog',
			'evidence:sq-e-catalog',
			'check:sq-e-catalog'
		]) {
			const workflow = workflowSteps(name)
			assert.deepEqual(
				workflow.slice(0, 3).map((step) => step.name),
				[
					'compiled test output cleanup',
					'test TypeScript compile',
					'SQ-E bounded current catalog matrix'
				]
			)
			assert.equal(workflow[3].arguments.includes('render-sq-e-catalog-evidence'), true)
			assert.equal(workflow[3].arguments.includes('--release'), true)
			assert.equal(workflow[3].arguments.includes('--baseline'), name.startsWith('baseline:'))
			assert.equal(workflow[3].arguments.includes('--check'), name.startsWith('check:'))
			assert.ok(workflow.every((step) => Object.hasOwn(step, 'shell') === false))
		}
	})

	it('owns the bounded synth primitive bakeoff without recursive workflows', () => {
		for (const name of [
			'evidence:synth-quality-primitives',
			'check:synth-quality-primitives'
		]) {
			const workflow = workflowSteps(name)
			assert.equal(workflow.length, 1)
			assert.equal(
				workflow[0].name,
				name.startsWith('check:')
					? 'synth quality primitive bakeoff check'
					: 'synth quality primitive bakeoff'
			)
			assert.equal(workflow[0].arguments.includes('render-synth-quality-primitives'), true)
			assert.ok(workflow[0].timeoutMs > 0)
			assert.equal(Object.hasOwn(workflow[0], 'shell'), false)
		}
	})

	it('keeps WebAssembly installation explicit and outside ordinary builds', () => {
		const install = workflowSteps('toolchain:web-wasm')
		assert.equal(install.length, 1)
		assert.deepEqual(install[0].arguments, ['target', 'add', 'wasm32-unknown-unknown'])
		for (const name of ['check:web-engine', 'build:web-engine', 'build:web']) {
			assert.equal(
				workflowSteps(name).some((step) => step.arguments.includes('add')),
				false
			)
		}
	})

	it('runs the real release WebAssembly parity harness after deterministic native tests', () => {
		assert.deepEqual(
			workflowSteps('check:web-engine').map((step) => step.name),
			[
				'Rust WebAssembly target inventory',
				'Web engine target check',
				'Web engine deterministic native tests',
				'Web engine release build',
				'Web engine WebAssembly parity harness'
			]
		)
	})

	it('builds the release WebAssembly engine before the Web production artifact', () => {
		const names = workflowSteps('build:web').map((step) => step.name)
		assert.ok(names.indexOf('Web engine release build') < names.indexOf('Web production build'))
	})

	it('owns native build, audio and package stages without recursive workflows', () => {
		const engine = workflowSteps('build:engine')
		assert.deepEqual(
			engine.map((step) => step.name),
			['native host release build', 'native host package staging']
		)
		assert.ok(workflowSteps('check:audio').at(-1)?.name.includes('audio self-test'))
		assert.ok(workflowSteps('check:audio-live').at(-1)?.name.includes('live shared-output'))
		assert.ok(workflowSteps('package:check').at(-1)?.name.includes('package'))
	})

	it('runs every TypeScript test compiled by the test project', async () => {
		const testStep = workflowSteps('test').find(
			(step) => step.name === 'compiled contract tests'
		)
		assert.notEqual(testStep, undefined)
		const configured = new Set(testStep?.arguments ?? [])
		for (const output of await compiledSourceTestOutputs()) {
			assert.equal(configured.has(output), true, `${output} is compiled but not executed`)
		}
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
