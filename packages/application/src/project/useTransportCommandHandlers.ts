import { useMemo } from 'react'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import { useProjectSession } from './ProjectSessionContext.js'

export function useTransportCommandHandlers(): CommandHandlerMap {
	const projectSession = useProjectSession()
	return useMemo(
		() => ({
			'transport.toggle-loop': () => {
				const snapshot = projectSession.getSnapshot()
				const loop = snapshot.project.transport.loop
				projectSession.dispatch({
					type: 'transport.loop.set',
					baseRevision: snapshot.revision,
					enabled: !loop.enabled,
					startTick: loop.startTick,
					endTick: loop.endTick
				})
			}
		}),
		[projectSession]
	)
}
