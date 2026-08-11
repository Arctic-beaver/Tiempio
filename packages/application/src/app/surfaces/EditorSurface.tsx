import type { JSX } from 'react'
import '../styles/editor-views.css'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { ArrangementView } from '../../features/arrangement/ArrangementView.js'
import { useArrangementActions } from '../../features/arrangement/useArrangementActions.js'
import { DrumsView } from '../../features/drums/DrumsView.js'
import { useDrumsActions } from '../../features/drums/useDrumsActions.js'
import { PianoRollView } from '../../features/piano-roll/PianoRollView.js'
import { usePianoRollActions } from '../../features/piano-roll/usePianoRollActions.js'
import { SoundSculptView } from '../../features/sound-sculpt/SoundSculptView.js'
import { useSoundSculptActions } from '../../features/sound-sculpt/useSoundSculptActions.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { ProjectedLayerItem } from '../../project/projections/types.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import type { StudioViewId } from '../studio-state.js'

export interface EditorSurfaceProperties {
	readonly activeView: Extract<
		StudioViewId,
		'arrangement' | 'drums' | 'piano-roll' | 'sound-sculpt'
	>
}

export default function EditorSurface({ activeView }: EditorSurfaceProperties): JSX.Element {
	const projectSession = useProjectSession()
	const { projections } = projectSession
	const { execute } = useCommands()
	const controller = useApplicationRuntimeController()
	const arrangement = useArrangementActions()
	const drums = useDrumsActions()
	const pianoRoll = usePianoRollActions()
	const soundSculpt = useSoundSculptActions()
	const addLayer = (): void => {
		execute(commandForView('first-layer'))
	}
	const selectLayer = (item: ProjectedLayerItem): void => {
		projectSession.selectLayer(item.id)
		execute(commandForView(item.view))
	}
	if (activeView === 'piano-roll') {
		return (
			<PianoRollView
				layers={projections.layers}
				model={projections.pianoRoll}
				onAddLayer={addLayer}
				onAddNote={pianoRoll.addNote}
				onDeleteNote={pianoRoll.deleteNote}
				onEndHistoryGroup={pianoRoll.endHistoryGroup}
				onSelectLayer={selectLayer}
				onUpdateNote={pianoRoll.updateNote}
			/>
		)
	}
	if (activeView === 'drums') {
		return (
			<DrumsView
				layers={projections.layers}
				model={projections.drums}
				onAddLayer={addLayer}
				onAuditionVoice={(instrument) => {
					const layer = projections.drums.layerId
					if (layer !== null) controller.auditionDrum(layer, instrument)
				}}
				onSelectLayer={selectLayer}
				onSelectPattern={drums.selectPattern}
				onSelectVoiceVariant={drums.selectVoiceVariant}
				onSetDensity={drums.setDensity}
				onSetSwing={drums.setSwing}
				onToggleStep={drums.toggleStep}
			/>
		)
	}
	if (activeView === 'arrangement') {
		return (
			<ArrangementView
				layers={projections.layers}
				model={projections.arrangement}
				onAddLayer={addLayer}
				onOpenSculpt={() => execute(commandForView('sound-sculpt'))}
				onToggleCell={arrangement.toggleCell}
				totalBars={projections.arrangement.totalBars}
			/>
		)
	}
	return (
		<SoundSculptView
			model={projections.sculpt}
			onCommit={soundSculpt.commitMacro}
			onDone={() => execute(commandForView('arrangement'))}
			onSelectCharacter={soundSculpt.selectCharacter}
		/>
	)
}
