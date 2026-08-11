import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { ThemeProvider, type ColorSchemePreference } from '../../../design-system/src/index.js'
import { LocalizationProvider, type SupportedLocale } from '../../../localization/src/index.js'
import {
	PresentationSettingsContext,
	type PresentationSettingsContextValue,
	type SettingsPersistenceState
} from './PresentationSettingsContext.js'
import { useApplicationRuntime } from './RuntimeContext.js'
import type {
	CommandId,
	CommandShortcut,
	CommandShortcutOverrides
} from '../commands/command-registry.js'
import {
	deserializeShortcutOverrides,
	serializeShortcutOverrides,
	withShortcutBindings
} from '../commands/shortcut-settings.js'

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
	const [shortcutOverrides, setShortcutOverrides] = useState<CommandShortcutOverrides>({})
	const colorSchemeReference = useRef(colorScheme)
	const shortcutOverridesReference = useRef(shortcutOverrides)
	const saveGenerationReference = useRef(0)
	const [persistenceState, setPersistenceState] = useState<SettingsPersistenceState>(
		settingsAvailable ? 'loading' : 'session-only'
	)

	useEffect(() => {
		if (runtime.settings.availability !== 'available') return
		let active = true
		void runtime.settings.api.get().then((result) => {
			if (!active) return
			if (result.ok) {
				const loadedOverrides = deserializeShortcutOverrides(result.value)
				colorSchemeReference.current = result.value.colorScheme
				shortcutOverridesReference.current = loadedOverrides
				setColorSchemeState(result.value.colorScheme)
				setShortcutOverrides(loadedOverrides)
			}
			setPersistenceState(result.ok ? 'saved' : 'failed')
		})
		return () => {
			active = false
		}
	}, [runtime.settings])

	const persist = useCallback(
		(nextColorScheme: ColorSchemePreference, nextOverrides: CommandShortcutOverrides): void => {
			if (runtime.settings.availability !== 'available') {
				setPersistenceState('session-only')
				return
			}
			const generation = ++saveGenerationReference.current
			setPersistenceState('loading')
			void runtime.settings.api
				.set({
					version: 2,
					colorScheme: nextColorScheme,
					shortcutOverrides: serializeShortcutOverrides(nextOverrides)
				})
				.then((result) => {
					if (generation === saveGenerationReference.current) {
						setPersistenceState(result.ok ? 'saved' : 'failed')
					}
				})
		},
		[runtime.settings]
	)

	const setColorScheme = useCallback(
		(nextColorScheme: ColorSchemePreference): void => {
			colorSchemeReference.current = nextColorScheme
			setColorSchemeState(nextColorScheme)
			persist(nextColorScheme, shortcutOverridesReference.current)
		},
		[persist]
	)

	const updateShortcuts = useCallback(
		(nextOverrides: CommandShortcutOverrides): void => {
			shortcutOverridesReference.current = nextOverrides
			setShortcutOverrides(nextOverrides)
			persist(colorSchemeReference.current, nextOverrides)
		},
		[persist]
	)

	const setShortcutBindings = useCallback(
		(commandId: CommandId, bindings: readonly CommandShortcut[]): void =>
			updateShortcuts(
				withShortcutBindings(shortcutOverridesReference.current, commandId, bindings)
			),
		[updateShortcuts]
	)

	const resetShortcutBindings = useCallback(
		(commandId: CommandId): void => {
			const nextOverrides: Partial<Record<CommandId, readonly CommandShortcut[]>> = {
				...shortcutOverridesReference.current
			}
			delete nextOverrides[commandId]
			updateShortcuts(Object.freeze(nextOverrides))
		},
		[updateShortcuts]
	)

	const resetAllShortcuts = useCallback((): void => updateShortcuts({}), [updateShortcuts])

	const value = useMemo<PresentationSettingsContextValue>(
		() => ({
			colorScheme,
			locale,
			persistenceState,
			resetAllShortcuts,
			resetShortcutBindings,
			setColorScheme,
			setLocale,
			setShortcutBindings,
			shortcutOverrides
		}),
		[
			colorScheme,
			locale,
			persistenceState,
			resetAllShortcuts,
			resetShortcutBindings,
			setColorScheme,
			setShortcutBindings,
			shortcutOverrides
		]
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
