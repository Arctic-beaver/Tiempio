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
		for (const mechanism of [
			'@media (max-width: 44.999rem)',
			'.ti-tooltip[data-placement] .ti-tooltip__content',
			'position: fixed;',
			'inset: auto var(--ti-space-3) var(--ti-space-3);'
		]) {
			if (!foundation.source.includes(mechanism)) {
				errors.push(`compact tooltip containment is missing: ${mechanism}`)
			}
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
		'CommandIconButton',
		'commandForShortcut',
		'resolveCommandStates(',
		'executeResolvedCommand(',
		'aria-disabled={!command.available',
		'runtime.commands.api.onRequested',
		'ProjectSessionProvider',
		'useSyncExternalStore',
		'projectStudio('
	]) {
		if (!applicationSource.includes(mechanism))
			errors.push(`command mechanism is missing: ${mechanism}`)
	}
	if (/<button\b[^>]*className="transport-bar__tempo"/su.test(applicationSource)) {
		errors.push('tempo display is interactive without a registered command')
	}
	if (applicationSource.includes("t('transport.audioShared')")) {
		errors.push('audio status claims Shared Audio without runtime evidence')
	}
	if (applicationSource.includes('setPlaying((current) => !current)')) {
		errors.push('playback state is toggled locally instead of following the engine')
	}
	for (const forbidden of [
		'setNotes(',
		'setActiveSteps(',
		'setActiveCells(',
		'setValues(',
		'setLooping('
	]) {
		if (applicationSource.includes(forbidden)) {
			errors.push(`canonical project state escaped ProjectSession: ${forbidden}`)
		}
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

export function validateApplicationComposition({
	editorSurfaceSource,
	projectorFacadeSource,
	studioApplicationSource,
	styleFacadeSource
}) {
	const errors = []
	for (const mechanism of [
		'useStudioNavigation()',
		'useTransportCommandHandlers()',
		'<ActiveStudioView',
		'<CommandProvider'
	]) {
		if (!studioApplicationSource.includes(mechanism)) {
			errors.push(`StudioApplication composition mechanism is missing: ${mechanism}`)
		}
	}
	for (const implementationDetail of [
		'projectSession.dispatch(',
		'createMidiClip(',
		'createDrumClip(',
		'useState('
	]) {
		if (studioApplicationSource.includes(implementationDetail)) {
			errors.push(`StudioApplication owns implementation detail: ${implementationDetail}`)
		}
	}
	for (const projector of [
		'projectHome(context)',
		'projectLayers(context)',
		'projectContext(context)',
		'projectPianoRoll(context)',
		'projectDrums(context)',
		'projectArrangement(context)',
		'projectSoundSculpt(context)',
		'projectTransport(context)'
	]) {
		if (!projectorFacadeSource.includes(projector)) {
			errors.push(`projector facade is missing: ${projector}`)
		}
	}
	for (const implementationDetail of ['defaultTicksPerQuarter', 'rolePresentation', 'drumRows']) {
		if (projectorFacadeSource.includes(implementationDetail)) {
			errors.push(`projector facade owns feature detail: ${implementationDetail}`)
		}
	}
	const styleImports = [...styleFacadeSource.matchAll(/^@import '([^']+)';\r?$/gmu)].map(
		(match) => match[1]
	)
	const expectedStyleImports = [
		'./styles/shell-layout.css',
		'./styles/workflow-views.css',
		'./styles/drawers.css',
		'./styles/responsive.css'
	]
	if (
		styleFacadeSource.includes('{') ||
		styleImports.length !== expectedStyleImports.length ||
		styleImports.some((value, index) => value !== expectedStyleImports[index])
	) {
		errors.push('studio style facade must contain only the ordered owned style imports')
	}
	if (!editorSurfaceSource.includes("import '../styles/editor-views.css'")) {
		errors.push('lazy editor surface must own its deferred editor stylesheet')
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
		.filter(({ path }) => !path.includes('.test.'))
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
	errors.push(
		...validateApplicationComposition({
			editorSurfaceSource: readFileSync(
				resolve(repositoryRoot, 'packages/application/src/app/surfaces/EditorSurface.tsx'),
				'utf8'
			),
			projectorFacadeSource: readFileSync(
				resolve(repositoryRoot, 'packages/application/src/project/projectors.ts'),
				'utf8'
			),
			studioApplicationSource: readFileSync(
				resolve(repositoryRoot, 'packages/application/src/app/StudioApplication.tsx'),
				'utf8'
			),
			styleFacadeSource: readFileSync(
				resolve(repositoryRoot, 'packages/application/src/app/studio-shell.css'),
				'utf8'
			)
		})
	)
	if (errors.length > 0) throw new Error(`UI foundation policy failed:\n- ${errors.join('\n- ')}`)
	const message =
		'PASS UI foundation: shared themes, controls, scrollbars, availability-gated commands, one ProjectSession, EN/RU/ES i18n and seven states are present.'
	report(message)
	return message
}

const invoked = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (invoked === import.meta.url) {
	requireLifecycleOwnership('UI foundation policy')
	auditUiFoundation()
}
