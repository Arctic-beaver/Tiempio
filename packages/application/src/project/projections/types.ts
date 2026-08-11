import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { SongPalette } from '../../../../music-theory/src/index.js'
import type { BassMacroId, ClipId, LayerId, SectionId } from '../../../../project-core/src/index.js'
import type { StudioViewId } from '../../app/studio-state.js'
import type { ArrangementViewModel } from '../../features/arrangement/view-model.js'
import type { DrumsViewModel } from '../../features/drums/view-model.js'
import type { HomeViewModel } from '../../features/home/view-model.js'
import type { PianoRollViewModel } from '../../features/piano-roll/view-model.js'
import type { SoundSculptViewModel } from '../../features/sound-sculpt/view-model.js'

export type LayerColor = 'blue' | 'coral' | 'gold' | 'violet'

export interface ProjectedLayerItem {
	readonly color: LayerColor
	readonly id: LayerId
	readonly labelKey: LocalizationKey
	readonly name: string
	readonly soundName: string
	readonly view: StudioViewId
}

export interface LayersProjection {
	readonly activeLayerId: LayerId | null
	readonly bpm: number
	readonly items: readonly ProjectedLayerItem[]
	readonly meter: string
	readonly projectTitle: string
	readonly revision: number
}

export interface ContextProjection {
	readonly energy: number
	readonly labelKey: LocalizationKey
	readonly layerId: LayerId | null
	readonly revision: number
	readonly soundEditable: boolean
	readonly soundName: string
}

export interface PianoRollProjection extends PianoRollViewModel {
	readonly clipId: ClipId | null
	readonly layerId: LayerId | null
	readonly revision: number
}

export interface DrumsProjection extends DrumsViewModel {
	readonly clipId: ClipId | null
	readonly layerId: LayerId | null
	readonly revision: number
}

export interface ArrangementProjection extends ArrangementViewModel {
	readonly endTick: number
	readonly revision: number
	readonly sectionIds: readonly SectionId[]
	readonly totalBars: number
}

export interface SoundSculptProjection extends SoundSculptViewModel {
	readonly layerId: LayerId | null
	readonly macroByDimension: Readonly<
		Record<'brightness' | 'movement' | 'space' | 'texture', BassMacroId>
	>
	readonly revision: number
}

export interface TransportProjection {
	readonly bpm: number
	readonly looping: boolean
	readonly palette: SongPalette
	readonly revision: number
}

export interface StudioProjectProjections {
	readonly arrangement: ArrangementProjection
	readonly context: ContextProjection
	readonly drums: DrumsProjection
	readonly home: HomeViewModel & { readonly revision: number }
	readonly layers: LayersProjection
	readonly pianoRoll: PianoRollProjection
	readonly revision: number
	readonly sculpt: SoundSculptProjection
	readonly transport: TransportProjection
}
