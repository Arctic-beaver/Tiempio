export interface PianoNoteViewModel {
	readonly durationTicks: number
	readonly id: string
	readonly pitch: string
	readonly pitchValue: number
	readonly row: number
	readonly startTick: number
	readonly velocity: number
}

export interface PianoPitchViewModel {
	readonly black: boolean
	readonly label: string
	readonly pitch: number
}

export interface PianoRollViewModel {
	readonly bars: number
	readonly gridTicks: number
	readonly meterDenominator: number
	readonly meterNumerator: number
	readonly notes: readonly PianoNoteViewModel[]
	readonly pitches: readonly PianoPitchViewModel[]
	readonly ticksPerBar: number
	readonly ticksPerBeat: number
	readonly ticksPerQuarter: number
	readonly totalTicks: number
}

export const pianoRollViewModel: PianoRollViewModel = Object.freeze({
	bars: 4,
	gridTicks: 240,
	meterDenominator: 4,
	meterNumerator: 4,
	ticksPerBeat: 960,
	ticksPerBar: 3840,
	ticksPerQuarter: 960,
	totalTicks: 15_360,
	pitches: Object.freeze(
		Array.from({ length: 25 }, (_, row) => {
			const pitch = 72 - row
			const pitchClass = pitch % 12
			return Object.freeze({
				pitch,
				label: `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitchClass]}${String(Math.floor(pitch / 12) - 1)}`,
				black: [1, 3, 6, 8, 10].includes(pitchClass)
			})
		})
	),
	notes: Object.freeze([
		Object.freeze({
			id: 'n1',
			pitch: 'C4',
			pitchValue: 60,
			row: 12,
			startTick: 0,
			durationTicks: 960,
			velocity: 80
		})
	])
})
