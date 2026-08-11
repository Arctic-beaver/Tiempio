import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { ThemeProvider, type ColorSchemePreference } from '../../../design-system/src/index.js'
import { LocalizationProvider, type SupportedLocale } from '../../../localization/src/index.js'
import {
	PresentationSettingsContext,
	type PresentationSettingsContextValue,
	type SettingsPersistenceState
} from './PresentationSettingsContext.js'
import { useApplicationRuntime } from './RuntimeContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
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
	const controller = useApplicationRuntimeController()
	const settingsAvailable = runtime.settings.availability === 'available'
	const [colorScheme, setColorSchemeState] = useState<ColorSchemePreference>(initialColorScheme)
	const [locale, setLocale] = useState<SupportedLocale>(initialLocale)
	const [metronomeEnabled, setMetronomeEnabledState] = useState(false)
	const [metronomeVolume, setMetronomeVolumeState] = useState(0.65)
	const [shortcutOverrides, setShortcutOverrides] = useState<CommandShortcutOverrides>({})
	const colorSchemeReference = useRef(colorScheme)
	const shortcutOverridesReference = useRef(shortcutOverrides)
	const metronomeEnabledReference = useRef(metronomeEnabled)
	const metronomeVolumeReference = useRef(metronomeVolume)
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
				metronomeEnabledReference.current = result.value.metronome.enabled
				metronomeVolumeReference.current = result.value.metronome.volume
				setColorSchemeState(result.value.colorScheme)
				setShortcutOverrides(loadedOverrides)
				setMetronomeEnabledState(result.value.metronome.enabled)
				setMetronomeVolumeState(result.value.metronome.volume)
				controller.setMetronomeEnabled(result.value.metronome.enabled)
				controller.setMetronomeVolume(result.value.metronome.volume)
			}
			setPersistenceState(result.ok ? 'saved' : 'failed')
		})
		return () => {
			active = false
		}
	}, [controller, runtime.settings])

	const persist = useCallback(
		(
			nextColorScheme: ColorSchemePreference,
			nextOverrides: CommandShortcutOverrides,
			nextMetronomeEnabled: boolean,
			nextMetronomeVolume: number
		): void => {
			if (runtime.settings.availability !== 'available') {
				setPersistenceState('session-only')
				return
			}
			const generation = ++saveGenerationReference.current
			setPersistenceState('loading')
			void runtime.settings.api
				.set({
					version: 3,
					colorScheme: nextColorScheme,
					metronome: {
						enabled: nextMetronomeEnabled,
						volume: nextMetronomeVolume
					},
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
			persist(
				nextColorScheme,
				shortcutOverridesReference.current,
				metronomeEnabledReference.current,
				metronomeVolumeReference.current
			)
		},
		[persist]
	)

	const updateShortcuts = useCallback(
		(nextOverrides: CommandShortcutOverrides): void => {
			shortcutOverridesReference.current = nextOverrides
			setShortcutOverrides(nextOverrides)
			persist(
				colorSchemeReference.current,
				nextOverrides,
				metronomeEnabledReference.current,
				metronomeVolumeReference.current
			)
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

	const setMetronomeEnabled = useCallback(
		(enabled: boolean): void => {
			metronomeEnabledReference.current = enabled
			setMetronomeEnabledState(enabled)
			controller.setMetronomeEnabled(enabled)
			persist(
				colorSchemeReference.current,
				shortcutOverridesReference.current,
				enabled,
				metronomeVolumeReference.current
			)
		},
		[controller, persist]
	)

	const setMetronomeVolume = useCallback(
		(volume: number): void => {
			const nextVolume = Math.min(1, Math.max(0, volume))
			metronomeVolumeReference.current = nextVolume
			setMetronomeVolumeState(nextVolume)
			controller.setMetronomeVolume(nextVolume)
			persist(
				colorSchemeReference.current,
				shortcutOverridesReference.current,
				metronomeEnabledReference.current,
				nextVolume
			)
		},
		[controller, persist]
	)

	const value = useMemo<PresentationSettingsContextValue>(
		() => ({
			colorScheme,
			locale,
			metronomeEnabled,
			metronomeVolume,
			persistenceState,
			resetAllShortcuts,
			resetShortcutBindings,
			setColorScheme,
			setLocale,
			setMetronomeEnabled,
			setMetronomeVolume,
			setShortcutBindings,
			shortcutOverrides
		}),
		[
			colorScheme,
			locale,
			metronomeEnabled,
			metronomeVolume,
			persistenceState,
			resetAllShortcuts,
			resetShortcutBindings,
			setColorScheme,
			setMetronomeEnabled,
			setMetronomeVolume,
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
