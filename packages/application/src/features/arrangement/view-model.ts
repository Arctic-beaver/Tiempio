import type { LocalizationKey } from '../../../../localization/src/index.js'

export interface ArrangementSourceNoteViewModel {
	readonly durationTicks: number
	readonly id: string
	readonly pitch: number
	readonly startTick: number
}

export interface ArrangementSourceHitViewModel {
	readonly id: string
	readonly instrument: 'kick' | 'clap' | 'closedHat' | 'openHat' | 'perc'
	readonly tick: number
}

export interface ArrangementInstanceViewModel {
	readonly durationTicks: number
	readonly id: string
	readonly sourceLayerId: string
	readonly sourceOffsetTicks: number
	readonly startTick: number
}

export interface ArrangementLayerViewModel {
	readonly color: string
	readonly cycleTicks: number
	readonly hits: readonly ArrangementSourceHitViewModel[]
	readonly id: string
	readonly instances: readonly ArrangementInstanceViewModel[]
	readonly kind: 'midi' | 'drum'
	readonly labelKey: LocalizationKey
	readonly materialLengthTicks: number
	readonly notes: readonly ArrangementSourceNoteViewModel[]
	readonly tailRestTicks: number
}

export interface ArrangementViewModel {
	readonly layers: readonly ArrangementLayerViewModel[]
	readonly meterNumerator: number
	readonly ticksPerQuarter: number
}
