import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface LayerRoleViewModel {
	readonly descriptionKey: LocalizationKey
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
			descriptionKey: 'firstLayer.melodyDescription'
		}),
		Object.freeze({
			id: 'chords',
			labelKey: 'firstLayer.chords',
			descriptionKey: 'firstLayer.chordsDescription'
		}),
		Object.freeze({
			id: 'bass',
			labelKey: 'firstLayer.bass',
			descriptionKey: 'firstLayer.bassDescription'
		}),
		Object.freeze({
			id: 'drums',
			labelKey: 'firstLayer.drums',
			descriptionKey: 'firstLayer.drumsDescription'
		})
	])
})
