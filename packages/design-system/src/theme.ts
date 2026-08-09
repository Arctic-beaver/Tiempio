export const colorSchemePreferences = Object.freeze(['system', 'light', 'dark'] as const)
export type ColorSchemePreference = (typeof colorSchemePreferences)[number]
export type ResolvedColorScheme = Exclude<ColorSchemePreference, 'system'>

export function resolveColorScheme(
	preference: ColorSchemePreference,
	systemPrefersDark: boolean
): ResolvedColorScheme {
	if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
	return preference
}
