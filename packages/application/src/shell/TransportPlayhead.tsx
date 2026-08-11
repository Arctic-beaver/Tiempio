import { useSyncExternalStore, type JSX } from 'react'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { transportPositionPercent } from './transport-presentation.js'

export function TransportPlayhead(): JSX.Element {
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const { snapshot } = useProjectSession()
	const loop = snapshot.project.transport.loop
	const position = transportPositionPercent(engine.tick, loop.startTick, loop.endTick)
	return <div aria-hidden="true" className="playhead" style={{ left: `${String(position)}%` }} />
}
