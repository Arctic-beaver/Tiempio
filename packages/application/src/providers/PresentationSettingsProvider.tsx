import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { ThemeProvider, type ColorSchemePreference } from '../../../design-system/src/index.js'
import { LocalizationProvider, type SupportedLocale } from '../../../localization/src/index.js'
import {
	PresentationSettingsContext,
	type PresentationSettingsContextValue,
	type SettingsPersistenceState
} from './PresentationSettingsContext.js'
import { useApplicationRuntime } from './RuntimeContext.js'

export interface PresentationSettingsProviderProperties {
	readonly children: ReactNode
	readonly initialColorScheme?: ColorSchemePreference
	readonly initialLocale?: SupportedLocale
}

function preferredLocale(): SupportedLocale {
	if (typeof navigator === 'undefined') return 'en'
	const language = navigator.language.toLowerCase()
	if (language.startsWith('ru')) return 'ru'
	if (language.startsWith('es')) return 'es'
	return 'en'
}

export function PresentationSettingsProvider({
	children,
	initialColorScheme = 'system',
	initialLocale = preferredLocale()
}: PresentationSettingsProviderProperties): JSX.Element {
	const runtime = useApplicationRuntime()
	const settingsAvailable = runtime.settings.availability === 'available'
	const [colorScheme, setColorSchemeState] = useState<ColorSchemePreference>(initialColorScheme)
	const [locale, setLocale] = useState<SupportedLocale>(initialLocale)
	const [persistenceState, setPersistenceState] = useState<SettingsPersistenceState>(
		settingsAvailable ? 'loading' : 'session-only'
	)

	useEffect(() => {
		if (runtime.settings.availability !== 'available') return
		let active = true
		void runtime.settings.api.get().then((result) => {
			if (!active) return
			if (result.ok) setColorSchemeState(result.value.colorScheme)
			setPersistenceState(result.ok ? 'saved' : 'failed')
		})
		return () => {
			active = false
		}
	}, [runtime.settings])

	const setColorScheme = useCallback(
		(nextColorScheme: ColorSchemePreference): void => {
			setColorSchemeState(nextColorScheme)
			if (runtime.settings.availability !== 'available') {
				setPersistenceState('session-only')
				return
			}
			setPersistenceState('loading')
			void runtime.settings.api
				.set({ version: 1, colorScheme: nextColorScheme })
				.then((result) => setPersistenceState(result.ok ? 'saved' : 'failed'))
		},
		[runtime.settings]
	)

	const value = useMemo<PresentationSettingsContextValue>(
		() => ({ colorScheme, locale, persistenceState, setColorScheme, setLocale }),
		[colorScheme, locale, persistenceState, setColorScheme]
	)

	return (
		<PresentationSettingsContext.Provider value={value}>
			<ThemeProvider colorScheme={colorScheme} onColorSchemeChange={setColorScheme}>
				<LocalizationProvider locale={locale} onLocaleChange={setLocale}>
					{children}
				</LocalizationProvider>
			</ThemeProvider>
		</PresentationSettingsContext.Provider>
	)
}
