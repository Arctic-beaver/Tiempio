import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const inspectionTimeoutMs = 15_000
const cleanupTimeoutMs = 15_000
const cleanupPollMs = 100

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}

function normalizeCommandLine(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeExecutable(value) {
	if (typeof value !== 'string') return ''
	return value.split(/[\\/]/u).at(-1)?.toLowerCase() ?? ''
}

function executableMatches(command, processRecord) {
	const executable = normalizeExecutable(command)
	if (executable === '') return false
	const commandLine = normalizeCommandLine(processRecord.commandLine)
	return (
		normalizeExecutable(processRecord.name) === executable || commandLine.includes(executable)
	)
}

function windowsStartedAt(value) {
	const serialized = String(value ?? '')
	const match = /^\/Date\((\d+)\)\/$/u.exec(serialized)
	return match === null ? serialized : new Date(Number(match[1])).toISOString()
}

function decodeWindowsProcessField(value) {
	if (typeof value !== 'string' || value === '') return ''
	return Buffer.from(value, 'base64').toString('utf8')
}

function parseWindowsProcesses(stdout) {
	if (stdout.trim() === '') return []
	const document = JSON.parse(stdout)
	const records = Array.isArray(document) ? document : [document]
	return records
		.map((record) => ({
			pid: Number(record.ProcessId),
			parentPid: Number(record.ParentProcessId),
			startedAt: windowsStartedAt(record.CreationDate),
			name: decodeWindowsProcessField(record.NameBase64),
			commandLine: decodeWindowsProcessField(record.CommandLineBase64)
		}))
		.filter(
			(record) => Number.isSafeInteger(record.pid) && Number.isSafeInteger(record.parentPid)
		)
}

function parsePosixProcesses(stdout, nowMs) {
	const records = []
	for (const line of stdout.split(/\r?\n/u)) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u.exec(line)
		if (match === null) continue
		const elapsedSeconds = Number(match[3])
		records.push({
			pid: Number(match[1]),
			parentPid: Number(match[2]),
			startedAt: new Date(nowMs - elapsedSeconds * 1_000).toISOString(),
			name: match[4].split(/\s+/u)[0] ?? '',
			commandLine: match[4]
		})
	}
	return records
}

function identityMatches(expected, actual) {
	if (expected.pid !== actual.pid) return false
	if (expected.startedAt !== '' && actual.startedAt !== '') {
		if (expected.startedAt === actual.startedAt) return true
		const expectedTime = Date.parse(expected.startedAt)
		const actualTime = Date.parse(actual.startedAt)
		if (
			Number.isFinite(expectedTime) &&
			Number.isFinite(actualTime) &&
			Math.abs(expectedTime - actualTime) <= 2_000
		) {
			return true
		}
		return false
	}
	const expectedCommand = normalizeCommandLine(expected.commandLine)
	const actualCommand = normalizeCommandLine(actual.commandLine)
	return expectedCommand !== '' && actualCommand.includes(expectedCommand)
}

function processStartedAfterRoot(processRecord, rootIdentity) {
	const processTime = Date.parse(processRecord.startedAt)
	const rootTime = Date.parse(rootIdentity.startedAt)
	return !Number.isFinite(processTime) || !Number.isFinite(rootTime) || processTime >= rootTime
}

function collectOwnedProcesses(processes, rootIdentity, tracked = []) {
	const byPid = new Map(processes.map((record) => [record.pid, record]))
	const trackedByPid = new Map(tracked.map((record) => [record.pid, record]))
	const currentRoot = byPid.get(rootIdentity.pid)
	if (currentRoot !== undefined && !identityMatches(rootIdentity, currentRoot)) {
		throw new Error(
			`PID ${String(rootIdentity.pid)} was reused; refusing process-tree cleanup.`
		)
	}

	const owned = new Map()
	if (currentRoot !== undefined) owned.set(currentRoot.pid, currentRoot)
	for (const [pid, expected] of trackedByPid) {
		const current = byPid.get(pid)
		if (current !== undefined && identityMatches(expected, current)) owned.set(pid, current)
	}

	const parentPids = new Set([rootIdentity.pid, ...owned.keys()])
	let changed = true
	while (changed) {
		changed = false
		for (const record of processes) {
			if (
				owned.has(record.pid) ||
				!parentPids.has(record.parentPid) ||
				!processStartedAfterRoot(record, rootIdentity)
			) {
				continue
			}
			owned.set(record.pid, record)
			parentPids.add(record.pid)
			changed = true
		}
	}
	return [...owned.values()]
}

function highestOwnedRoots(owned, rootPid) {
	const ownedPids = new Set(owned.map((record) => record.pid))
	const actualRoot = owned.find((record) => record.pid === rootPid)
	if (actualRoot !== undefined) return [actualRoot]
	return owned.filter((record) => !ownedPids.has(record.parentPid))
}

function assertSuccessfulInspection(result, label) {
	if (result.error !== undefined) {
		throw new Error(`${label} failed: ${errorMessage(result.error)}`)
	}
	if (result.status !== 0) {
		throw new Error(
			`${label} exited with ${String(result.status)}: ${String(result.stderr).trim()}`
		)
	}
}

