import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve('.')
const evidenceRoot = resolve(repositoryRoot, 'docs/evidence/prototype-visual-reference')
const historicalManifestPath = resolve(evidenceRoot, 'manifest.json')
const songCompositionEvidenceRoot = resolve(
	repositoryRoot,
	'docs/evidence/song-composition-visual-reference'
)
const currentManifestPath = resolve(songCompositionEvidenceRoot, 'manifest.json')
const prototypePath = resolve(repositoryRoot, 'docs/tiempio_ux_prototype.html')
const responsiveStylesPath = resolve(
	repositoryRoot,
	'packages/application/src/app/styles/responsive.css'
)
const editorStylesPath = resolve(
	repositoryRoot,
	'packages/application/src/app/styles/editor-views.css'
)
const workflowStylesPath = resolve(
	repositoryRoot,
	'packages/application/src/app/styles/workflow-views.css'
)
const soundChooserPath = resolve(
	repositoryRoot,
	'packages/application/src/features/sound-chooser/SoundChooserView.tsx'
)
const performanceInputSurfacePath = resolve(
	repositoryRoot,
	'packages/application/src/performance/usePerformanceInputSurface.ts'
)

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex').toUpperCase()
}

async function sourceFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = resolve(directory, entry.name)
			return entry.isDirectory() ? sourceFiles(path) : [path]
		})
	)
	return files.flat()
}

test('locks the exact prototype revision and its seven application states', async () => {
	const manifest = JSON.parse(await readFile(currentManifestPath, 'utf8'))
	const prototype = await readFile(prototypePath)
	assert.equal(sha256(prototype), manifest.referenceSha256)

	const source = prototype.toString('utf8')
	const states = [...source.matchAll(/data-screen="([^"]+)"/gu)].map((match) => match[1])
	assert.deepEqual(states, ['home', 'empty', 'sound', 'piano', 'drums', 'arrange', 'sculpt'])
	assert.match(source, /<section class="app-window" id="appWindow">/u)
})

test('preserves the complete light and dark reference capture matrix', async () => {
	const manifest = JSON.parse(await readFile(historicalManifestPath, 'utf8'))
	assert.equal(manifest.images.length, 14)

	const expectedStates = [
		'home',
		'first-layer',
		'sound-chooser',
		'piano-roll',
		'drums',
		'arrangement',
		'sound-sculpt'
	]
	for (const scheme of ['light', 'dark']) {
		assert.deepEqual(
			manifest.images.filter((image) => image.scheme === scheme).map((image) => image.state),
			expectedStates
		)
	}

	for (const image of manifest.images) {
		const bytes = await readFile(resolve(evidenceRoot, image.path))
		assert.equal(bytes.length, image.bytes, image.path)
		assert.equal(sha256(bytes), image.sha256, image.path)
		assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', image.path)
		assert.equal(bytes.readUInt32BE(16), image.width, image.path)
		assert.equal(bytes.readUInt32BE(20), image.height, image.path)
	}
})

test('preserves the approved linked-bricks and song reference pair', async () => {
	const manifest = JSON.parse(await readFile(currentManifestPath, 'utf8'))
	assert.equal(manifest.authorityScope, 'state-06-linked-bricks-and-song')
	assert.deepEqual(
		manifest.images.map((image) => [image.state, image.scheme]),
		[
			['linked-bricks-song', 'light'],
			['linked-bricks-song', 'dark']
		]
	)

	for (const image of manifest.images) {
		const bytes = await readFile(resolve(songCompositionEvidenceRoot, image.path))
		assert.equal(bytes.length, image.bytes, image.path)
		assert.equal(sha256(bytes), image.sha256, image.path)
		assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', image.path)
		assert.equal(bytes.readUInt32BE(16), image.width, image.path)
		assert.equal(bytes.readUInt32BE(20), image.height, image.path)
	}
})

