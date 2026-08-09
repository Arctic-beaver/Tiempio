import type { LocalizationCatalog, LocalizationKey } from './catalogs.js'

export type InterpolationValues = Readonly<Record<string, string | number>>

export function translate(
	catalog: LocalizationCatalog,
	key: LocalizationKey,
	values: InterpolationValues = {}
): string {
	return catalog[key].replace(/\{([^{}]+)\}/gu, (placeholder, name: string) =>
		Object.hasOwn(values, name) ? String(values[name]) : placeholder
	)
}
