import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { verifyLifecyclePolicy } from './lifecycle-policy.mjs'

const repositoryRoot = resolve('.')
const repositoryPackage = JSON.parse(
	readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
)

function withPolicyFixture(packageDocument, scriptSource, run) {
	const directory = mkdtempSync(join(tmpdir(), 'tiempio-policy-test-'))
	mkdirSync(join(directory, 'scripts'))
	writeFileSync(join(directory, 'package.json'), `${JSON.stringify(packageDocument)}\n`, 'utf8')
	writeFileSync(join(directory, 'scripts', 'fixture.mjs'), scriptSource, 'utf8')
	try {
		return run(directory)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}

describe('repository lifecycle policy', () => {
	it('accepts the repository lifecycle surface', () => {
		const reports = []
		const result = verifyLifecyclePolicy({
			repositoryRoot,
			report: (message) => reports.push(message)
		})
		assert.match(result, /PASS lifecycle policy/u)
		assert.deepEqual(reports, [result])
	})

	it('rejects an unowned package-script entry point', () => {
		const packageDocument = {
			...repositoryPackage,
			scripts: { ...repositoryPackage.scripts, build: 'vite build' }
		}
		withPolicyFixture(packageDocument, 'export const safe = true\n', (directory) => {
			assert.throws(
				() => verifyLifecyclePolicy({ repositoryRoot: directory, report: () => {} }),
				/build must be lifecycle-owned/u
			)
		})
	})

	it('rejects process creation without ownership evidence', () => {
		const processModule = ['node:child', 'process'].join('_')
		const scriptSource = `import { spawn } from '${processModule}'\nspawn('node', [])\n`
		withPolicyFixture(repositoryPackage, scriptSource, (directory) => {
			assert.throws(
				() => verifyLifecyclePolicy({ repositoryRoot: directory, report: () => {} }),
				/creates processes without requireLifecycleOwnership/u
			)
		})
	})

	it('keeps unsafe npm lifecycle hooks non-bypassable', async () => {
		const previous = process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK
		try {
			delete process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK
			await assert.rejects(
				import(`./reject-unsafe-install.mjs?test=${String(Date.now())}`),
				/Direct npm install\/ci lifecycle hooks are blocked/u
			)
			process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK = '1'
			await assert.rejects(
				import(`./reject-unsafe-install.mjs?bypass=${String(Date.now())}`),
				/not a supported bypass/u
			)
		} finally {
			if (previous === undefined) delete process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK
			else process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK = previous
		}
	})
})