test('keeps documentation harness classes out of production application sources', async () => {
	const files = await sourceFiles(resolve(repositoryRoot, 'packages/application/src'))
	const source = (
		await Promise.all(
			files
				.filter((path) => /\.(?:css|ts|tsx)$/u.test(path))
				.map((path) => readFile(path, 'utf8'))
		)
	).join('\n')
	for (const harnessClass of ['prototype-shell', 'prototype-bar', 'state-tabs', 'ux-note']) {
		assert.doesNotMatch(source, new RegExp(harnessClass, 'u'))
	}
})

test('preserves the prototype compact transition for every composition family', async () => {
	const responsiveStyles = await readFile(responsiveStylesPath, 'utf8')
	const editorStyles = await readFile(editorStylesPath, 'utf8')
	for (const selector of [
		'.home',
		'.recent-panel',
		'.project-space',
		'.chooser-layout',
		'.semantic-panel'
	]) {
		assert.match(responsiveStyles, new RegExp(`\\${selector}`, 'u'), selector)
	}
	for (const selector of [
		'.piano-area',
		'.harmony-panel',
		'.drum-layout',
		'.pattern-panel',
		'.arrange-body',
		'.arrange-inspector',
		'.sculpt-layout',
		'.character-panel'
	]) {
		assert.match(editorStyles, new RegExp(`\\${selector}`, 'u'), selector)
	}
	assert.match(responsiveStyles, /@media \(max-width: 56\.25rem\)/u)
	assert.match(editorStyles, /@media \(max-width: 56\.25rem\)/u)
})

test('keeps Use sound in the prototype title row and the keyboard dock unframed', async () => {
	const soundChooser = await readFile(soundChooserPath, 'utf8')
	const performanceInputSurface = await readFile(performanceInputSurfacePath, 'utf8')
	const workflowStyles = await readFile(workflowStylesPath, 'utf8')
	const titleStart = soundChooser.indexOf('<div className="sound-title">')
	const auditionStart = soundChooser.indexOf('<div className="audition">', titleStart)
	const dockStart = soundChooser.indexOf('<div className="sound-mapping-dock"', auditionStart)
	const dockEnd = soundChooser.indexOf('<aside className="semantic-panel">', dockStart)
	assert.ok(titleStart >= 0 && auditionStart > titleStart)
	assert.ok(dockStart > auditionStart && dockEnd > dockStart)
	assert.match(soundChooser.slice(titleStart, auditionStart), /sound-title__use/u)
	assert.match(soundChooser.slice(titleStart, auditionStart), /soundChooser\.useSound/u)
	assert.doesNotMatch(soundChooser.slice(dockStart, dockEnd), /soundChooser\.useSound/u)
	assert.doesNotMatch(workflowStyles, /sound-mapping-dock__use/u)
	assert.match(
		workflowStyles,
		/\.sound-mapping-dock\s*\{[^}]*width:\s*min\(100%, 45rem\);[^}]*border:\s*0;[^}]*background:\s*transparent;/su
	)
	assert.match(
		workflowStyles,
		/\.sound-mapping-dock__tabs > button\s*\{[^}]*border:\s*var\(--ti-hairline\) solid var\(--ti-border-strong\);[^}]*background:\s*var\(--ti-surface-1\);[^}]*color:\s*var\(--ti-text\);/su
	)
	assert.match(
		workflowStyles,
		/\.sound-mapping-dock__tabs > button\[aria-selected='true'\]\s*\{[^}]*border-color:\s*var\(--ti-accent\);[^}]*background:\s*var\(--ti-accent-soft\);[^}]*color:\s*var\(--ti-accent-strong\);/su
	)
	assert.match(soundChooser, /<PerformanceKeyboard\s+keyboardCapture="document"/u)
	assert.match(performanceInputSurface, /document\.addEventListener\('keydown', handleKeyDown\)/u)
	assert.match(performanceInputSurface, /window\.addEventListener\('blur', releaseOwnedNotes\)/u)
})
