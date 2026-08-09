import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { acquireLifecycleLock, runLifecycleWorkflow } from './lifecycle-owner.mjs'

class FakeChild extends EventEmitter {
	exitCode = null
	signalCode = null

	constructor(pid) {
		super()
		this.pid = pid
	}

	exit(code = 0, signal = null) {
		if (this.exitCode !== null || this.signalCode !== null) return
		this.exitCode = code
		this.signalCode = signal
		this.emit('exit', code, signal)
	}
}

function fakeIdentity(pid, parentPid = process.pid, commandLine = `fake-${String(pid)}`) {
	return {
		pid,
		parentPid,
		startedAt: new Date(1_700_000_000_000 + pid).toISOString(),
		name: commandLine,
		commandLine
	}
}

function createFakeProcessAdapter(
	behaviors = {},
	{
		cleanupFailure = null,
		recordedProcesses = [],
		reportOrphan = false,
		reportExpectedAuxiliary = false,
		captureFailureAfterExit = false,
		captureReturnsNullBeforeExit = false
	} = {}
) {
	let nextPid = 10_000
	const children = new Map()
	const calls = []
	const owner = fakeIdentity(process.pid, 1, process.execPath)

	return {
		calls,
		children,
		spawn(command, arguments_, options) {
			const child = new FakeChild((nextPid += 1))
			children.set(child.pid, {
				child,
				identity: fakeIdentity(child.pid, process.pid, command),
				command,
				arguments_,
				options
			})
			calls.push(command)
			const behavior = behaviors[command] ?? 'success'
			if (behavior === 'success') setTimeout(() => child.exit(0), 0)
			if (behavior === 'failure') setTimeout(() => child.exit(2), 0)
			if (behavior instanceof Error) setTimeout(() => child.emit('error', behavior), 0)
			return child
		},
		async captureIdentity(pid) {
			if (pid === process.pid) return owner
			if (captureReturnsNullBeforeExit) return null
			if (captureFailureAfterExit) {
				await new Promise((resolveDelay) => setTimeout(resolveDelay, 5))
				throw new Error('PID was reused after the fast child exited')
			}
			return children.get(pid)?.identity ?? null
		},
		async observeTree(identity, tracked = []) {
			const childRecord = children.get(identity.pid)
			if (childRecord?.child.exitCode === null && childRecord?.child.signalCode === null) {
				return [identity, ...tracked.filter(({ pid }) => pid !== identity.pid)]
			}
			return [...tracked]
		},
		async findRecordedProcesses() {
			return recordedProcesses
		},
		async terminateTree(identity) {
			if (cleanupFailure !== null) throw cleanupFailure
			const child = children.get(identity.pid)?.child
			if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
				return reportExpectedAuxiliary
					? {
							hadRemaining: true,
							cleanedExpectedAuxiliary: true,
							cleanedExpectedAuxiliaryPids: [12_345]
						}
					: { hadRemaining: reportOrphan }
			}
			child.exit(null, 'SIGKILL')
			return { hadRemaining: true }
		}
	}
}

function withLifecycleDirectory(run) {
	const directory = mkdtempSync(join(tmpdir(), 'tiempio-lifecycle-test-'))
	const paths = {
		lockPath: join(directory, 'lifecycle.lock'),
		quarantinePath: join(directory, 'cleanup-required.json')
	}
	return Promise.resolve()
		.then(() => run(paths))
		.finally(() => rmSync(directory, { recursive: true, force: true }))
}

const step = (name, timeoutMs = 100) => ({
	name,
	command: name,
	arguments: [],
	timeoutMs
})

