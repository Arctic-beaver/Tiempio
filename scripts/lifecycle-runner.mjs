import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runLifecycleWorkflow } from './lifecycle/lifecycle-owner.mjs'
import { workflowNames, workflowSteps, workflowTimeoutMs } from './lifecycle/workflow-catalog.mjs'

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}

export async function runLifecycleCli(workflowName = process.argv[2]) {
	if (process.env.TIEMPIO_LIFECYCLE_TOKEN !== undefined) {
		throw new Error('Nested lifecycle owners are not allowed.')
	}
	if (!workflowNames.includes(workflowName)) {
		throw new Error(
			`Usage: node scripts/lifecycle-runner.mjs <workflow>\nAllowed workflows: ${workflowNames.join(', ')}`
		)
	}

	const controller = new AbortController()
	const handledSignals =
		process.platform === 'win32'
			? ['SIGINT', 'SIGTERM', 'SIGBREAK']
			: ['SIGINT', 'SIGTERM', 'SIGHUP']
	let interruptedSignal = null
	const handlers = new Map(
		handledSignals.map((signal) => [
			signal,
			() => {
				if (controller.signal.aborted) return
				interruptedSignal = signal
				console.error(`Received ${signal}; stopping the active task-owned process tree.`)
				controller.abort(new Error(`${workflowName} interrupted by ${signal}.`))
			}
		])
	)
	for (const [signal, handler] of handlers) process.on(signal, handler)

	try {
		await runLifecycleWorkflow({
			name: workflowName,
			steps: workflowSteps(workflowName),
			signal: controller.signal,
			timeoutMs: workflowTimeoutMs(workflowName)
		})
	} catch (error) {
		console.error(`FAIL ${workflowName}: ${errorMessage(error)}`)
		process.exitCode = interruptedSignal === 'SIGINT' ? 130 : 1
	} finally {
		for (const [signal, handler] of handlers) process.removeListener(signal, handler)
	}
}

const invokedUrl =
	process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invokedUrl === import.meta.url) await runLifecycleCli()
