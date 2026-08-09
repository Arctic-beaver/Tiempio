import { createInstance, type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { catalogs } from './catalogs.js'
import type { SupportedLocale } from './locales.js'

export function createTiempioI18n(locale: SupportedLocale): i18n {
	const instance = createInstance()
	void instance.use(initReactI18next).init({
		fallbackLng: 'en',
		initAsync: false,
		interpolation: { escapeValue: false },
		keySeparator: false,
		lng: locale,
		resources: {
			en: { translation: catalogs.en },
			ru: { translation: catalogs.ru },
			es: { translation: catalogs.es }
		},
		returnNull: false,
		supportedLngs: ['en', 'ru', 'es']
	})
	return instance
}
