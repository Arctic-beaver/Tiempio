export interface PianoNoteViewModel {
	readonly beat: number
	readonly duration: number
	readonly id: string
	readonly pitch: string
	readonly row: number
}

export interface PianoRollViewModel {
	readonly bars: number
	readonly notes: readonly PianoNoteViewModel[]
	readonly pitches: readonly string[]
}

export const pianoRollViewModel: PianoRollViewModel = Object.freeze({
	bars: 4,
	pitches: Object.freeze(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']),
	notes: Object.freeze([
		Object.freeze({ id: 'n1', pitch: 'C4', row: 7, beat: 0, duration: 2 }),
		Object.freeze({ id: 'n2', pitch: 'E4', row: 5, beat: 2, duration: 1 }),
		Object.freeze({ id: 'n3', pitch: 'G4', row: 3, beat: 3, duration: 2 }),
		Object.freeze({ id: 'n4', pitch: 'A4', row: 2, beat: 6, duration: 1 }),
		Object.freeze({ id: 'n5', pitch: 'G4', row: 3, beat: 8, duration: 3 }),
		Object.freeze({ id: 'n6', pitch: 'E4', row: 5, beat: 12, duration: 2 })
	])
})
