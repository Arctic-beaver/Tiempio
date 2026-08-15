import { songPalette } from '../../../../music-theory/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import { noteName, pianoPitches } from './shared.js'
import type { PianoRollProjection } from './types.js'

export function projectPianoRoll({
	midiMaterial,
	project,
	revision,
	tonalLayer
}: StudioProjectionContext): PianoRollProjection {
	const pitches = pianoPitches()
	const ticksPerQuarter = project.transport.ticksPerQuarter
	const meter = project.transport.meterMap[0] ?? { numerator: 4, denominator: 4 }
	const ticksPerBeat = (ticksPerQuarter * 4) / meter.denominator
	const ticksPerBar = ticksPerBeat * meter.numerator
	const defaultLengthTicks = ticksPerQuarter * 16
	const totalTicks = Math.max(midiMaterial?.materialLengthTicks ?? 0, defaultLengthTicks)
	const performance = tonalLayer?.source.type === 'synth' ? tonalLayer.source.performance : null
	return {
		revision,
		layerId: tonalLayer?.id ?? null,
		bars: Math.max(1, totalTicks / ticksPerBar),
		gridTicks: ticksPerQuarter / 4,
		meterDenominator: meter.denominator,
		meterNumerator: meter.numerator,
		materialEndTick: midiMaterial?.materialLengthTicks ?? 0,
		performanceOctave: performance?.octave ?? 3,
		palette: songPalette(performance?.key ?? project.transport.key),
		recommendedPitch: tonalLayer?.role === 'bass' ? 36 : 60,
		startTick: 0,
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
			midiMaterial === null
				? []
				: midiMaterial.notes.flatMap((note) => {
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
	}
}
