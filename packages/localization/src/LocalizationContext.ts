import { createContext, useCallback, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizationKey } from './catalogs.js'
import type { SupportedLocale } from './locales.js'

export type InterpolationValues = Readonly<Record<string, string | number>>

interface LocalizationControls {
	readonly locale: SupportedLocale
	readonly setLocale: (locale: SupportedLocale) => void
}

export interface LocalizationContextValue extends LocalizationControls {
	readonly t: (key: LocalizationKey, values?: InterpolationValues) => string
}

export const LocalizationContext = createContext<LocalizationControls | null>(null)

export function useLocalization(): LocalizationContextValue {
	const controls = useContext(LocalizationContext)
	const { t: i18nextTranslate } = useTranslation()
	const t = useCallback(
		(key: LocalizationKey, values?: InterpolationValues): string =>
			i18nextTranslate(key, values as Record<string, unknown>),
		[i18nextTranslate]
	)
	const value = useMemo(() => (controls === null ? null : { ...controls, t }), [controls, t])
	if (value === null) {
		throw new Error('useLocalization must be used within LocalizationProvider.')
	}
	return value
}
