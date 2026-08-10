import type { StudioProjectionContext } from './projection-context.js'
import { layerPresentation, soundName } from './shared.js'
import type { ContextProjection } from './types.js'

export function projectContext({
	activeLayer,
	revision
}: StudioProjectionContext): ContextProjection {
	return {
		revision,
		layerId: activeLayer?.id ?? null,
		labelKey:
			activeLayer === null ? 'context.noLayer' : layerPresentation(activeLayer).labelKey,
		soundName: activeLayer === null ? '—' : soundName(activeLayer),
		soundEditable: activeLayer?.source.type === 'synth',
		energy: activeLayer === null ? 0 : Math.round((activeLayer.gain / 2) * 100)
	}
}
