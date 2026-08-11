import assert from 'node:assert/strict'
import test from 'node:test'
import {
	deserializeShortcutOverrides,
	isReservedShortcut,
	serializeShortcutOverrides,
	shortcutFromEvent,
	withShortcutBindings,
	withoutShortcutBinding
} from './shortcut-settings.js'

test('captures physical keys independent of the active keyboard layout', () => {
	assert.deepEqual(
		shortcutFromEvent(
			{ altKey: true, code: 'KeyA', ctrlKey: false, metaKey: false, shiftKey: false },
			'other'
		),
		{ alt: true, code: 'KeyA', platform: 'all', primary: false, shift: false }
	)
})

test('round-trips known overrides and ignores unknown persisted commands', () => {
	const overrides = {
		'note.move-left': [{ code: 'KeyH', alt: true }],
		'note.delete': []
	} as const
	const serialized = serializeShortcutOverrides(overrides)
	assert.deepEqual(
		deserializeShortcutOverrides({
			version: 2,
			colorScheme: 'dark',
			shortcutOverrides: [...serialized, { commandId: 'removed.command', bindings: [] }]
		}),
		{
			'note.move-left': [
				{ alt: true, code: 'KeyH', platform: 'all', primary: false, shift: false }
			],
			'note.delete': []
		}
	)
})

test('deduplicates and removes individual bindings without resetting the command', () => {
	const shortcut = { code: 'KeyH', alt: true } as const
	const overrides = withShortcutBindings({}, 'note.move-left', [shortcut, shortcut])
	assert.equal(overrides['note.move-left']?.length, 1)
	assert.deepEqual(withoutShortcutBinding(overrides, 'note.move-left', shortcut), {
		'note.move-left': []
	})
})

test('rejects common operating-system close shortcuts', () => {
	assert.equal(isReservedShortcut({ code: 'F4', alt: true }, 'other'), true)
	assert.equal(isReservedShortcut({ code: 'KeyQ', primary: true }, 'macos'), true)
	assert.equal(isReservedShortcut({ code: 'KeyK', primary: true }, 'other'), false)
})
