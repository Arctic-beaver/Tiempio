export const supportedLocales = Object.freeze(['en', 'ru', 'es'] as const)
export type SupportedLocale = (typeof supportedLocales)[number]