describe('lifecycle owner', () => {
	it('runs bounded steps sequentially and releases the lock after success', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter()
			const messages = []
			await runLifecycleWorkflow({
				name: 'success',
				steps: [step('first'), step('second')],
				processAdapter: adapter,
				lockPath,
				quarantinePath,
				heartbeatMs: 5,
				report: (message) => messages.push(message)
			})
			assert.deepEqual(adapter.calls, ['first', 'second'])
			assert.equal(
				messages.some((message) => message.includes('PASS success')),
				true
			)
			assert.equal(existsSync(lockPath), false)
			assert.equal(existsSync(quarantinePath), false)
			const journal = JSON.parse(
				readFileSync(join(lockPath, '..', '.tiempio-lifecycle.last-run.json'), 'utf8')
			)
			assert.equal(journal.workflow, 'success')
			assert.equal(journal.completedSteps.length, 2)
		})
	})

	it('publishes heartbeats while a bounded step is active', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({ hanging: 'hang' })
			const controller = new AbortController()
			const messages = []
			const running = runLifecycleWorkflow({
				name: 'heartbeat',
				steps: [step('hanging', 60_000)],
				signal: controller.signal,
				processAdapter: adapter,
				lockPath,
				quarantinePath,
				heartbeatMs: 2,
				report: (message) => {
					messages.push(message)
					if (message.includes('HEARTBEAT hanging')) {
						controller.abort(new Error('stop after heartbeat'))
					}
				}
			})
			await assert.rejects(running, /stop after heartbeat/u)
			assert.equal(
				messages.some((message) => message.includes('HEARTBEAT hanging')),
				true
			)
		})
	})

	it('audits a fast successful child even when its PID is reused during inspection', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({}, { captureFailureAfterExit: true })
			await runLifecycleWorkflow({
				name: 'fast-pid-reuse',
				steps: [step('fast')],
				processAdapter: adapter,
				lockPath,
				quarantinePath
			})
			assert.equal(existsSync(lockPath), false)
			assert.equal(existsSync(quarantinePath), false)
		})
	})

	it('reports a fast failed child without quarantining an already-finished PID', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter(
				{ fast: 'failure' },
				{ captureReturnsNullBeforeExit: true }
			)
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'fast-failure',
					steps: [step('fast')],
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/exited with code 2/u
			)
			assert.equal(existsSync(lockPath), false)
			assert.equal(existsSync(quarantinePath), false)
		})
	})

	it('stops after the first failed step and proves cleanup before releasing', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({ first: 'failure' })
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'fail-fast',
					steps: [step('first'), step('second')],
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/exited with code 2/u
			)
			assert.deepEqual(adapter.calls, ['first'])
			assert.equal(existsSync(lockPath), false)
		})
	})

	it('terminates the owned tree on timeout', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({ hanging: 'hang' })
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'timeout',
					steps: [step('hanging', 5)],
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/timed out/u
			)
			const child = [...adapter.children.values()][0].child
			assert.equal(child.signalCode, 'SIGKILL')
			assert.equal(existsSync(lockPath), false)
		})
	})

	it('terminates the active owned tree on the whole-workflow deadline', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({ hanging: 'hang' })
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'workflow-deadline',
					steps: [step('hanging', 60_000)],
					timeoutMs: 5,
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/workflow-deadline exceeded its 5 ms deadline/u
			)
			const child = [...adapter.children.values()][0].child
			assert.equal(child.signalCode, 'SIGKILL')
			assert.equal(existsSync(lockPath), false)
			assert.equal(existsSync(quarantinePath), false)
		})
	})

	for (const signalName of ['SIGINT', 'SIGTERM']) {
		it(`terminates the owned tree when interrupted by ${signalName}`, async () => {
			await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
				const adapter = createFakeProcessAdapter({ hanging: 'hang' })
				const controller = new AbortController()
				const running = runLifecycleWorkflow({
					name: signalName.toLowerCase(),
					steps: [step('hanging', 60_000)],
					signal: controller.signal,
					processAdapter: adapter,
					lockPath,
					quarantinePath
				})
				setTimeout(() => controller.abort(new Error(`Interrupted by ${signalName}`)), 0)
				await assert.rejects(running, new RegExp(signalName, 'u'))
				assert.equal([...adapter.children.values()][0].child.signalCode, 'SIGKILL')
				assert.equal(existsSync(lockPath), false)
			})
		})
	}

	it('rejects a second run while the recorded owner is alive', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const owner = fakeIdentity(111, 1, 'owner')
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					schemaVersion: 1,
					token: 'first',
					workflow: 'first',
					owner,
					activeStep: null
				})}\n`
			)
			const adapter = createFakeProcessAdapter({}, { recordedProcesses: [owner] })
			await assert.rejects(
				acquireLifecycleLock({
					workflow: 'second',
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/already running/u
			)
			assert.equal(existsSync(quarantinePath), false)
		})
	})

	it('replaces a dead-owner lock only after proving its tree is absent', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					schemaVersion: 1,
					token: 'stale',
					workflow: 'stale',
					owner: fakeIdentity(222),
					activeStep: null
				})}\n`
			)
			const lock = await acquireLifecycleLock({
				workflow: 'replacement',
				processAdapter: createFakeProcessAdapter(),
				lockPath,
				quarantinePath,
				token: 'replacement'
			})
			assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).token, 'replacement')
			lock.release()
			assert.equal(existsSync(lockPath), false)
		})
	})

	it('quarantines a dead owner with a potentially live descendant', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const descendant = fakeIdentity(334, 333, 'descendant')
			writeFileSync(
				lockPath,
				`${JSON.stringify({
					schemaVersion: 1,
					token: 'stale',
					workflow: 'stale',
					owner: fakeIdentity(333),
					activeStep: { identity: descendant, tracked: [descendant] }
				})}\n`
			)
			await assert.rejects(
				acquireLifecycleLock({
					workflow: 'replacement',
					processAdapter: createFakeProcessAdapter(
						{},
						{ recordedProcesses: [descendant] }
					),
					lockPath,
					quarantinePath
				}),
				/descendants remain/u
			)
			assert.equal(existsSync(lockPath), true)
			assert.equal(existsSync(quarantinePath), true)
		})
	})

	it('preserves lock and quarantine when cleanup cannot be proved', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter(
				{ hanging: 'hang' },
				{ cleanupFailure: new Error('inspection unavailable') }
			)
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'cleanup-failure',
					steps: [step('hanging', 5)],
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/cleanup could not be proved/u
			)
			assert.equal(existsSync(lockPath), true)
			assert.equal(existsSync(quarantinePath), true)
		})
	})

	it('fails a successful step that leaves an orphaned owned process', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const adapter = createFakeProcessAdapter({}, { reportOrphan: true })
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'orphan-audit',
					steps: [step('success')],
					processAdapter: adapter,
					lockPath,
					quarantinePath
				}),
				/left a task-owned process tree/u
			)
			assert.equal(existsSync(lockPath), false)
		})
	})

	it('reports and accepts exact cleanup of an expected owned compiler auxiliary', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const messages = []
			await runLifecycleWorkflow({
				name: 'expected-auxiliary',
				steps: [step('success')],
				processAdapter: createFakeProcessAdapter({}, { reportExpectedAuxiliary: true }),
				lockPath,
				quarantinePath,
				report: (message) => messages.push(message)
			})
			assert.equal(
				messages.some((message) => message.includes('CLEANUP success')),
				true
			)
			assert.equal(existsSync(lockPath), false)
			assert.equal(existsSync(quarantinePath), false)
		})
	})

	it('refuses release when the lock token changed', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const lock = await acquireLifecycleLock({
				workflow: 'token',
				processAdapter: createFakeProcessAdapter(),
				lockPath,
				quarantinePath,
				token: 'owner-token'
			})
			const record = JSON.parse(readFileSync(lockPath, 'utf8'))
			writeFileSync(lockPath, `${JSON.stringify({ ...record, token: 'foreign-token' })}\n`)
			assert.throws(() => lock.release(), /token changed/u)
			assert.equal(existsSync(lockPath), true)
			assert.equal(existsSync(quarantinePath), true)
		})
	})

	it('preserves lock and quarantine when the completed-run journal cannot be written', async () => {
		await withLifecycleDirectory(async ({ lockPath, quarantinePath }) => {
			const auditPath = join(lockPath, '..')
			await assert.rejects(
				runLifecycleWorkflow({
					name: 'audit-write-failure',
					steps: [step('success')],
					processAdapter: createFakeProcessAdapter(),
					lockPath,
					quarantinePath,
					auditPath
				}),
				/EISDIR|illegal operation on a directory/u
			)
			assert.equal(existsSync(lockPath), true)
			assert.equal(existsSync(quarantinePath), true)
		})
	})
})
