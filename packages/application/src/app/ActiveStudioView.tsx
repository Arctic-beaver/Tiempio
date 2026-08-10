import type { JSX } from 'react'
import { ArrangementView } from '../features/arrangement/ArrangementView.js'
import { useArrangementActions } from '../features/arrangement/useArrangementActions.js'
import { DrumsView } from '../features/drums/DrumsView.js'
import { useDrumsActions } from '../features/drums/useDrumsActions.js'
import { FirstLayerView } from '../features/first-layer/FirstLayerView.js'
import { useFirstLayerActions } from '../features/first-layer/useFirstLayerActions.js'
import { HomeView } from '../features/home/HomeView.js'
import { useHomeActions } from '../features/home/useHomeActions.js'
import { PianoRollView } from '../features/piano-roll/PianoRollView.js'
import { usePianoRollActions } from '../features/piano-roll/usePianoRollActions.js'
import { SoundChooserView } from '../features/sound-chooser/SoundChooserView.js'
import { soundChooserViewModel } from '../features/sound-chooser/view-model.js'
import { useSoundChooserActions } from '../features/sound-chooser/useSoundChooserActions.js'
import { SoundSculptView } from '../features/sound-sculpt/SoundSculptView.js'
import { useSoundSculptActions } from '../features/sound-sculpt/useSoundSculptActions.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import type { StudioViewId } from './studio-state.js'

const deepSoundChooserModel = Object.freeze({
	sounds: Object.freeze(soundChooserViewModel.sounds.filter((sound) => sound.id === 'low-ember'))
})

export interface ActiveStudioViewProperties {
	readonly activeView: StudioViewId
}

export function ActiveStudioView({ activeView }: ActiveStudioViewProperties): JSX.Element {
	const { projections } = useProjectSession()
	const home = useHomeActions()
	const firstLayer = useFirstLayerActions()
	const soundChooser = useSoundChooserActions()
	const pianoRoll = usePianoRollActions()
	const drums = useDrumsActions()
	const arrangement = useArrangementActions()
	const soundSculpt = useSoundSculptActions()

	if (activeView === 'home') {
		return <HomeView model={projections.home} onCreate={home.createProject} />
	}
	if (activeView === 'first-layer') {
		return <FirstLayerView onChoose={firstLayer.chooseLayer} />
	}
	if (activeView === 'sound-chooser') {
		return (
			<SoundChooserView
				model={deepSoundChooserModel}
				onBack={soundChooser.returnToLayerChoice}
				onChoose={soundChooser.chooseSound}
			/>
		)
	}
	if (activeView === 'piano-roll') {
		return (
			<PianoRollView
				model={projections.pianoRoll}
				onAddNote={pianoRoll.addNote}
				onDeleteNote={pianoRoll.deleteNote}
			/>
		)
	}
	if (activeView === 'drums') {
		return <DrumsView model={projections.drums} onToggleStep={drums.toggleStep} />
	}
	if (activeView === 'arrangement') {
		return (
			<ArrangementView
				model={projections.arrangement}
				onToggleCell={arrangement.toggleCell}
				totalBars={projections.arrangement.totalBars}
			/>
		)
	}
	return <SoundSculptView model={projections.sculpt} onCommit={soundSculpt.commitMacro} />
}
