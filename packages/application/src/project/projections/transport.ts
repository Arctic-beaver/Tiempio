import { songPalette } from '../../../../music-theory/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { TransportProjection } from './types.js'

export function projectTransport({
	project,
	revision
}: StudioProjectionContext): TransportProjection {
	return {
		revision,
		bpm: project.transport.tempoMap[0]?.bpm ?? 108,
		looping: project.transport.loop.enabled,
		palette: songPalette(project.transport.key)
	}
}
