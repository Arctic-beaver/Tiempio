import { defaultTicksPerQuarter } from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import { noteName, pianoPitches } from './shared.js'
import type { PianoRollProjection } from './types.js'

export function projectPianoRoll({
	midiClip,
	revision,
	tonalLayer
}: StudioProjectionContext): PianoRollProjection {
	const pitches = pianoPitches(tonalLayer)
	return {
		revision,
		layerId: tonalLayer?.id ?? null,
		clipId: midiClip?.id ?? null,
		bars:
			midiClip === null
				? 4
				: Math.max(1, midiClip.lengthTicks / (defaultTicksPerQuarter * 4)),
		pitches: pitches.map(noteName),
		notes:
			midiClip?.kind === 'midi'
				? midiClip.notes.flatMap((note) => {
						const row = pitches.indexOf(note.pitch)
						return row < 0
							? []
							: [
									{
										id: note.id,
										pitch: noteName(note.pitch),
										row,
										beat: note.startTick / (defaultTicksPerQuarter / 2),
										duration: note.durationTicks / (defaultTicksPerQuarter / 2)
									}
								]
					})
				: []
	}
}
