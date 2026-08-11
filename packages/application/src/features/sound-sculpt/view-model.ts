import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { SynthPresetId } from '../../../../project-core/src/index.js'

export interface SculptDimensionViewModel {
	readonly id: 'brightness' | 'movement' | 'space' | 'texture'
	readonly labelKey: LocalizationKey
	readonly value: number
}

export interface SoundSculptViewModel {
	readonly characters: readonly {
		readonly descriptionKey: LocalizationKey
		readonly id: SynthPresetId
		readonly name: string
	}[]
	readonly dimensions: readonly SculptDimensionViewModel[]
	readonly familyName: string
	readonly presetId: SynthPresetId | null
	readonly soundName: string
}

export const soundSculptViewModel: SoundSculptViewModel = Object.freeze({
	characters: Object.freeze([]),
	familyName: 'Bass',
	presetId: 'bass.deep',
	soundName: 'Deep',
	dimensions: Object.freeze([
		Object.freeze({ id: 'brightness', labelKey: 'sculpt.brightness', value: 58 }),
		Object.freeze({ id: 'movement', labelKey: 'sculpt.movement', value: 36 }),
		Object.freeze({ id: 'space', labelKey: 'sculpt.space', value: 72 }),
		Object.freeze({ id: 'texture', labelKey: 'sculpt.texture', value: 44 })
	])
})
