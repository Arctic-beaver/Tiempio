import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface SculptDimensionViewModel {
	readonly id: 'brightness' | 'movement' | 'space' | 'texture'
	readonly labelKey: LocalizationKey
	readonly value: number
}

export interface SoundSculptViewModel {
	readonly dimensions: readonly SculptDimensionViewModel[]
	readonly soundName: string
}

export const soundSculptViewModel: SoundSculptViewModel = Object.freeze({
	soundName: 'Felt Signal',
	dimensions: Object.freeze([
		Object.freeze({ id: 'brightness', labelKey: 'sculpt.brightness', value: 58 }),
		Object.freeze({ id: 'movement', labelKey: 'sculpt.movement', value: 36 }),
		Object.freeze({ id: 'space', labelKey: 'sculpt.space', value: 72 }),
		Object.freeze({ id: 'texture', labelKey: 'sculpt.texture', value: 44 })
	])
})
