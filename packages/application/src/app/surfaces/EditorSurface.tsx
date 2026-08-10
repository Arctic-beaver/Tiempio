import type { JSX } from 'react'
import { ArrangementView } from '../../features/arrangement/ArrangementView.js'
import { useArrangementActions } from '../../features/arrangement/useArrangementActions.js'
import { DrumsView } from '../../features/drums/DrumsView.js'
import { useDrumsActions } from '../../features/drums/useDrumsActions.js'
import { PianoRollView } from '../../features/piano-roll/PianoRollView.js'
import { usePianoRollActions } from '../../features/piano-roll/usePianoRollActions.js'
import { SoundSculptView } from '../../features/sound-sculpt/SoundSculptView.js'
import { useSoundSculptActions } from '../../features/sound-sculpt/useSoundSculptActions.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { StudioViewId } from '../studio-state.js'

export interface EditorSurfaceProperties {
	readonly activeView: Extract<
		StudioViewId,
		'arrangement' | 'drums' | 'piano-roll' | 'sound-sculpt'
	>
}

export default function EditorSurface({ activeView }: EditorSurfaceProperties): JSX.Element {
	const { projections } = useProjectSession()
	const arrangement = useArrangementActions()
	const drums = useDrumsActions()
	const pianoRoll = usePianoRollActions()
	const soundSculpt = useSoundSculptActions()
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
