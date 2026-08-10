import assert from 'node:assert/strict'
import test from 'node:test'
import { validateApplicationComposition, validateUiFoundation } from './ui-foundation-policy.mjs'

function validFixture() {
	const applicationSource = [
		...[
			'view-home',
			'view-first-layer',
			'view-sound-chooser',
			'view-piano-roll',
			'view-drums',
			'view-arrangement',
			'view-sound-sculpt'
		].map((view) => `data-testid="${view}"`),
		'CommandProvider CommandIconButton commandForShortcut resolveCommandStates( executeResolvedCommand( aria-disabled={!command.available runtime.commands.api.onRequested ProjectSessionProvider useSyncExternalStore projectStudio('
	].join(' ')
	const tokens = [
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
	].join(':0;')
	return {
		cssFiles: [
			{
				path: 'packages/design-system/src/foundation.css',
				source: `:root[data-theme="light"]{} :root[data-theme="dark"]{} ${tokens} @media (prefers-reduced-motion: reduce){} @media (max-width: 44.999rem){.ti-tooltip[data-placement] .ti-tooltip__content{position: fixed;inset: auto var(--ti-space-3) var(--ti-space-3);}}`
			}
		],
		applicationSource,
		localizationSource:
			"I18nextProvider supportedLocales = Object.freeze(['en', 'ru', 'es'] es: { translation: catalogs.es }",
		desktopSource: "frame: false titleBarStyle: 'hiddenInset' contextIsolation: true"
	}
}

test('accepts the shared UI foundation contract', () => {
	assert.deepEqual(validateUiFoundation(validFixture()), [])
})

test('rejects native selects, component scrollbars and fixed pixel geometry', () => {
	const fixture = validFixture()
	fixture.applicationSource += ' <select>'
	fixture.cssFiles.push({
		path: 'packages/application/view.css',
		source: '*::-webkit-scrollbar{width:8px}'
	})
	const errors = validateUiFoundation(fixture).join('\n')
	assert.match(errors, /native select/u)
	assert.match(errors, /component-local scrollbar/u)
	assert.match(errors, /fixed pixel geometry/u)
})

test('requires compact tooltips to stay inside the viewport', () => {
	const fixture = validFixture()
	fixture.cssFiles[0].source = fixture.cssFiles[0].source.replace(
		'inset: auto var(--ti-space-3) var(--ti-space-3);',
		''
	)
	assert.match(validateUiFoundation(fixture).join('\n'), /compact tooltip containment/u)
})

test('rejects component-local canonical project mutation', () => {
	const fixture = validFixture()
	fixture.applicationSource += ' setNotes('
	assert.match(validateUiFoundation(fixture).join('\n'), /escaped ProjectSession/u)
})

test('rejects command controls that present invented runtime behavior', () => {
	const fixture = validFixture()
	fixture.applicationSource +=
		' <button className="transport-bar__tempo"> t(\'transport.audioShared\') setPlaying((current) => !current)'
	const errors = validateUiFoundation(fixture).join('\n')
	assert.match(errors, /tempo display is interactive/u)
	assert.match(errors, /claims Shared Audio/u)
	assert.match(errors, /playback state is toggled locally/u)
})

test('keeps application, projector and style facades as composition roots', () => {
	const valid = {
		studioApplicationSource:
			'useStudioNavigation() useTransportCommandHandlers() <ActiveStudioView <CommandProvider',
		projectorFacadeSource:
			'projectHome(context) projectLayers(context) projectContext(context) projectPianoRoll(context) projectDrums(context) projectArrangement(context) projectSoundSculpt(context) projectTransport(context)',
		styleFacadeSource: [
			"@import './styles/shell-layout.css';",
			"@import './styles/workflow-views.css';",
			"@import './styles/editor-views.css';",
			"@import './styles/drawers.css';",
			"@import './styles/responsive.css';"
		].join('\n')
	}
	assert.deepEqual(validateApplicationComposition(valid), [])
	const invalid = {
		...valid,
		studioApplicationSource: `${valid.studioApplicationSource} projectSession.dispatch(`,
		projectorFacadeSource: `${valid.projectorFacadeSource} drumRows`,
		styleFacadeSource: `${valid.styleFacadeSource}\n.studio-shell {}`
	}
	const errors = validateApplicationComposition(invalid).join('\n')
	assert.match(errors, /owns implementation detail/u)
	assert.match(errors, /owns feature detail/u)
	assert.match(errors, /only the ordered owned style imports/u)
})
