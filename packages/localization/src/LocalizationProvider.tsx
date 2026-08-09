import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createTiempioI18n } from './i18n.js'
import { LocalizationContext } from './LocalizationContext.js'
import type { SupportedLocale } from './locales.js'

export interface LocalizationProviderProperties {
	readonly children: ReactNode
	readonly locale: SupportedLocale
	readonly onLocaleChange: (locale: SupportedLocale) => void
}

export function LocalizationProvider({
	children,
	locale,
	onLocaleChange
}: LocalizationProviderProperties): JSX.Element {
	const [instance] = useState(() => createTiempioI18n(locale))
	const controls = useMemo(
		() => ({ locale, setLocale: onLocaleChange }),
		[locale, onLocaleChange]
	)

	useEffect(() => {
		if (instance.resolvedLanguage !== locale) void instance.changeLanguage(locale)
	}, [instance, locale])

	useEffect(() => {
		document.documentElement.lang = locale
	}, [locale])

	return (
		<I18nextProvider i18n={instance}>
			<LocalizationContext.Provider value={controls}>{children}</LocalizationContext.Provider>
		</I18nextProvider>
	)
}
