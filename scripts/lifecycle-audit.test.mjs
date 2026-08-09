import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditLifecycleState } from './lifecycle-audit.mjs'

const paths = Object.freeze({
	lock: 'lifecycle.lock',
	quarantine: 'cleanup-required.json',
	audit: 'last-run.json'
})

function createAudit({
	existing = [],
	documents = {},
	remaining = [],
	failInspection = null
} = {}) {
	const reports = []
	const inspected = []
	const processAdapter = {
		async findRecordedProcesses(record) {
			inspected.push(record)
			if (failInspection !== null) throw failInspection
			return remaining
		}
	}

	return {
		reports,
		inspected,
		run: () =>
			auditLifecycleState({
				paths,
				processAdapter,
				pathExists: (path) => existing.includes(path),
				readFile: (path) => JSON.stringify(documents[path]),
				report: (message) => reports.push(message)
			})
	}
}

describe('lifecycle post-run audit', () => {
	it('passes without inspecting processes when no state exists', async () => {
		const audit = createAudit()
		await audit.run()
		assert.equal(audit.inspected.length, 0)
		assert.match(audit.reports[0], /no lock, quarantine or previous-run journal/u)
	})

	it('fails closed when cleanup quarantine exists', async () => {
		const audit = createAudit({ existing: [paths.quarantine] })
		await assert.rejects(audit.run(), /Cleanup quarantine/u)
		assert.equal(audit.inspected.length, 0)
	})

	it('fails closed when a lifecycle lock exists', async () => {
		const audit = createAudit({
			existing: [paths.lock],
			documents: {
				[paths.lock]: { workflow: 'build', owner: { pid: 42 } }
			}
		})
		await assert.rejects(audit.run(), /build PID 42/u)
		assert.equal(audit.inspected.length, 0)
	})

	it('passes only after exact recorded identities are absent', async () => {
		const journal = { workflow: 'precommit', token: 'safe-token' }
		const audit = createAudit({
			existing: [paths.audit],
			documents: { [paths.audit]: journal }
		})
		await audit.run()
		assert.deepEqual(audit.inspected, [journal])
		assert.match(audit.reports[0], /precommit token safe-token/u)
	})

	it('reports exact survivors without attempting cleanup', async () => {
		const survivor = {
			pid: 73,
			name: 'node.exe',
			startedAt: '2026-08-09T00:00:00.000Z'
		}
		const audit = createAudit({
			existing: [paths.audit],
			documents: {
				[paths.audit]: { workflow: 'package:check', token: 'unsafe-token' }
			},
			remaining: [survivor]
		})
		await assert.rejects(audit.run(), /PID 73 \(node\.exe/u)
		assert.equal(audit.reports.length, 0)
	})

	it('propagates inspection failures instead of certifying cleanup', async () => {
		const audit = createAudit({
			existing: [paths.audit],
			documents: {
				[paths.audit]: { workflow: 'test', token: 'inspection-failure' }
			},
			failInspection: new Error('CIM unavailable')
		})
		await assert.rejects(audit.run(), /CIM unavailable/u)
		assert.equal(audit.reports.length, 0)
	})
})
