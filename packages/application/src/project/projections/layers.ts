import type { StudioProjectionContext } from './projection-context.js'
import { layerPresentation, soundName } from './shared.js'
import type { LayersProjection } from './types.js'

export function projectLayers({
	activeLayer,
	project,
	revision
}: StudioProjectionContext): LayersProjection {
	return {
		revision,
		activeLayerId: activeLayer?.id ?? null,
		projectTitle: project.title,
		bpm: project.transport.tempoMap[0]?.bpm ?? 108,
		meter: `${String(project.transport.meterMap[0]?.numerator ?? 4)}/${String(project.transport.meterMap[0]?.denominator ?? 4)}`,
		items: project.layers
			.filter((layer) => layer.role !== 'reference')
			.map((layer) => ({
				id: layer.id,
				name: layer.name,
				soundName: soundName(layer),
				...layerPresentation(layer)
			}))
	}
}
