import type { JSX } from 'react'
import { FirstLayerView } from '../../features/first-layer/FirstLayerView.js'
import { useFirstLayerActions } from '../../features/first-layer/useFirstLayerActions.js'
import { SoundChooserView } from '../../features/sound-chooser/SoundChooserView.js'
import { useSoundChooserActions } from '../../features/sound-chooser/useSoundChooserActions.js'
import { soundChooserViewModel } from '../../features/sound-chooser/view-model.js'
import type { StudioViewId } from '../studio-state.js'

const deepSoundChooserModel = Object.freeze({
	sounds: Object.freeze(soundChooserViewModel.sounds.filter((sound) => sound.id === 'low-ember'))
})

export interface WorkflowSurfaceProperties {
	readonly activeView: Extract<StudioViewId, 'first-layer' | 'sound-chooser'>
}

export default function WorkflowSurface({ activeView }: WorkflowSurfaceProperties): JSX.Element {
	const firstLayer = useFirstLayerActions()
	const soundChooser = useSoundChooserActions()
	if (activeView === 'first-layer') {
		return <FirstLayerView onChoose={firstLayer.chooseLayer} />
	}
	return (
		<SoundChooserView
			model={deepSoundChooserModel}
			onBack={soundChooser.returnToLayerChoice}
			onChoose={soundChooser.chooseSound}
		/>
	)
}
