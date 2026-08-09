import { randomUUID } from 'node:crypto'
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createSystemProcessAdapter } from './process-adapter.mjs'

const defaultLockPath = resolve('artifacts/.tiempio-lifecycle.lock')
const defaultQuarantinePath = resolve('artifacts/.tiempio-lifecycle.cleanup-required.json')
const defaultAuditPath = resolve('artifacts/.tiempio-lifecycle.last-run.json')
const defaultHeartbeatMs = 15_000

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}

function freezeStep(step) {
	if (
		typeof step?.name !== 'string' ||
		step.name.length === 0 ||
		typeof step.command !== 'string' ||
		step.command.length === 0 ||
		!Array.isArray(step.arguments) ||
		!Number.isSafeInteger(step.timeoutMs) ||
		step.timeoutMs <= 0
	) {
		throw new Error(`Invalid lifecycle step: ${JSON.stringify(step)}.`)
	}
	return Object.freeze({
		...step,
		arguments: Object.freeze([...step.arguments])
	})
}

function readJson(path, label) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'))
	} catch (error) {
		throw new Error(`${label} ${path} is unreadable.`, { cause: error })
	}
}

function writeExclusive(path, contents) {
	mkdirSync(dirname(path), { recursive: true })
	const descriptor = openSync(path, 'wx')
	try {
		writeFileSync(descriptor, contents, 'utf8')
	} finally {
		closeSync(descriptor)
	}
}

