import assert from 'node:assert/strict'
import test from 'node:test'
import {
	activityCommandDefinitions,
	commandDefinition,
	commandDefinitions,
	commandForShortcut,
	commandForView,
	commandIds,
	isCommandId,
	shortcutConflict,
	shortcutsForCommand
} from './command-registry.js'

const shortcut = (
	code: string,
	overrides: Partial<Parameters<typeof commandForShortcut>[0]> = {}
): Parameters<typeof commandForShortcut>[0] => ({
	code,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	...overrides
})

test('command ids, definitions and activity placements stay unique', () => {
	assert.equal(new Set(commandIds).size, commandIds.length)
	assert.equal(new Set(commandDefinitions.map(({ id }) => id)).size, commandDefinitions.length)
	assert.deepEqual(
		activityCommandDefinitions.map(({ view }) => view),
		['home', 'piano-roll', 'drums', 'arrangement', 'sound-sculpt']
	)
	assert.equal(
		commandDefinitions.every(({ disabledReasonKey }) => disabledReasonKey.length > 0),
		true
	)
	assert.equal(commandDefinition('transport.stop').availability, 'engine')
})

test('every studio view resolves through the registry', () => {
	assert.equal(commandForView('first-layer'), 'studio.first-layer')
	assert.equal(commandForView('sound-chooser'), 'studio.sound-chooser')
	assert.equal(commandForView('sound-sculpt'), 'studio.sound-sculpt')
})

test('shortcuts use physical codes, platform primary and exact modifier state', () => {
	assert.equal(
		commandForShortcut(shortcut('Digit2', { ctrlKey: true }), 'other'),
		'studio.piano-roll'
	)
	assert.equal(
		commandForShortcut(shortcut('Digit2', { metaKey: true }), 'macos'),
		'studio.piano-roll'
	)
	assert.equal(commandForShortcut(shortcut('Digit2', { metaKey: true }), 'other'), null)
	assert.equal(commandForShortcut(shortcut('Escape'), 'other'), 'layout.close-drawer')
	assert.equal(
		commandForShortcut(shortcut('Escape', { shiftKey: true }), 'other'),
		'transport.stop'
	)
	assert.equal(isCommandId('studio.home'), true)
	assert.equal(isCommandId('unknown'), false)
})

test('undo and redo expose multiple platform-compatible bindings', () => {
	assert.equal(commandForShortcut(shortcut('KeyZ', { ctrlKey: true }), 'other'), 'project.undo')
	assert.equal(
		commandForShortcut(shortcut('KeyZ', { ctrlKey: true, shiftKey: true }), 'other'),
		'project.redo'
	)
	assert.equal(commandForShortcut(shortcut('KeyY', { ctrlKey: true }), 'other'), 'project.redo')
	assert.equal(commandForShortcut(shortcut('KeyY', { metaKey: true }), 'macos'), null)
	assert.equal(
		commandForShortcut(shortcut('KeyZ', { metaKey: true, shiftKey: true }), 'macos'),
		'project.redo'
	)
})

test('custom physical bindings stay scoped and report conflicts explicitly', () => {
	const overrides = {
		'project.undo': [{ code: 'KeyU', primary: true }],
		'project.redo': [{ code: 'KeyR', primary: true }]
	} as const
	assert.equal(
		commandForShortcut(shortcut('KeyU', { ctrlKey: true }), 'other', ['global'], overrides),
		'project.undo'
	)
	assert.equal(
		commandForShortcut(shortcut('KeyZ', { ctrlKey: true }), 'other', ['global'], overrides),
		null
	)
	assert.deepEqual(shortcutsForCommand('project.redo', overrides), [
		{ code: 'KeyR', primary: true }
	])
	assert.equal(
		shortcutConflict('project.redo', { code: 'KeyU', primary: true }, 'global', overrides),
		'project.undo'
	)
	assert.equal(
		shortcutConflict(
			'project.redo',
			{ code: 'KeyU', primary: true, platform: 'other' },
			'global',
			overrides
		),
		'project.undo'
	)
})
