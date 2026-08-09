import assert from 'node:assert/strict'
import test from 'node:test'
import { englishCatalog, russianCatalog, spanishCatalog } from './catalogs.js'
import { createTiempioI18n } from './i18n.js'

test('English, Russian and Spanish catalogs have identical keys and interpolation tokens', () => {
	const englishKeys = Object.keys(englishCatalog).sort()
	for (const catalog of [russianCatalog, spanishCatalog]) {
		assert.deepEqual(Object.keys(catalog).sort(), englishKeys)
	}

	const tokens = (value: string): string[] =>
		[...value.matchAll(/\{\{([^{}]+)\}\}/gu)].map((match) => match[1] ?? '').sort()
	for (const key of englishKeys) {
		const typedKey = key as keyof typeof englishCatalog
		for (const catalog of [russianCatalog, spanishCatalog]) {
			assert.deepEqual(tokens(catalog[typedKey]), tokens(englishCatalog[typedKey]), key)
		}
	}
})

test('i18next interpolates values and switches the bundled language', async () => {
	const i18n = createTiempioI18n('en')
	assert.equal(i18n.t('command.shortcut', { shortcut: 'Ctrl+K' }), 'Shortcut: Ctrl+K')
	await i18n.changeLanguage('ru')
	assert.equal(i18n.t('command.shortcut', { shortcut: 'Ctrl+K' }), 'Сочетание клавиш: Ctrl+K')
	await i18n.changeLanguage('es')
	assert.equal(i18n.t('command.shortcut', { shortcut: 'Ctrl+K' }), 'Atajo: Ctrl+K')
})
