import './foundation.css'

export { IconButton, type IconButtonProperties } from './IconButton.js'
export { Popover, type PopoverProperties } from './Popover.js'
export { ScrollSurface, type ScrollSurfaceProperties } from './ScrollSurface.js'
export { SemanticSlider, type SemanticSliderProperties } from './SemanticSlider.js'
export { Select, type SelectOption, type SelectProperties } from './Select.js'
export { TextButton, type TextButtonProperties } from './TextButton.js'
export { useTheme, type ThemeContextValue } from './ThemeContext.js'
export { ThemeProvider, type ThemeProviderProperties } from './ThemeProvider.js'
export { Tooltip, type TooltipProperties } from './Tooltip.js'
export {
	colorSchemePreferences,
	resolveColorScheme,
	type ColorSchemePreference,
	type ResolvedColorScheme
} from './theme.js'

export const designSystemVersion = 2 as const
