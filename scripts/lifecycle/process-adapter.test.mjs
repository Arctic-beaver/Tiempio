import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createSystemProcessAdapter,
	ownedProcessTree,
	processExecutableMatches,
	processIdentityMatches
} from './process-adapter.mjs'

const identity = (pid, parentPid, startedAt, commandLine) => ({
	pid,
	parentPid,
	startedAt,
	name: commandLine,
	commandLine
})

describe('process ownership adapter', () => {
	it('collects only the exact descendant tree rooted at the owned PID', () => {
		const root = identity(100, 10, '2026-08-09T10:00:00.000Z', 'node lifecycle-step')
		const child = identity(101, 100, '2026-08-09T10:00:01.000Z', 'node tsc')
		const grandchild = identity(102, 101, '2026-08-09T10:00:02.000Z', 'node worker')
		const unrelated = identity(200, 10, '2026-08-09T10:00:01.000Z', 'node dev-server')
		assert.deepEqual(
			ownedProcessTree([root, child, grandchild, unrelated], root).map(({ pid }) => pid),
			[100, 101, 102]
		)
	})

	it('retains a recorded descendant after an intermediate parent exits', () => {
		const root = identity(300, 10, '2026-08-09T10:00:00.000Z', 'node lifecycle-step')
		const recordedIntermediate = identity(301, 300, '2026-08-09T10:00:01.000Z', 'node npm-cli')
		const survivor = identity(302, 301, '2026-08-09T10:00:02.000Z', 'node tsc')
		assert.deepEqual(
			ownedProcessTree([survivor], root, [recordedIntermediate, survivor]).map(
				({ pid }) => pid
			),
			[302]
		)
	})

	it('rejects PID reuse before ownership-based cleanup', () => {
		const expected = identity(400, 10, '2026-08-09T10:00:00.000Z', 'node lifecycle-step')
		const reused = identity(400, 10, '2026-08-09T11:00:00.000Z', 'node unrelated')
		assert.throws(() => ownedProcessTree([reused], expected), /PID 400 was reused/u)
	})

	it('matches exact creation identity before falling back to command evidence', () => {
		const expected = identity(500, 10, '2026-08-09T10:00:00.000Z', 'node lifecycle-step')
		assert.equal(processIdentityMatches(expected, { ...expected }), true)
		assert.equal(
			processIdentityMatches(expected, {
				...expected,
				startedAt: '2026-08-09T12:00:00.000Z'
			}),
			false
		)
	})

	it('uses the executable name when Windows withholds the command line', () => {
		assert.equal(
			processExecutableMatches('C:\\Program Files\\nodejs\\node.exe', {
				name: 'node.exe',
				commandLine: ''
			}),
			true
		)
		assert.equal(
			processExecutableMatches('C:\\Program Files\\nodejs\\node.exe', {
				name: 'powershell.exe',
				commandLine: ''
			}),
			false
		)
	})

	it('accepts the exact executable name when npm abbreviates the command line', () => {
		assert.equal(
			processExecutableMatches('C:\\Program Files\\nodejs\\node.exe', {
				name: 'node.exe',
				commandLine: 'node scripts/lifecycle-runner.mjs format:check'
			}),
			true
		)
	})

	it('base64-encodes Windows process strings before JSON serialization', async () => {
		const commandLine = 'node tsc\u0000--project\nconfig.json'
		let inspectionScript = ''
		const adapter = createSystemProcessAdapter({
			platform: 'win32',
			spawnSyncProcess: (_command, arguments_) => {
				inspectionScript = arguments_.at(-1) ?? ''
				return {
					status: 0,
					stderr: '',
					stdout: JSON.stringify({
						ProcessId: 700,
						ParentProcessId: 600,
						CreationDate: `/Date(${String(Date.parse('2026-08-09T10:00:00.000Z'))})/`,
						NameBase64: Buffer.from('node.exe').toString('base64'),
						CommandLineBase64: Buffer.from(commandLine).toString('base64')
					})
				}
			}
		})

		assert.deepEqual(await adapter.inspectProcesses(), [
			{
				pid: 700,
				parentPid: 600,
				startedAt: '2026-08-09T10:00:00.000Z',
				name: 'node.exe',
				commandLine
			}
		])
		assert.match(inspectionScript, /NameBase64/u)
		assert.match(inspectionScript, /CommandLineBase64/u)
		assert.doesNotMatch(inspectionScript, /Select-Object.*CommandLine/u)
	})

	it('allows a tracked descendant a bounded natural-exit grace before cleanup', async () => {
		const root = identity(800, 700, '2026-08-09T10:00:00.000Z', 'cargo test')
		let inspections = 0
		let taskkillCalls = 0
		let clock = 0
		const adapter = createSystemProcessAdapter({
			platform: 'win32',
			now: () => (clock += 100),
			waitFor: async () => {},
			spawnSyncProcess: (command) => {
				if (command.endsWith('taskkill.exe')) {
					taskkillCalls += 1
					return { status: 0, stderr: '', stdout: '' }
				}
				inspections += 1
				const records = inspections < 12 ? [root] : []
				return {
					status: 0,
					stderr: '',
					stdout: JSON.stringify(
						records.map((record) => ({
							ProcessId: record.pid,
							ParentProcessId: record.parentPid,
							CreationDate: record.startedAt,
							NameBase64: Buffer.from('cargo.exe').toString('base64'),
							CommandLineBase64: Buffer.from(record.commandLine).toString('base64')
						}))
					)
				}
			}
		})

		assert.deepEqual(await adapter.terminateTree(root, [root]), { hadRemaining: false })
		assert.equal(taskkillCalls, 0)
	})
})
