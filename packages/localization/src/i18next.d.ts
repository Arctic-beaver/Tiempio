import 'i18next'
import type { englishCatalog } from './catalogs.js'

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'translation'
		resources: {
			translation: typeof englishCatalog
		}
	}
}
