import { createContext, useContext } from 'react'
import type { ColorSchemePreference } from '../../../design-system/src/index.js'
import type { SupportedLocale } from '../../../localization/src/index.js'
import type {
	CommandId,
	CommandShortcut,
	CommandShortcutOverrides
} from '../commands/command-registry.js'

export type SettingsPersistenceState = 'session-only' | 'loading' | 'saved' | 'failed'

export interface PresentationSettingsContextValue {
	readonly colorScheme: ColorSchemePreference
	readonly locale: SupportedLocale
	readonly metronomeEnabled: boolean
	readonly metronomeVolume: number
	readonly persistenceState: SettingsPersistenceState
	readonly resetAllShortcuts: () => void
	readonly resetShortcutBindings: (commandId: CommandId) => void
	readonly setColorScheme: (colorScheme: ColorSchemePreference) => void
	readonly setLocale: (locale: SupportedLocale) => void
	readonly setMetronomeEnabled: (enabled: boolean) => void
	readonly setMetronomeVolume: (volume: number) => void
	readonly setShortcutBindings: (
		commandId: CommandId,
		bindings: readonly CommandShortcut[]
	) => void
	readonly shortcutOverrides: CommandShortcutOverrides
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
