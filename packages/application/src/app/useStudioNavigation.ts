import { useCallback, useMemo, useState } from 'react'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import {
	initialStudioNavigationState,
	type StudioDrawer,
	type StudioNavigationState,
	type StudioViewId
} from './studio-state.js'

export interface StudioNavigationController {
	readonly commandHandlers: CommandHandlerMap
	readonly state: StudioNavigationState
}

export function useStudioNavigation(): StudioNavigationController {
	const [state, setState] = useState(initialStudioNavigationState)
	const navigate = useCallback((activeView: StudioViewId): void => {
		setState({ activeView, activeDrawer: null })
	}, [])
	const openDrawer = useCallback((activeDrawer: Exclude<StudioDrawer, null>): void => {
		setState((current) => ({ ...current, activeDrawer }))
	}, [])
	const closeDrawer = useCallback((): void => {
		setState((current) => ({ ...current, activeDrawer: null }))
	}, [])
	const commandHandlers = useMemo<CommandHandlerMap>(
		() => ({
			'studio.home': () => navigate('home'),
			'studio.first-layer': () => navigate('first-layer'),
			'studio.sound-chooser': () => navigate('sound-chooser'),
			'studio.piano-roll': () => navigate('piano-roll'),
			'studio.drums': () => navigate('drums'),
			'studio.arrangement': () => navigate('arrangement'),
			'studio.sound-sculpt': () => navigate('sound-sculpt'),
			'layout.open-navigation': () => openDrawer('navigation'),
			'layout.open-context': () => openDrawer('context'),
			'layout.close-drawer': closeDrawer
		}),
		[closeDrawer, navigate, openDrawer]
	)
	return useMemo(() => ({ commandHandlers, state }), [commandHandlers, state])
}
