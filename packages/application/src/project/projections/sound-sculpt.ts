import type { BassMacroId } from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { SoundSculptProjection } from './types.js'

const macroByDimension = Object.freeze({
	brightness: 'brightness',
	movement: 'hardness',
	space: 'width',
	texture: 'dirt'
} as const satisfies Readonly<Record<string, BassMacroId>>)

export function projectSoundSculpt({
	revision,
	tonalLayer
}: StudioProjectionContext): SoundSculptProjection {
	const instrument = tonalLayer?.source.type === 'synth' ? tonalLayer.source.instrument : null
	return {
		revision,
		layerId: tonalLayer?.id ?? null,
		soundName: instrument?.presetId === 'bass.deep' ? 'Deep' : '—',
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
