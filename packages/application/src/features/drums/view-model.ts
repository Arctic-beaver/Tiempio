import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'

export interface DrumRowViewModel {
	readonly activeSteps: readonly number[]
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}

export interface DrumsViewModel {
	readonly rows: readonly DrumRowViewModel[]
	readonly startTick: number
	readonly stepCount: number
	readonly totalTicks: number
}

export const drumsViewModel: DrumsViewModel = Object.freeze({
	startTick: 0,
	stepCount: 16,
	totalTicks: 3840,
	rows: Object.freeze([
		Object.freeze({ id: 'kick', labelKey: 'drums.kick', activeSteps: [0, 4, 8, 11, 12] }),
		Object.freeze({ id: 'clap', labelKey: 'drums.clap', activeSteps: [4, 12] }),
		Object.freeze({
			id: 'closedHat',
			labelKey: 'drums.hat',
			activeSteps: [0, 2, 4, 6, 8, 10, 12, 14]
		}),
		Object.freeze({ id: 'openHat', labelKey: 'drums.hat', activeSteps: [7, 15] }),
		Object.freeze({ id: 'perc', labelKey: 'drums.snare', activeSteps: [6, 14] })
	])
})
