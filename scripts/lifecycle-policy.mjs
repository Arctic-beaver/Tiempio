import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'
import { plannedWorkflowNames, workflowNames } from './lifecycle/workflow-catalog.mjs'

const runnerPrefix = 'node scripts/lifecycle-runner.mjs '
const exactDirectScripts = Object.freeze({
	'lifecycle:audit': 'node scripts/lifecycle-audit.mjs',
	postinstall: 'node scripts/reject-unsafe-install.mjs',
	prepare: 'node scripts/reject-unsafe-install.mjs'
})
const processScriptExtensions = new Set(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts'])

function scriptFiles(directory) {
	const files = []
	for (const entry of readdirSync(directory)) {
		const path = resolve(directory, entry)
		if (statSync(path).isDirectory()) files.push(...scriptFiles(path))
		else if (processScriptExtensions.has(extname(path))) files.push(path)
	}
	return files
}

export function verifyLifecyclePolicy({
	repositoryRoot = resolve('.'),
	readFile = readFileSync,
	report = console.log
} = {}) {
	const packagePath = resolve(repositoryRoot, 'package.json')
	const packageDocument = JSON.parse(readFile(packagePath, 'utf8'))
	const packageScripts = packageDocument.scripts ?? {}
	const errors = []

	for (const [name, command] of Object.entries(packageScripts)) {
		if (Object.hasOwn(exactDirectScripts, name)) {
			if (command !== exactDirectScripts[name]) {
				errors.push(`${name} must be exactly ${JSON.stringify(exactDirectScripts[name])}.`)
			}
			continue
		}
		const expected = `${runnerPrefix}${name}`
		if (command !== expected) {
			errors.push(`${name} must be lifecycle-owned as ${JSON.stringify(expected)}.`)
		}
		if (!workflowNames.includes(name)) {
			errors.push(`${name} has no closed workflow-catalog entry.`)
		}
		if (/&&|\|\||[;<>]/u.test(command)) {
			errors.push(`${name} contains a forbidden shell chain or redirection.`)
		}
	}

	for (const workflow of workflowNames) {
		if (!Object.hasOwn(packageScripts, workflow)) {
			errors.push(`Workflow ${workflow} has no package-script entry.`)
		}
	}

	const duplicates = plannedWorkflowNames.filter(
		(name, index) => plannedWorkflowNames.indexOf(name) !== index
	)
	if (duplicates.length > 0) {
		errors.push(`Planned workflow names are duplicated: ${duplicates.join(', ')}.`)
	}
	for (const planned of plannedWorkflowNames) {
		if (workflowNames.includes(planned)) {
			errors.push(
				`Planned workflow ${planned} is already active and must leave the reserve list.`
			)
		}
	}

	const scriptsRoot = resolve(repositoryRoot, 'scripts')
	for (const path of scriptFiles(scriptsRoot)) {
		const repositoryPath = relative(repositoryRoot, path).replaceAll('\\', '/')
		const source = readFile(path, 'utf8')
		if (!/(?:node:)?child_process/u.test(source)) continue
		if (repositoryPath === 'scripts/lifecycle/process-adapter.mjs') continue
		if (!source.includes('requireLifecycleOwnership')) {
			errors.push(`${repositoryPath} creates processes without requireLifecycleOwnership().`)
		}
	}

	if (errors.length > 0) {
		throw new Error(`Lifecycle policy failed:\n- ${errors.join('\n- ')}`)
	}
	const message = `PASS lifecycle policy: ${String(workflowNames.length)} active workflows, ${String(plannedWorkflowNames.length)} reserved workflows and all process creators are owned.`
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Lifecycle policy')
	verifyLifecyclePolicy()
}

export const lifecyclePolicyModulePath = fileURLToPath(import.meta.url)
