import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface LayerRoleViewModel {
	readonly description: string
	readonly id: 'melody' | 'chords' | 'bass' | 'drums'
	readonly labelKey: LocalizationKey
}

export interface FirstLayerViewModel {
	readonly roles: readonly LayerRoleViewModel[]
}

export const firstLayerViewModel: FirstLayerViewModel = Object.freeze({
	roles: Object.freeze([
		Object.freeze({
			id: 'melody',
			labelKey: 'firstLayer.melody',
			description: 'A line to remember'
		}),
		Object.freeze({
			id: 'chords',
			labelKey: 'firstLayer.chords',
			description: 'Color and emotional weight'
		}),
		Object.freeze({ id: 'bass', labelKey: 'firstLayer.bass', description: 'A grounded pulse' }),
		Object.freeze({
			id: 'drums',
			labelKey: 'firstLayer.drums',
			description: 'Movement and time'
		})
	])
})
