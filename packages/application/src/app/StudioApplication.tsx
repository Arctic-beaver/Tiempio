import { useMemo, useSyncExternalStore, type JSX } from 'react'
import { CommandProvider } from '../commands/CommandProvider.js'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { usePresentationSettings } from '../providers/PresentationSettingsContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useTransportCommandHandlers } from '../project/useTransportCommandHandlers.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { StudioShell } from '../shell/StudioShell.js'
import { ActiveStudioView } from './ActiveStudioView.js'
import { useStudioNavigation } from './useStudioNavigation.js'

export function StudioApplication(): JSX.Element {
	const runtime = useApplicationRuntime()
	const controller = useApplicationRuntimeController()
	const { metronomeEnabled, setMetronomeEnabled } = usePresentationSettings()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const recording = useSyncExternalStore(
		controller.recordingCoordinator.subscribe,
		controller.recordingCoordinator.getSnapshot,
		controller.recordingCoordinator.getSnapshot
	)
	const projectSession = useProjectSession()
	const navigation = useStudioNavigation()
	const transportCommandHandlers = useTransportCommandHandlers()
	const projectsAvailable =
		runtime.projects.availability === 'available' && controller.openProject !== undefined
	const handlers = useMemo<CommandHandlerMap>(
		() => ({
			...navigation.commandHandlers,
			...transportCommandHandlers,
			...(projectsAvailable
				? {
						'project.open': async () => {
							const result = await controller.openProject!()
							if (!result.ok) return
							projectSession.replaceProject(result.value.project, result.value.handle)
							navigation.commandHandlers['studio.piano-roll']?.()
						}
					}
				: {}),
			'transport.toggle-metronome': () => setMetronomeEnabled(!metronomeEnabled),
			'project.undo': projectSession.undo,
			'project.redo': projectSession.redo
		}),
		[
			controller,
			navigation.commandHandlers,
			projectSession,
			projectsAvailable,
			metronomeEnabled,
			setMetronomeEnabled,
			transportCommandHandlers
		]
	)
	const commandAvailability = useMemo(
		() => ({
			activeDrawer: navigation.state.activeDrawer,
			canRedo: projectSession.snapshot.canRedo,
			canUndo: projectSession.snapshot.canUndo,
			engineAvailable: engine.available,
			projectRevision: projectSession.snapshot.revision,
			recordingActive: ['starting', 'count-in', 'recording', 'stopping'].includes(
				recording.phase
			)
		}),
		[
			navigation.state.activeDrawer,
			projectSession.snapshot.canRedo,
			projectSession.snapshot.canUndo,
			projectSession.snapshot.revision,
			engine.available,
			recording.phase
		]
	)

	return (
		<CommandProvider
			availability={commandAvailability}
			handlers={handlers}
			looping={projectSession.projections.transport.looping}
		>
			<StudioShell
				activeDrawer={navigation.state.activeDrawer}
				activeView={navigation.state.activeView}
				target={runtime.target}
			>
				<ActiveStudioView activeView={navigation.state.activeView} />
			</StudioShell>
		</CommandProvider>
	)
}
