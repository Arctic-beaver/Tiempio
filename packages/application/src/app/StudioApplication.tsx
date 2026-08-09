import { useCallback, useMemo, useState, type JSX } from 'react'
import { CommandProvider } from '../commands/CommandProvider.js'
import { useCommands } from '../commands/CommandContext.js'
import { commandForView, type CommandId } from '../commands/command-registry.js'
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
	const [playing, setPlaying] = useState(false)
	const [looping, setLooping] = useState(true)
	const navigate = useCallback((activeView: StudioViewId): void => {
		setNavigation({ activeView, activeDrawer: null })
	}, [])
	const openDrawer = useCallback((activeDrawer: Exclude<StudioDrawer, null>): void => {
		setNavigation((current) => ({ ...current, activeDrawer }))
	}, [])
	const closeDrawer = useCallback((): void => {
		setNavigation((current) => ({ ...current, activeDrawer: null }))
	}, [])
	const handlers = useMemo<Readonly<Partial<Record<CommandId, () => void>>>>(
		() => ({
			'studio.home': () => navigate('home'),
			'studio.first-layer': () => navigate('first-layer'),
			'studio.sound-chooser': () => navigate('sound-chooser'),
			'studio.piano-roll': () => navigate('piano-roll'),
			'studio.drums': () => navigate('drums'),
			'studio.arrangement': () => navigate('arrangement'),
			'studio.sound-sculpt': () => navigate('sound-sculpt'),
			'transport.toggle-playback': () => setPlaying((current) => !current),
			'transport.toggle-loop': () => setLooping((current) => !current),
			'transport.stop': () => setPlaying(false),
			'layout.open-navigation': () => openDrawer('navigation'),
			'layout.open-context': () => openDrawer('context'),
			'layout.close-drawer': closeDrawer
		}),
		[closeDrawer, navigate, openDrawer]
	)

	return (
		<CommandProvider handlers={handlers} looping={looping} playing={playing}>
			<StudioShell
				activeDrawer={navigation.activeDrawer}
				activeView={navigation.activeView}
				target={runtime.target}
			>
				<ActiveStudioView activeView={navigation.activeView} />
			</StudioShell>
		</CommandProvider>
	)
}

interface ActiveStudioViewProperties {
	readonly activeView: StudioViewId
}

function ActiveStudioView({ activeView }: ActiveStudioViewProperties): JSX.Element {
	const { execute } = useCommands()
	const navigate = (view: StudioViewId): void => {
		execute(commandForView(view))
	}
	if (activeView === 'home') return <HomeView onCreate={() => navigate('first-layer')} />
	if (activeView === 'first-layer') {
		return (
			<FirstLayerView
				onChoose={(role) => navigate(role === 'drums' ? 'drums' : 'sound-chooser')}
			/>
		)
	}
	if (activeView === 'sound-chooser') {
		return (
			<SoundChooserView
				onBack={() => navigate('first-layer')}
				onChoose={() => navigate('piano-roll')}
			/>
		)
	}
	if (activeView === 'piano-roll') return <PianoRollView />
	if (activeView === 'drums') return <DrumsView />
	if (activeView === 'arrangement') return <ArrangementView />
	return <SoundSculptView />
}
