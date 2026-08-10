import {
	cloneAndFreeze,
	type LayerId,
	type ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import { projectArrangement } from './projections/arrangement.js'
import { projectContext } from './projections/context-panel.js'
import { projectDrums } from './projections/drums.js'
import { projectHome } from './projections/home.js'
import { projectLayers } from './projections/layers.js'
import { projectPianoRoll } from './projections/piano-roll.js'
import { createProjectionContext } from './projections/projection-context.js'
import { projectSoundSculpt } from './projections/sound-sculpt.js'
import { projectTransport } from './projections/transport.js'
import type { StudioProjectProjections } from './projections/types.js'

export type {
	ArrangementProjection,
	ContextProjection,
	DrumsProjection,
	LayerColor,
	LayersProjection,
	PianoRollProjection,
	ProjectedLayerItem,
	SoundSculptProjection,
	StudioProjectProjections,
	TransportProjection
} from './projections/types.js'

export function projectStudio(
	snapshot: ProjectSessionSnapshot,
	selectedLayerId: LayerId | null
): StudioProjectProjections {
	const context = createProjectionContext(snapshot, selectedLayerId)
	return cloneAndFreeze({
		revision: context.revision,
		home: projectHome(context),
		layers: projectLayers(context),
		context: projectContext(context),
		pianoRoll: projectPianoRoll(context),
		drums: projectDrums(context),
		arrangement: projectArrangement(context),
		sculpt: projectSoundSculpt(context),
		transport: projectTransport(context)
	})
}
