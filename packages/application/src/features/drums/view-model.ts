import type { LocalizationKey } from '../../../../localization/src/index.js'
import type {
	DrumInstrument,
	DrumPatternCharacter,
	DrumVoiceVariantId
} from '../../../../project-core/src/index.js'

export interface DrumVariantViewModel {
	readonly id: DrumVoiceVariantId
	readonly name: string
}

export interface DrumRowViewModel {
	readonly activeSteps: readonly number[]
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
	readonly selectedVariantId: DrumVoiceVariantId
	readonly selectedVariantName: string
	readonly variants: readonly DrumVariantViewModel[]
}

export interface DrumsViewModel {
	readonly character: DrumPatternCharacter
	readonly density: number
	readonly rows: readonly DrumRowViewModel[]
	readonly startTick: number
	readonly stepCount: number
	readonly swing: number
	readonly totalTicks: number
}

export const drumsViewModel: DrumsViewModel = Object.freeze({
	character: 'straight',
	density: 0.38,
	startTick: 0,
	stepCount: 16,
	swing: 0.08,
	totalTicks: 3840,
	rows: Object.freeze([])
})
