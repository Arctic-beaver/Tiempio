import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'

export interface DrumRowViewModel {
	readonly activeSteps: readonly number[]
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}

export interface DrumsViewModel {
	readonly rows: readonly DrumRowViewModel[]
	readonly stepCount: number
}

export const drumsViewModel: DrumsViewModel = Object.freeze({
	stepCount: 16,
	rows: Object.freeze([
		Object.freeze({ id: 'kick', labelKey: 'drums.kick', activeSteps: [0, 4, 8, 11, 12] }),
		Object.freeze({ id: 'snare', labelKey: 'drums.snare', activeSteps: [4, 12] }),
		Object.freeze({
			id: 'hat',
			labelKey: 'drums.hat',
			activeSteps: [0, 2, 4, 6, 8, 10, 12, 14]
		}),
		Object.freeze({ id: 'clap', labelKey: 'drums.clap', activeSteps: [6, 14] })
	])
})
