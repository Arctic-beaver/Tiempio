import { useMemo, type JSX, type ReactNode } from 'react'
import { catalogs } from './catalogs.js'
import { LocalizationContext, type LocalizationContextValue } from './LocalizationContext.js'
import type { SupportedLocale } from './locales.js'
import { translate } from './translate.js'

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
	const value = useMemo<LocalizationContextValue>(
		() => ({
			locale,
			setLocale: onLocaleChange,
			t: (key, values) => translate(catalogs[locale], key, values)
		}),
		[locale, onLocaleChange]
	)

	return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}
