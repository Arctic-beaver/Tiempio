import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface SoundCharacterViewModel {
	readonly color: 'coral' | 'gold' | 'blue' | 'violet'
	readonly descriptionKey: LocalizationKey
	readonly id: string
	readonly labelKey: LocalizationKey
	readonly name: string
}

export interface SoundChooserViewModel {
	readonly sounds: readonly SoundCharacterViewModel[]
}

export const soundChooserViewModel: SoundChooserViewModel = Object.freeze({
	sounds: Object.freeze([
		Object.freeze({
			id: 'felt-signal',
			name: 'Felt Signal',
			labelKey: 'soundChooser.warm',
			descriptionKey: 'soundChooser.feltSignalDescription',
			color: 'coral'
		}),
		Object.freeze({
			id: 'clear-glass',
			name: 'Clear Glass',
			labelKey: 'soundChooser.clear',
			descriptionKey: 'soundChooser.clearGlassDescription',
			color: 'blue'
		}),
		Object.freeze({
			id: 'low-ember',
			name: 'Low Ember',
			labelKey: 'soundChooser.deep',
			descriptionKey: 'soundChooser.lowEmberDescription',
			color: 'gold'
		}),
		Object.freeze({
			id: 'paper-stars',
			name: 'Paper Stars',
			labelKey: 'soundChooser.grainy',
			descriptionKey: 'soundChooser.paperStarsDescription',
			color: 'violet'
		})
	])
})
