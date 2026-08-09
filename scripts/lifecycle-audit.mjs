import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSystemProcessAdapter } from './lifecycle/process-adapter.mjs'
import { lifecyclePaths } from './lifecycle/lifecycle-owner.mjs'

function readJson(path, label, readFile) {
	try {
		return JSON.parse(readFile(path, 'utf8'))
	} catch (error) {
		throw new Error(`${label} ${path} is unreadable; refusing to certify cleanup.`, {
			cause: error
		})
	}
}

export async function auditLifecycleState({
	paths = lifecyclePaths,
	processAdapter = createSystemProcessAdapter(),
	pathExists = existsSync,
	readFile = readFileSync,
	report = console.log
} = {}) {
	if (pathExists(paths.quarantine)) {
		throw new Error(
			`Cleanup quarantine ${paths.quarantine} is present. Audit it manually before any new work.`
		)
	}

	if (pathExists(paths.lock)) {
		const lock = readJson(paths.lock, 'Lifecycle lock', readFile)
		throw new Error(
			`Lifecycle lock is still present for ${String(lock.workflow)} PID ${String(lock.owner?.pid)}.`
		)
	}

	if (!pathExists(paths.audit)) {
		const message =
			'PASS lifecycle audit: no lock, quarantine or previous-run journal is present.'
		report(message)
		return message
	}

	const previousRun = readJson(paths.audit, 'Lifecycle audit journal', readFile)
	const remaining = await processAdapter.findRecordedProcesses(previousRun)
	if (remaining.length > 0) {
		throw new Error(
			`Lifecycle audit found task-owned processes from ${String(previousRun.workflow)}: ${remaining
				.map(
					(record) =>
						`PID ${String(record.pid)} (${record.name}, started ${record.startedAt})`
				)
				.join(', ')}.`
		)
	}

	const message = `PASS lifecycle audit: ${String(previousRun.workflow)} token ${String(previousRun.token)} left no recorded process; lock and quarantine are absent.`
	report(message)
	return message
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await auditLifecycleState()
}
