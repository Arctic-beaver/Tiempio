import { useMemo } from 'react'
import type { CommandHandlerMap } from '../commands/command-availability.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { useProjectSession } from './ProjectSessionContext.js'

export function useTransportCommandHandlers(): CommandHandlerMap {
	const projectSession = useProjectSession()
	const controller = useApplicationRuntimeController()
	return useMemo(
		() => ({
			'transport.toggle-playback': () => controller.togglePlayback(),
			'transport.stop': () => controller.stop(),
			'transport.toggle-loop': () => {
				const snapshot = projectSession.getSnapshot()
				const loop = snapshot.project.transport.loop
				const enabled = !loop.enabled
				projectSession.dispatch({
					type: 'transport.loop.set',
					baseRevision: snapshot.revision,
					enabled,
					startTick: loop.startTick,
					endTick: loop.endTick
				})
				controller.setLoop({
					enabled,
					startTick: loop.startTick,
					endTick: loop.endTick
				})
			}
		}),
		[controller, projectSession]
	)
}
