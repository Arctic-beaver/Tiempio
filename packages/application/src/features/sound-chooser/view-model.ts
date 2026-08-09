import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface SoundCharacterViewModel {
	readonly color: 'coral' | 'gold' | 'blue' | 'violet'
	readonly description: string
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
			description: 'Soft edge · close and human',
			color: 'coral'
		}),
		Object.freeze({
			id: 'clear-glass',
			name: 'Clear Glass',
			labelKey: 'soundChooser.clear',
			description: 'Open top · patient decay',
			color: 'blue'
		}),
		Object.freeze({
			id: 'low-ember',
			name: 'Low Ember',
			labelKey: 'soundChooser.deep',
			description: 'Dense center · quiet movement',
			color: 'gold'
		}),
		Object.freeze({
			id: 'paper-stars',
			name: 'Paper Stars',
			labelKey: 'soundChooser.grainy',
			description: 'Dry texture · uneven glow',
			color: 'violet'
		})
	])
})
