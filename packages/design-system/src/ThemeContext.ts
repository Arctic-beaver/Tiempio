import { createContext, useContext } from 'react'
import type { ColorSchemePreference, ResolvedColorScheme } from './theme.js'

export interface ThemeContextValue {
	readonly colorScheme: ColorSchemePreference
	readonly resolvedColorScheme: ResolvedColorScheme
	readonly setColorScheme: (colorScheme: ColorSchemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext)
	if (context === null) throw new Error('useTheme must be used within ThemeProvider.')
	return context
}
