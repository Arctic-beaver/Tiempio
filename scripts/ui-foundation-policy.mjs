import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const requiredViews = Object.freeze([
	'view-home',
	'view-first-layer',
	'view-sound-chooser',
	'view-piano-roll',
	'view-drums',
	'view-arrangement',
	'view-sound-sculpt'
])

const requiredTokens = Object.freeze([
	'--ti-canvas',
	'--ti-surface-1',
	'--ti-surface-raised',
	'--ti-text',
	'--ti-text-muted',
	'--ti-border',
	'--ti-accent',
	'--ti-focus',
	'--ti-scroll-track',
	'--ti-scroll-thumb-active'
])

function collectFiles(root, directory, extensionPattern) {
	const files = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name)
		if (entry.isDirectory()) files.push(...collectFiles(root, path, extensionPattern))
		else if (entry.isFile() && extensionPattern.test(entry.name)) {
			files.push({
				path: relative(root, path).replaceAll('\\', '/'),
				source: readFileSync(path, 'utf8')
			})
		}
	}
	return files
}

export function validateUiFoundation({
	cssFiles,
	applicationSource,
	localizationSource,
	desktopSource
}) {
	const errors = []
	const foundation = cssFiles.find(
		(file) => file.path === 'packages/design-system/src/foundation.css'
	)
	if (foundation === undefined) errors.push('design-system foundation stylesheet is missing')
	else {
		for (const selector of [':root[data-theme="light"]', ':root[data-theme="dark"]']) {
			if (!foundation.source.includes(selector))
				errors.push(`theme selector is missing: ${selector}`)
		}
		for (const token of requiredTokens) {
			if (!foundation.source.includes(token))
				errors.push(`semantic token is missing: ${token}`)
		}
		if (!foundation.source.includes('@media (prefers-reduced-motion: reduce)')) {
			errors.push('reduced-motion treatment is missing')
		}
	}
	for (const file of cssFiles) {
		if (
			file.path !== 'packages/design-system/src/foundation.css' &&
			file.source.includes('::-webkit-scrollbar')
		) {
			errors.push(`${file.path}: component-local scrollbar treatment is forbidden`)
		}
		if (/\b(?!1px\b)\d+(?:\.\d+)?px\b/gu.test(file.source)) {
			errors.push(
				`${file.path}: fixed pixel geometry requires an explicit platform exemption`
			)
		}
	}
	if (/<select\b/gu.test(applicationSource)) {
		errors.push('application code contains a native select instead of the shared Select')
	}
	for (const view of requiredViews) {
		if (!applicationSource.includes(`data-testid="${view}"`)) {
			errors.push(`required studio state is missing: ${view}`)
		}
	}
	for (const mechanism of [
		'CommandProvider',
		'commandForShortcut',
		'runtime.commands.api.onRequested'
	]) {
		if (!applicationSource.includes(mechanism))
			errors.push(`command mechanism is missing: ${mechanism}`)
	}
	for (const mechanism of [
		'I18nextProvider',
		"supportedLocales = Object.freeze(['en', 'ru', 'es']",
		'es: { translation: catalogs.es }'
	]) {
		if (!localizationSource.includes(mechanism))
			errors.push(`i18n mechanism is missing: ${mechanism}`)
	}
	for (const mechanism of [
		'frame: false',
		"titleBarStyle: 'hiddenInset'",
		'contextIsolation: true'
	]) {
		if (!desktopSource.includes(mechanism))
			errors.push(`Desktop chrome/security mechanism is missing: ${mechanism}`)
	}
	return errors.sort()
}

export function auditUiFoundation({ repositoryRoot = resolve('.'), report = console.log } = {}) {
	const cssFiles = collectFiles(repositoryRoot, resolve(repositoryRoot, 'packages'), /\.css$/u)
	const applicationSource = collectFiles(
		repositoryRoot,
		resolve(repositoryRoot, 'packages/application/src'),
		/\.(?:ts|tsx)$/u
	)
		.map(({ source }) => source)
		.join('\n')
	const localizationSource = collectFiles(
		repositoryRoot,
		resolve(repositoryRoot, 'packages/localization/src'),
		/\.(?:ts|tsx)$/u
	)
		.map(({ source }) => source)
		.join('\n')
	const desktopSource = collectFiles(
		repositoryRoot,
		resolve(repositoryRoot, 'apps/desktop'),
		/\.(?:ts|tsx)$/u
	)
		.map(({ source }) => source)
		.join('\n')
	const errors = validateUiFoundation({
		cssFiles,
		applicationSource,
		localizationSource,
		desktopSource
	})
	if (errors.length > 0) throw new Error(`UI foundation policy failed:\n- ${errors.join('\n- ')}`)
	const message =
		'PASS UI foundation: shared themes, controls, scrollbars, commands, EN/RU/ES i18n and seven states are present.'
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('UI foundation policy')
	auditUiFoundation()
}
