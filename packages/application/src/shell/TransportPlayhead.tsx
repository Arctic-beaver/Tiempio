import { useSyncExternalStore, type JSX } from 'react'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { transportPositionPercent } from './transport-presentation.js'

export interface TransportPlayheadProperties {
	readonly endTick?: number
	readonly startTick?: number
}

export function TransportPlayhead({
	endTick,
	startTick
}: TransportPlayheadProperties = {}): JSX.Element {
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const { snapshot } = useProjectSession()
	const loop = snapshot.project.transport.loop
	const position = transportPositionPercent(
		engine.tick,
		startTick ?? loop.startTick,
		endTick ?? loop.endTick
	)
	return <div aria-hidden="true" className="playhead" style={{ left: `${String(position)}%` }} />
}
