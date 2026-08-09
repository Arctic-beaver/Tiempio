import { createContext, useContext } from 'react'
import type { LocalizationKey } from './catalogs.js'
import type { SupportedLocale } from './locales.js'
import type { InterpolationValues } from './translate.js'

export interface LocalizationContextValue {
	readonly locale: SupportedLocale
	readonly setLocale: (locale: SupportedLocale) => void
	readonly t: (key: LocalizationKey, values?: InterpolationValues) => string
}

export const LocalizationContext = createContext<LocalizationContextValue | null>(null)

export function useLocalization(): LocalizationContextValue {
	const context = useContext(LocalizationContext)
	if (context === null) {
		throw new Error('useLocalization must be used within LocalizationProvider.')
	}
	return context
}
