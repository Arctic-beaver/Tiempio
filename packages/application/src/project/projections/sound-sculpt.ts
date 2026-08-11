import {
	synthPresetDefinition,
	synthPresetsForFamily,
	type SynthMacroId
} from '../../../../project-core/src/index.js'
import { soundCharacterDescriptionKey } from '../../features/sound-chooser/view-model.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { SoundSculptProjection } from './types.js'

const macroByDimension = Object.freeze({
	brightness: 'brightness',
	movement: 'hardness',
	space: 'width',
	texture: 'dirt'
} as const satisfies Readonly<Record<string, SynthMacroId>>)

export function projectSoundSculpt({
	revision,
	tonalLayer
}: StudioProjectionContext): SoundSculptProjection {
	const instrument = tonalLayer?.source.type === 'synth' ? tonalLayer.source.instrument : null
	const definition = instrument === null ? null : synthPresetDefinition(instrument.presetId)
	return {
		revision,
		layerId: tonalLayer?.id ?? null,
		presetId: instrument?.presetId ?? null,
		soundName: definition?.name ?? '—',
		familyName:
			definition === null
				? 'Sound'
				: `${definition.family.slice(0, 1).toUpperCase()}${definition.family.slice(1)}`,
		characters:
			definition === null
				? []
				: synthPresetsForFamily(definition.family).map((character) => ({
						id: character.id,
						name: character.name,
						descriptionKey: soundCharacterDescriptionKey(character.id)
					})),
		macroByDimension,
		dimensions: [
			{
				id: 'brightness',
				labelKey: 'sculpt.brightness',
				value: Math.round((instrument?.macros.brightness ?? 0) * 100)
			},
			{
				id: 'movement',
				labelKey: 'sculpt.movement',
				value: Math.round((instrument?.macros.hardness ?? 0) * 100)
			},
			{
				id: 'space',
				labelKey: 'sculpt.space',
				value: Math.round((instrument?.macros.width ?? 0) * 100)
			},
			{
				id: 'texture',
				labelKey: 'sculpt.texture',
				value: Math.round((instrument?.macros.dirt ?? 0) * 100)
			}
		]
	}
}
