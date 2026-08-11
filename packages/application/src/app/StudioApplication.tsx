import { useEffect, useMemo, useSyncExternalStore, type JSX } from 'react'
import { CommandProvider } from '../commands/CommandProvider.js'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useTransportCommandHandlers } from '../project/useTransportCommandHandlers.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { StudioShell } from '../shell/StudioShell.js'
import { ActiveStudioView } from './ActiveStudioView.js'
import { useStudioNavigation } from './useStudioNavigation.js'

export function StudioApplication(): JSX.Element {
	const runtime = useApplicationRuntime()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const projectSession = useProjectSession()
	const navigation = useStudioNavigation()
	const transportCommandHandlers = useTransportCommandHandlers()
	useEffect(() => {
		controller.setAuditionEnabled(navigation.state.activeView === 'sound-chooser')
		return () => controller.setAuditionEnabled(false)
	}, [controller, navigation.state.activeView])
	const handlers = useMemo<CommandHandlerMap>(
		() => ({
			...navigation.commandHandlers,
			...transportCommandHandlers,
			'project.undo': projectSession.undo,
			'project.redo': projectSession.redo
		}),
		[
			navigation.commandHandlers,
			projectSession.redo,
			projectSession.undo,
			transportCommandHandlers
		]
	)
	const commandAvailability = useMemo(
		() => ({
			activeDrawer: navigation.state.activeDrawer,
			canRedo: projectSession.snapshot.canRedo,
			canUndo: projectSession.snapshot.canUndo,
			engineAvailable: engine.available,
			projectRevision: projectSession.snapshot.revision
		}),
		[
			navigation.state.activeDrawer,
			projectSession.snapshot.canRedo,
			projectSession.snapshot.canUndo,
			projectSession.snapshot.revision,
			engine.available
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
