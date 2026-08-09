import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface ArrangementSectionViewModel {
	readonly bars: number
	readonly id: string
	readonly labelKey: LocalizationKey
	readonly tone: 'quiet' | 'full' | 'open' | 'fade'
}

export interface ArrangementLayerViewModel {
	readonly color: string
	readonly id: string
	readonly name: string
	readonly sections: readonly string[]
}

export interface ArrangementViewModel {
	readonly layers: readonly ArrangementLayerViewModel[]
	readonly sections: readonly ArrangementSectionViewModel[]
}

export const arrangementViewModel: ArrangementViewModel = Object.freeze({
	sections: Object.freeze([
		Object.freeze({ id: 'intro', labelKey: 'arrangement.intro', bars: 8, tone: 'quiet' }),
		Object.freeze({ id: 'main', labelKey: 'arrangement.main', bars: 16, tone: 'full' }),
		Object.freeze({ id: 'break', labelKey: 'arrangement.break', bars: 8, tone: 'open' }),
		Object.freeze({ id: 'outro', labelKey: 'arrangement.outro', bars: 8, tone: 'fade' })
	]),
	layers: Object.freeze([
		Object.freeze({
			id: 'melody',
			name: 'Glass melody',
			color: 'coral',
			sections: ['main', 'break']
		}),
		Object.freeze({
			id: 'chords',
			name: 'Warm chords',
			color: 'gold',
			sections: ['intro', 'main', 'break', 'outro']
		}),
		Object.freeze({
			id: 'bass',
			name: 'Low pulse',
			color: 'blue',
			sections: ['main', 'outro']
		}),
		Object.freeze({
			id: 'drums',
			name: 'Soft drums',
			color: 'violet',
			sections: ['intro', 'main', 'outro']
		})
	])
})
