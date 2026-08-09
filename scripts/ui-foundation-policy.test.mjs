import assert from 'node:assert/strict'
import test from 'node:test'
import { validateUiFoundation } from './ui-foundation-policy.mjs'

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
		'CommandProvider commandForShortcut runtime.commands.api.onRequested ProjectSessionProvider useSyncExternalStore projectStudio('
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
				source: `:root[data-theme="light"]{} :root[data-theme="dark"]{} ${tokens} @media (prefers-reduced-motion: reduce){}`
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

test('rejects component-local canonical project mutation', () => {
	const fixture = validFixture()
	fixture.applicationSource += ' setNotes('
	assert.match(validateUiFoundation(fixture).join('\n'), /escaped ProjectSession/u)
})
