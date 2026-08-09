export const supportedLocales = Object.freeze(['en', 'ru'] as const)
export type SupportedLocale = (typeof supportedLocales)[number]
