import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

export const emptyShellBundleBudgets = Object.freeze({
	'desktop-main': Object.freeze({ root: 'dist/desktop/main', maxBytes: 65_536 }),
	'desktop-preload': Object.freeze({ root: 'dist/desktop/preload', maxBytes: 32_768 }),
	'desktop-renderer': Object.freeze({ root: 'dist/desktop/renderer', maxBytes: 393_216 }),
	web: Object.freeze({ root: 'dist/web', maxBytes: 393_216 })
})

export function evaluateBundleClass(bundleClass, files) {
	const budget = emptyShellBundleBudgets[bundleClass]
	if (budget === undefined) throw new Error(`Unknown bundle class ${String(bundleClass)}.`)
	const bytes = files.reduce((total, file) => total + file.bytes, 0)
	return Object.freeze({
		bundleClass,
		bytes,
		maxBytes: budget.maxBytes,
		remainingBytes: budget.maxBytes - bytes,
		passed: bytes <= budget.maxBytes,
		files: Object.freeze([...files])
	})
}

function collectFileSizes(root, directory) {
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...collectFileSizes(root, path))
		else if (entry.isFile() && !entry.name.endsWith('.map')) {
			files.push({
				path: relative(root, path).replaceAll('\\', '/'),
				bytes: statSync(path).size
			})
		}
	}
	return files.sort((left, right) => right.bytes - left.bytes)
}

function classesForTarget(target) {
	if (target === 'desktop') {
		return ['desktop-main', 'desktop-preload', 'desktop-renderer']
	}
	if (target === 'web') return ['web']
	if (target === 'all') return Object.keys(emptyShellBundleBudgets)
	throw new Error(`Bundle target must be desktop, web or all; received ${target}.`)
}

export function auditBundleBudgets({
	repositoryRoot = resolve('.'),
	target = 'all',
	report = console.log
} = {}) {
	const results = []
	for (const bundleClass of classesForTarget(target)) {
		const budget = emptyShellBundleBudgets[bundleClass]
		const root = resolve(repositoryRoot, budget.root)
		if (!existsSync(root))
			throw new Error(`${bundleClass} output is missing at ${budget.root}.`)
		results.push(evaluateBundleClass(bundleClass, collectFileSizes(root, root)))
	}
	const failures = results.filter((result) => !result.passed)
	if (failures.length > 0) {
		throw new Error(
			`Empty-shell bundle budget failed:\n- ${failures
				.map(
					(result) =>
						`${result.bundleClass}: ${String(result.bytes)} > ${String(result.maxBytes)} bytes`
				)
				.join('\n- ')}`
		)
	}
	const outputPath = resolve(repositoryRoot, 'artifacts/stage-1/bundle/budget-report.json')
	mkdirSync(resolve(outputPath, '..'), { recursive: true })
	writeFileSync(
		outputPath,
		`${JSON.stringify({ schemaVersion: 1, target, results }, null, 2)}\n`,
		'utf8'
	)
	const message = `PASS empty-shell bundle budgets for ${target}: ${results
		.map((result) => `${result.bundleClass}=${String(result.bytes)}/${String(result.maxBytes)}`)
		.join(', ')}.`
	report(message)
	return Object.freeze(results)
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('Empty-shell bundle budget policy')
	auditBundleBudgets({ target: process.argv[2] ?? 'all' })
}
