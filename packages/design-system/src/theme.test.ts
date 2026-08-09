import assert from 'node:assert/strict'
import test from 'node:test'
import { colorSchemePreferences, resolveColorScheme } from './theme.js'

test('explicit color schemes do not depend on the operating-system preference', () => {
	assert.equal(resolveColorScheme('light', true), 'light')
	assert.equal(resolveColorScheme('dark', false), 'dark')
})

test('system color scheme follows the operating-system preference', () => {
	assert.equal(resolveColorScheme('system', false), 'light')
	assert.equal(resolveColorScheme('system', true), 'dark')
	assert.deepEqual(colorSchemePreferences, ['system', 'light', 'dark'])
})
