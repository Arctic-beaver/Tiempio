import { useMemo, type JSX } from 'react'
import { CommandProvider } from '../commands/CommandProvider.js'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useTransportCommandHandlers } from '../project/useTransportCommandHandlers.js'
import { StudioShell } from '../shell/StudioShell.js'
import { ActiveStudioView } from './ActiveStudioView.js'
import { useStudioNavigation } from './useStudioNavigation.js'

export function StudioApplication(): JSX.Element {
	const runtime = useApplicationRuntime()
	const projectSession = useProjectSession()
	const navigation = useStudioNavigation()
	const transportCommandHandlers = useTransportCommandHandlers()
	const handlers = useMemo<CommandHandlerMap>(
		() => ({ ...navigation.commandHandlers, ...transportCommandHandlers }),
		[navigation.commandHandlers, transportCommandHandlers]
	)
	const commandAvailability = useMemo(
		() => ({
			activeDrawer: navigation.state.activeDrawer,
			engineAvailable: runtime.engine.availability === 'available',
			projectRevision: projectSession.snapshot.revision
		}),
		[
			navigation.state.activeDrawer,
			projectSession.snapshot.revision,
			runtime.engine.availability
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
