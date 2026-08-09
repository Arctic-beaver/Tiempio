import { createContext, useContext } from 'react'
import type { ColorSchemePreference } from '../../../design-system/src/index.js'
import type { SupportedLocale } from '../../../localization/src/index.js'

export type SettingsPersistenceState = 'session-only' | 'loading' | 'saved' | 'failed'

export interface PresentationSettingsContextValue {
	readonly colorScheme: ColorSchemePreference
	readonly locale: SupportedLocale
	readonly persistenceState: SettingsPersistenceState
	readonly setColorScheme: (colorScheme: ColorSchemePreference) => void
	readonly setLocale: (locale: SupportedLocale) => void
}

export const PresentationSettingsContext = createContext<PresentationSettingsContextValue | null>(
	null
)

export function usePresentationSettings(): PresentationSettingsContextValue {
	const context = useContext(PresentationSettingsContext)
	if (context === null) {
		throw new Error('usePresentationSettings must be used within PresentationSettingsProvider.')
	}
	return context
}
