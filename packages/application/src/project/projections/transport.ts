import { songPalette } from '../../../../music-theory/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { TransportProjection } from './types.js'

export function projectTransport({
	project,
	revision,
	tonalLayer
}: StudioProjectionContext): TransportProjection {
	const performance = tonalLayer?.source.type === 'synth' ? tonalLayer.source.performance : null
	return {
		revision,
		bpm: project.transport.tempoMap[0]?.bpm ?? 108,
		looping: project.transport.loop.enabled,
		octave: performance?.octave ?? 2,
		palette: songPalette(performance?.key ?? project.transport.key)
	}
}
