import type { StudioProjectionContext } from './projection-context.js'
import type { StudioProjectProjections } from './types.js'

export function projectHome({
	project,
	revision
}: StudioProjectionContext): StudioProjectProjections['home'] {
	return {
		revision,
		recentPieces: [
			{
				id: project.projectId,
				name: project.title,
				bpm: project.transport.tempoMap[0]?.bpm ?? 108,
				layerCount: project.layers.length
			}
		]
	}
}
