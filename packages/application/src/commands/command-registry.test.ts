import assert from 'node:assert/strict'
import test from 'node:test'
import {
	activityCommandDefinitions,
	commandDefinition,
	commandDefinitions,
	commandForShortcut,
	commandForView,
	commandIds,
	isCommandId
} from './command-registry.js'

const shortcut = (
	key: string,
	overrides: Partial<Parameters<typeof commandForShortcut>[0]> = {}
): Parameters<typeof commandForShortcut>[0] => ({
	key,
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

test('shortcuts use the platform primary modifier and exact shift state', () => {
	assert.equal(commandForShortcut(shortcut('2', { ctrlKey: true }), 'other'), 'studio.piano-roll')
	assert.equal(commandForShortcut(shortcut('2', { metaKey: true }), 'macos'), 'studio.piano-roll')
	assert.equal(commandForShortcut(shortcut('2', { metaKey: true }), 'other'), null)
	assert.equal(commandForShortcut(shortcut('Escape'), 'other'), 'layout.close-drawer')
	assert.equal(
		commandForShortcut(shortcut('Escape', { shiftKey: true }), 'other'),
		'transport.stop'
	)
	assert.equal(isCommandId('studio.home'), true)
	assert.equal(isCommandId('unknown'), false)
})
