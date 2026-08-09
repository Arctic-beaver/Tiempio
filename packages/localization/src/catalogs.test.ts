import assert from 'node:assert/strict'
import test from 'node:test'
import { englishCatalog, russianCatalog } from './catalogs.js'
import { translate } from './translate.js'

test('English and Russian catalogs have identical keys and interpolation tokens', () => {
	const englishKeys = Object.keys(englishCatalog).sort()
	const russianKeys = Object.keys(russianCatalog).sort()
	assert.deepEqual(russianKeys, englishKeys)

	const tokens = (value: string): string[] =>
		[...value.matchAll(/\{([^{}]+)\}/gu)].map((match) => match[1] ?? '').sort()
	for (const key of englishKeys) {
		const typedKey = key as keyof typeof englishCatalog
		assert.deepEqual(tokens(russianCatalog[typedKey]), tokens(englishCatalog[typedKey]), key)
	}
})

test('translator interpolates known values and preserves unknown placeholders', () => {
	assert.equal(
		translate(englishCatalog, 'command.shortcut', { shortcut: 'Ctrl+K' }),
		'Shortcut: Ctrl+K'
	)
	assert.equal(translate(englishCatalog, 'command.shortcut'), 'Shortcut: {shortcut}')
})