function writeQuarantine(path, details) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				schemaVersion: 1,
				recordedAt: new Date().toISOString(),
				...details
			},
			null,
			2
		)}\n`,
		'utf8'
	)
}

export async function acquireLifecycleLock({
	workflow,
	processAdapter,
	lockPath = defaultLockPath,
	quarantinePath = defaultQuarantinePath,
	auditPath = resolve(dirname(lockPath), '.tiempio-lifecycle.last-run.json'),
	pid = process.pid,
	command = process.execPath,
	token = randomUUID(),
	now = () => new Date().toISOString()
}) {
	if (existsSync(quarantinePath)) {
		throw new Error(
			`Lifecycle cleanup is quarantined by ${quarantinePath}. Audit the recorded processes before removing it.`
		)
	}

	let owner
	try {
		owner = await processAdapter.captureIdentity(pid, command)
	} catch (error) {
		writeQuarantine(quarantinePath, {
			reason: 'owner-inspection-failed',
			workflow,
			error: errorMessage(error)
		})
		throw error
	}
	if (owner === null) {
		writeQuarantine(quarantinePath, {
			reason: 'owner-identity-unavailable',
			workflow,
			pid
		})
		throw new Error(`Could not establish lifecycle owner identity for PID ${String(pid)}.`)
	}

	for (let attempt = 0; attempt < 2; attempt += 1) {
		const record = {
			schemaVersion: 1,
			token,
			workflow,
			startedAt: now(),
			owner,
			activeStep: null,
			completedSteps: []
		}
		try {
			writeExclusive(lockPath, `${JSON.stringify(record, null, 2)}\n`)
			let quarantined = false
			const assertToken = () => {
				const current = readJson(lockPath, 'Lifecycle lock')
				if (current.token !== token) {
					writeQuarantine(quarantinePath, {
						reason: 'foreign-lock-token',
						workflow,
						expectedToken: token,
						observedToken: current.token
					})
					quarantined = true
					throw new Error(
						`Lifecycle lock token changed; refusing to update or release ${lockPath}.`
					)
				}
				return current
			}
			return Object.freeze({
				lockPath,
				quarantinePath,
				token,
				updateActiveStep(activeStep) {
					const current = assertToken()
					const completedSteps =
						activeStep === null && current.activeStep !== null
							? [...(current.completedSteps ?? []), current.activeStep]
							: (current.completedSteps ?? [])
					writeFileSync(
						lockPath,
						`${JSON.stringify({ ...current, activeStep, completedSteps }, null, 2)}\n`,
						'utf8'
					)
				},
				quarantine(reason, error, activeStep = null) {
					writeQuarantine(quarantinePath, {
						reason,
						workflow,
						token,
						activeStep,
						error: errorMessage(error)
					})
					quarantined = true
				},
				release() {
					if (quarantined) {
						throw new Error(`Lifecycle cleanup is quarantined; preserving ${lockPath}.`)
					}
					const current = assertToken()
					if (current.activeStep !== null) {
						throw new Error(
							`Lifecycle lock still records active step ${String(current.activeStep.name)}.`
						)
					}
					try {
						writeFileSync(
							auditPath,
							`${JSON.stringify({ ...current, completedAt: now() }, null, 2)}\n`,
							'utf8'
						)
						unlinkSync(lockPath)
					} catch (error) {
						writeQuarantine(quarantinePath, {
							reason: 'lock-release-or-audit-write-failed',
							workflow,
							token,
							error: errorMessage(error)
						})
						quarantined = true
						throw error
					}
				}
			})
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error
			let existing
			try {
				existing = readJson(lockPath, 'Lifecycle lock')
			} catch (readError) {
				writeQuarantine(quarantinePath, {
					reason: 'unreadable-lock',
					workflow,
					error: errorMessage(readError)
				})
				throw readError
			}

			let remaining
			try {
				remaining = await processAdapter.findRecordedProcesses(existing)
			} catch (inspectionError) {
				writeQuarantine(quarantinePath, {
					reason: 'stale-lock-inspection-failed',
					workflow,
					existing,
					error: errorMessage(inspectionError)
				})
				throw new Error(
					`Could not audit existing lifecycle lock ${lockPath}; later workflows are blocked.`,
					{ cause: inspectionError }
				)
			}
			if (remaining.length > 0) {
				const ownerAlive = remaining.some(
					(candidate) => candidate.pid === existing.owner?.pid
				)
				if (!ownerAlive) {
					writeQuarantine(quarantinePath, {
						reason: 'dead-owner-with-live-descendants',
						workflow,
						existing,
						remaining
					})
				}
				throw new Error(
					ownerAlive
						? `Lifecycle workflow ${String(existing.workflow)} is already running as PID ${String(existing.owner.pid)}.`
						: `Lifecycle owner is gone but task-owned descendants remain: ${remaining
								.map(({ pid: remainingPid }) => String(remainingPid))
								.join(', ')}.`
				)
			}
			unlinkSync(lockPath)
		}
	}
	throw new Error(`Could not acquire lifecycle lock ${lockPath}.`)
}

function waitForChildOutcome(child, timeoutMs, signal) {
	return new Promise((resolveOutcome) => {
		let settled = false
		const finish = (outcome) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			signal?.removeEventListener('abort', onAbort)
			child.removeListener('error', onError)
			child.removeListener('exit', onExit)
			resolveOutcome(outcome)
		}
		const onError = (error) => finish({ kind: 'error', error })
		const onExit = (code, exitSignal) => finish({ kind: 'exit', code, signal: exitSignal })
		const onAbort = () =>
			finish({
				kind: 'aborted',
				error:
					signal?.reason instanceof Error
						? signal.reason
						: new Error('Lifecycle workflow was interrupted.')
			})
		const timeout = setTimeout(
			() =>
				finish({
					kind: 'timeout',
					error: new Error(`Step timed out after ${String(timeoutMs)} ms.`)
				}),
			timeoutMs
		)
		child.once('error', onError)
		child.once('exit', onExit)
		signal?.addEventListener('abort', onAbort, { once: true })
		if (signal?.aborted === true) onAbort()
	})
}

async function captureChildIdentity({ child, command, startedAt, outcomePromise, processAdapter }) {
	const noOutcome = Symbol('no-outcome')
	let captureError = null
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const identity = await processAdapter.captureIdentity(child.pid, command)
			if (identity !== null) return identity
		} catch (error) {
			captureError = error
		}

		const outcome = await Promise.race([
			outcomePromise,
			new Promise((resolveGrace) => {
				const timer = setTimeout(() => resolveGrace(noOutcome), 25)
				timer.unref?.()
			})
		])
		if (outcome !== noOutcome || child.exitCode !== null || child.signalCode !== null) {
			return {
				pid: child.pid,
				parentPid: process.pid,
				startedAt: new Date(startedAt).toISOString(),
				name: command,
				commandLine: command
			}
		}
	}

	if (captureError !== null) throw captureError
	throw new Error(`Could not establish identity for PID ${String(child.pid)}.`)
}

async function executeStep({
	workflow,
	step,
	index,
	total,
	token,
	lock,
	processAdapter,
	signal,
	heartbeatMs,
	report,
	cwd,
	environment
}) {
	const startedAt = Date.now()
	report(
		`[${workflow} ${String(index + 1)}/${String(total)}] START ${step.name} (timeout ${String(step.timeoutMs)} ms)`
	)
	const child = processAdapter.spawn(step.command, step.arguments, {
		cwd,
		detached: process.platform !== 'win32',
		env: {
			...environment,
			TIEMPIO_LIFECYCLE_TOKEN: token,
			TIEMPIO_LIFECYCLE_WORKFLOW: workflow,
			TIEMPIO_LIFECYCLE_STEP: step.name
		},
		stdio: step.stdio ?? 'inherit',
		windowsHide: true
	})
	const outcomePromise = waitForChildOutcome(child, step.timeoutMs, signal)

	let identity
	let tracked = []
	try {
		identity = await captureChildIdentity({
			child,
			command: step.command,
			startedAt,
			outcomePromise,
			processAdapter
		})
		tracked = await processAdapter.observeTree(identity)
		lock.updateActiveStep({
			name: step.name,
			identity,
			tracked,
			command: step.command,
			arguments: step.arguments,
			startedAt: new Date(startedAt).toISOString()
		})
	} catch (error) {
		lock.quarantine('step-identity-unavailable', error, {
			name: step.name,
			pid: child.pid,
			command: step.command,
			arguments: step.arguments
		})
		throw error
	}

	let observation = Promise.resolve()
	const heartbeat = setInterval(() => {
		report(
			`[${workflow} ${String(index + 1)}/${String(total)}] HEARTBEAT ${step.name} (${String(Date.now() - startedAt)} ms)`
		)
		observation = observation
			.then(async () => {
				tracked = await processAdapter.observeTree(identity, tracked)
				lock.updateActiveStep({
					name: step.name,
					identity,
					tracked,
					command: step.command,
					arguments: step.arguments,
					startedAt: new Date(startedAt).toISOString()
				})
			})
			.catch((error) => {
				lock.quarantine('heartbeat-process-inspection-failed', error, {
					name: step.name,
					identity,
					tracked
				})
			})
	}, heartbeatMs)
	heartbeat.unref?.()

	const outcome = await outcomePromise
	clearInterval(heartbeat)
	await observation

	let hadRemaining
	try {
		tracked = await processAdapter.observeTree(identity, tracked)
		const cleanup = await processAdapter.terminateTree(identity, tracked)
		hadRemaining = cleanup.hadRemaining
	} catch (cleanupError) {
		lock.quarantine('process-tree-cleanup-failed', cleanupError, {
			name: step.name,
			identity,
			tracked,
			outcome
		})
		throw new AggregateError(
			[
				outcome.error ?? new Error(`Step ${step.name} did not complete cleanly.`),
				cleanupError
			],
			`Step ${step.name} cleanup could not be proved.`
		)
	}

	lock.updateActiveStep(null)
	if (outcome.kind === 'exit' && outcome.code === 0 && outcome.signal === null) {
		if (hadRemaining) {
			throw new Error(
				`Step ${step.name} exited successfully but left a task-owned process tree that was terminated.`
			)
		}
		report(
			`[${workflow} ${String(index + 1)}/${String(total)}] PASS ${step.name} (${String(Date.now() - startedAt)} ms)`
		)
		return
	}
	if (outcome.kind === 'exit') {
		throw new Error(
			`Step ${step.name} exited ${
				outcome.signal === null
					? `with code ${String(outcome.code)}`
					: `from signal ${String(outcome.signal)}`
			}.`
		)
	}
	throw outcome.error
}

export async function runLifecycleWorkflow({
	name,
	steps,
	signal,
	timeoutMs,
	report = (message) => console.log(message),
	processAdapter = createSystemProcessAdapter(),
	lockPath = defaultLockPath,
	quarantinePath = defaultQuarantinePath,
	auditPath = resolve(dirname(lockPath), '.tiempio-lifecycle.last-run.json'),
	heartbeatMs = defaultHeartbeatMs,
	cwd = process.cwd(),
	environment = process.env,
	token = randomUUID()
}) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new Error('Lifecycle workflow name is required.')
	}
	const safeSteps = Object.freeze(steps.map(freezeStep))
	if (safeSteps.length === 0) throw new Error(`Workflow ${name} has no steps.`)
	const workflowTimeoutMs =
		timeoutMs ?? safeSteps.reduce((total, step) => total + step.timeoutMs, 30_000)
	if (!Number.isSafeInteger(workflowTimeoutMs) || workflowTimeoutMs <= 0) {
		throw new Error(`Workflow ${name} requires a positive integer timeout.`)
	}

	const startedAt = Date.now()
	const lock = await acquireLifecycleLock({
		workflow: name,
		processAdapter,
		lockPath,
		quarantinePath,
		auditPath,
		token
	})
	const workflowController = new AbortController()
	const forwardAbort = () => {
		if (workflowController.signal.aborted) return
		workflowController.abort(
			signal?.reason instanceof Error
				? signal.reason
				: new Error(`Workflow ${name} was interrupted.`)
		)
	}
	signal?.addEventListener('abort', forwardAbort, { once: true })
	if (signal?.aborted === true) forwardAbort()
	const deadline = setTimeout(() => {
		if (workflowController.signal.aborted) return
		workflowController.abort(
			new Error(`Workflow ${name} exceeded its ${String(workflowTimeoutMs)} ms deadline.`)
		)
	}, workflowTimeoutMs)
	deadline.unref?.()
	let failure = null
	try {
		for (const [index, step] of safeSteps.entries()) {
			if (workflowController.signal.aborted) throw workflowController.signal.reason
			await executeStep({
				workflow: name,
				step,
				index,
				total: safeSteps.length,
				token,
				lock,
				processAdapter,
				signal: workflowController.signal,
				heartbeatMs,
				report,
				cwd,
				environment
			})
		}
		if (workflowController.signal.aborted) throw workflowController.signal.reason
		report(`PASS ${name} (${String(Date.now() - startedAt)} ms)`)
	} catch (error) {
		failure = error
	} finally {
		clearTimeout(deadline)
		signal?.removeEventListener('abort', forwardAbort)
		try {
			lock.release()
		} catch (releaseError) {
			failure =
				failure === null
					? releaseError
					: new AggregateError(
							[failure, releaseError],
							`${errorMessage(failure)} Lifecycle lock release also failed.`
						)
		}
	}
	if (failure !== null) throw failure
}

export const lifecyclePaths = Object.freeze({
	lock: defaultLockPath,
	quarantine: defaultQuarantinePath,
	audit: defaultAuditPath
})
