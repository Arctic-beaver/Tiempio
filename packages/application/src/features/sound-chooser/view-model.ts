import type { LocalizationKey } from '../../../../localization/src/index.js'
import {
	synthPresetsForFamily,
	type SoundFamily,
	type SynthPresetId
} from '../../../../project-core/src/index.js'

export interface SoundCharacterViewModel {
	readonly descriptionKey: LocalizationKey
	readonly id: SynthPresetId
	readonly name: string
}

export interface SoundFamilyViewModel {
	readonly id: SoundFamily
	readonly name: string
	readonly presets: readonly SoundCharacterViewModel[]
}

export interface SoundChooserViewModel {
	readonly families: readonly SoundFamilyViewModel[]
}

const descriptions = Object.freeze({
	'bass.deep': 'soundChooser.character.bass.deep',
	'bass.punchy': 'soundChooser.character.bass.punchy',
	'bass.warm': 'soundChooser.character.bass.warm',
	'bass.dirty': 'soundChooser.character.bass.dirty',
	'bass.soft': 'soundChooser.character.bass.soft',
	'bass.retro': 'soundChooser.character.bass.retro',
	'lead.glass': 'soundChooser.character.lead.glass',
	'lead.neon': 'soundChooser.character.lead.neon',
	'lead.velvet': 'soundChooser.character.lead.velvet',
	'lead.hollow': 'soundChooser.character.lead.hollow',
	'lead.razor': 'soundChooser.character.lead.razor',
	'lead.voice': 'soundChooser.character.lead.voice',
	'lead.solar': 'soundChooser.character.lead.solar',
	'pad.soft': 'soundChooser.character.pad.soft',
	'pad.warm': 'soundChooser.character.pad.warm',
	'pad.air': 'soundChooser.character.pad.air',
	'pad.motion': 'soundChooser.character.pad.motion',
	'pad.dust': 'soundChooser.character.pad.dust',
	'pluck.glass': 'soundChooser.character.pluck.glass',
	'pluck.wood': 'soundChooser.character.pluck.wood',
	'pluck.bell': 'soundChooser.character.pluck.bell',
	'pluck.short': 'soundChooser.character.pluck.short',
	'texture.grain': 'soundChooser.character.texture.grain',
	'texture.mist': 'soundChooser.character.texture.mist',
	'texture.pulse': 'soundChooser.character.texture.pulse',
	'texture.dust': 'soundChooser.character.texture.dust',
	'texture.wire': 'soundChooser.character.texture.wire'
} as const satisfies Readonly<Record<SynthPresetId, LocalizationKey>>)

const familyNames = Object.freeze({
	bass: 'Bass',
	lead: 'Lead',
	pad: 'Pad',
	pluck: 'Pluck',
	texture: 'Texture'
} as const satisfies Readonly<Record<SoundFamily, string>>)

const familyOrder = Object.freeze<readonly SoundFamily[]>([
	'bass',
	'lead',
	'pad',
	'pluck',
	'texture'
])

export function soundCharacterDescriptionKey(presetId: SynthPresetId): LocalizationKey {
	return descriptions[presetId]
}

export const soundChooserViewModel: SoundChooserViewModel = Object.freeze({
	families: Object.freeze(
		familyOrder.map((family) =>
			Object.freeze({
				id: family,
				name: familyNames[family],
				presets: Object.freeze(
					synthPresetsForFamily(family).map((definition) =>
						Object.freeze({
							id: definition.id,
							name: definition.name,
							descriptionKey: descriptions[definition.id]
						})
					)
				)
			})
		)
	)
})
