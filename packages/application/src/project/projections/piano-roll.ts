import type { StudioProjectionContext } from './projection-context.js'
import { noteName, pianoPitches } from './shared.js'
import type { PianoRollProjection } from './types.js'

export function projectPianoRoll({
	midiClip,
	project,
	revision,
	tonalLayer
}: StudioProjectionContext): PianoRollProjection {
	const pitches = pianoPitches(
		tonalLayer,
		midiClip?.kind === 'midi' ? midiClip.notes.map(({ pitch }) => pitch) : []
	)
	const ticksPerQuarter = project.transport.ticksPerQuarter
	const meter = project.transport.meterMap[0] ?? { numerator: 4, denominator: 4 }
	const ticksPerBeat = (ticksPerQuarter * 4) / meter.denominator
	const ticksPerBar = ticksPerBeat * meter.numerator
	const defaultLengthTicks = ticksPerQuarter * 16
	const totalTicks = midiClip?.lengthTicks ?? defaultLengthTicks
	return {
		revision,
		layerId: tonalLayer?.id ?? null,
		clipId: midiClip?.id ?? null,
		bars: Math.max(1, totalTicks / ticksPerBar),
		gridTicks: ticksPerQuarter / 4,
		meterDenominator: meter.denominator,
		meterNumerator: meter.numerator,
		ticksPerBar,
		ticksPerBeat,
		ticksPerQuarter,
		totalTicks,
		pitches: pitches.map((pitch) => ({
			pitch,
			label: noteName(pitch),
			black: [1, 3, 6, 8, 10].includes(pitch % 12)
		})),
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
										pitchValue: note.pitch,
										row,
										startTick: note.startTick,
										durationTicks: note.durationTicks,
										velocity: note.velocity
									}
								]
					})
				: []
	}
}
