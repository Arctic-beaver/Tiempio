import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './ThemeContext.js'
import { resolveColorScheme, type ColorSchemePreference } from './theme.js'

export interface ThemeProviderProperties {
	readonly children: ReactNode
	readonly colorScheme: ColorSchemePreference
	readonly onColorSchemeChange: (colorScheme: ColorSchemePreference) => void
}

const darkSchemeQuery = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
	return typeof window === 'undefined' ? false : window.matchMedia(darkSchemeQuery).matches
}

export function ThemeProvider({
	children,
	colorScheme,
	onColorSchemeChange
}: ThemeProviderProperties): JSX.Element {
	const [systemDark, setSystemDark] = useState(systemPrefersDark)
	const resolvedColorScheme = resolveColorScheme(colorScheme, systemDark)

	useEffect(() => {
		const mediaQuery = window.matchMedia(darkSchemeQuery)
		const updateSystemScheme = (event: MediaQueryListEvent): void =>
			setSystemDark(event.matches)
		mediaQuery.addEventListener('change', updateSystemScheme)
		return () => mediaQuery.removeEventListener('change', updateSystemScheme)
	}, [])

	useEffect(() => {
		const root = document.documentElement
		root.dataset.colorScheme = colorScheme
		root.dataset.theme = resolvedColorScheme
		root.style.colorScheme = resolvedColorScheme
	}, [colorScheme, resolvedColorScheme])

	const value = useMemo<ThemeContextValue>(
		() => ({
			colorScheme,
			resolvedColorScheme,
			setColorScheme: onColorSchemeChange
		}),
		[colorScheme, onColorSchemeChange, resolvedColorScheme]
	)

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
