import { useEffect, useState, type JSX } from 'react'
import { ArrangementView } from '../features/arrangement/ArrangementView.js'
import { DrumsView } from '../features/drums/DrumsView.js'
import { FirstLayerView } from '../features/first-layer/FirstLayerView.js'
import { HomeView } from '../features/home/HomeView.js'
import { PianoRollView } from '../features/piano-roll/PianoRollView.js'
import { SoundChooserView } from '../features/sound-chooser/SoundChooserView.js'
import { SoundSculptView } from '../features/sound-sculpt/SoundSculptView.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { StudioShell } from '../shell/StudioShell.js'
import {
	initialStudioNavigationState,
	type StudioDrawer,
	type StudioViewId
} from './studio-state.js'

export function StudioApplication(): JSX.Element {
	const runtime = useApplicationRuntime()
	const [navigation, setNavigation] = useState(initialStudioNavigationState)
	const navigate = (activeView: StudioViewId): void => {
		setNavigation({ activeView, activeDrawer: null })
	}
	const openDrawer = (activeDrawer: Exclude<StudioDrawer, null>): void => {
		setNavigation((current) => ({ ...current, activeDrawer }))
	}
	const closeDrawer = (): void => {
		setNavigation((current) => ({ ...current, activeDrawer: null }))
	}

	useEffect(() => {
		if (navigation.activeDrawer === null) return
		const closeOnEscape = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') closeDrawer()
		}
		document.addEventListener('keydown', closeOnEscape)
		return () => document.removeEventListener('keydown', closeOnEscape)
	}, [navigation.activeDrawer])

	return (
		<StudioShell
			activeDrawer={navigation.activeDrawer}
			activeView={navigation.activeView}
			onCloseDrawer={closeDrawer}
			onNavigate={navigate}
			onOpenDrawer={openDrawer}
			target={runtime.target}
		>
			<ActiveStudioView activeView={navigation.activeView} onNavigate={navigate} />
		</StudioShell>
	)
}

interface ActiveStudioViewProperties {
	readonly activeView: StudioViewId
	readonly onNavigate: (view: StudioViewId) => void
}

function ActiveStudioView({ activeView, onNavigate }: ActiveStudioViewProperties): JSX.Element {
	switch (activeView) {
		case 'home':
			return <HomeView onCreate={() => onNavigate('first-layer')} />
		case 'first-layer':
			return (
				<FirstLayerView
					onChoose={(role) => onNavigate(role === 'drums' ? 'drums' : 'sound-chooser')}
				/>
			)
		case 'sound-chooser':
			return (
				<SoundChooserView
					onBack={() => onNavigate('first-layer')}
					onChoose={() => onNavigate('piano-roll')}
				/>
			)
		case 'piano-roll':
			return <PianoRollView />
		case 'drums':
			return <DrumsView />
		case 'arrangement':
			return <ArrangementView />
		case 'sound-sculpt':
			return <SoundSculptView />
	}
}