export function createSystemProcessAdapter({
	platform = process.platform,
	spawnProcess = spawn,
	spawnSyncProcess = spawnSync,
	killProcess = process.kill,
	now = Date.now,
	waitFor = wait
} = {}) {
	const inspectProcesses = async () => {
		if (platform === 'win32') {
			const powershell = join(
				process.env.SystemRoot ?? 'C:\\Windows',
				'System32',
				'WindowsPowerShell',
				'v1.0',
				'powershell.exe'
			)
			const script =
				"$ErrorActionPreference='Stop'; $utf8=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ ProcessId=$_.ProcessId; ParentProcessId=$_.ParentProcessId; CreationDate=$_.CreationDate; NameBase64=[Convert]::ToBase64String($utf8.GetBytes([string]$_.Name)); CommandLineBase64=[Convert]::ToBase64String($utf8.GetBytes([string]$_.CommandLine)) } } | ConvertTo-Json -Compress"
			const result = spawnSyncProcess(
				powershell,
				['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
				{
					encoding: 'utf8',
					shell: false,
					timeout: inspectionTimeoutMs,
					windowsHide: true
				}
			)
			assertSuccessfulInspection(result, 'Windows process inspection')
			return parseWindowsProcesses(result.stdout)
		}

		const result = spawnSyncProcess('/bin/ps', ['-ww', '-eo', 'pid=,ppid=,etimes=,args='], {
			encoding: 'utf8',
			shell: false,
			timeout: inspectionTimeoutMs
		})
		assertSuccessfulInspection(result, 'POSIX process inspection')
		return parsePosixProcesses(result.stdout, now())
	}

	const captureIdentity = async (pid, command) => {
		const processes = await inspectProcesses()
		const record = processes.find((candidate) => candidate.pid === pid)
		if (record === undefined) return null
		if (!executableMatches(command, record)) {
			throw new Error(
				`PID ${String(pid)} does not match ${command}; observed name ${JSON.stringify(record.name)} and command line ${JSON.stringify(record.commandLine)}. Refusing ownership.`
			)
		}
		return record
	}

	const observeTree = async (rootIdentity, tracked = []) => {
		const processes = await inspectProcesses()
		const observed = collectOwnedProcesses(processes, rootIdentity, tracked)
		const combined = new Map(tracked.map((record) => [record.pid, record]))
		for (const record of observed) combined.set(record.pid, record)
		return [...combined.values()]
	}

	const findRecordedProcesses = async (record) => {
		const processes = await inspectProcesses()
		const identities = [
			record.owner,
			record.activeStep?.identity,
			...(record.activeStep?.tracked ?? []),
			...(record.completedSteps ?? []).flatMap((step) => [
				step.identity,
				...(step.tracked ?? [])
			])
		].filter((identity) => identity !== undefined && identity !== null)
		return identities.flatMap((identity) => {
			const current = processes.find((candidate) => candidate.pid === identity.pid)
			return current !== undefined && identityMatches(identity, current) ? [current] : []
		})
	}

	const remainingTree = async (rootIdentity, tracked = []) => {
		const processes = await inspectProcesses()
		return collectOwnedProcesses(processes, rootIdentity, tracked)
	}

	const terminateTree = async (rootIdentity, tracked = []) => {
		const before = await remainingTree(rootIdentity, tracked)
		if (before.length === 0) return { hadRemaining: false }

		if (platform === 'win32') {
			for (const root of highestOwnedRoots(before, rootIdentity.pid)) {
				const current = (await inspectProcesses()).find(
					(candidate) => candidate.pid === root.pid
				)
				if (current === undefined) continue
				if (!identityMatches(root, current)) {
					throw new Error(
						`PID ${String(root.pid)} changed identity before cleanup; refusing taskkill.`
					)
				}
				const result = spawnSyncProcess(
					'taskkill.exe',
					['/PID', String(root.pid), '/T', '/F'],
					{
						encoding: 'utf8',
						shell: false,
						timeout: cleanupTimeoutMs,
						windowsHide: true
					}
				)
				if (result.error !== undefined && result.error.code !== 'ESRCH') {
					throw result.error
				}
			}
		} else {
			try {
				killProcess(-rootIdentity.pid, 'SIGTERM')
			} catch (error) {
				if (error?.code !== 'ESRCH') throw error
			}
			const gracefulDeadline = now() + 5_000
			while (now() < gracefulDeadline) {
				if ((await remainingTree(rootIdentity, tracked)).length === 0) {
					return { hadRemaining: true }
				}
				await waitFor(cleanupPollMs)
			}
			try {
				killProcess(-rootIdentity.pid, 'SIGKILL')
			} catch (error) {
				if (error?.code !== 'ESRCH') throw error
			}
		}

		const deadline = now() + cleanupTimeoutMs
		while (now() < deadline) {
			if ((await remainingTree(rootIdentity, tracked)).length === 0) {
				return { hadRemaining: true }
			}
			await waitFor(cleanupPollMs)
		}
		const survivors = await remainingTree(rootIdentity, tracked)
		throw new Error(
			`Task-owned process cleanup could not be proved; surviving PIDs: ${survivors
				.map(({ pid }) => String(pid))
				.join(', ')}.`
		)
	}

	return Object.freeze({
		spawn(command, arguments_, options) {
			return spawnProcess(command, arguments_, { ...options, shell: false })
		},
		captureIdentity,
		inspectProcesses,
		observeTree,
		findRecordedProcesses,
		remainingTree,
		terminateTree
	})
}

export const processIdentityMatches = identityMatches
export const processExecutableMatches = executableMatches
export const ownedProcessTree = collectOwnedProcesses
