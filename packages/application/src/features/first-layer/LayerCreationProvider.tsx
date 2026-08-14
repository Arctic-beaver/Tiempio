import { useEffect, useMemo, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { LayerCreationContext } from './LayerCreationContext.js'
import { LayerCreationCoordinator } from './layer-creation-coordinator.js'

export interface LayerCreationProviderProperties {
	readonly children: ReactNode
}

export function LayerCreationProvider({ children }: LayerCreationProviderProperties): JSX.Element {
	const controller = useApplicationRuntimeController()
	const projectSession = useProjectSession()
	const [coordinator] = useState(
		() =>
			new LayerCreationCoordinator({
				onAuditionInvalidated: () => {
					controller.previewCoordinator.interrupt()
					controller.performanceInput.deactivate('sound-chooser')
					void controller.setDraftAuditionLayer(null)
				}
			})
	)
	const snapshot = useSyncExternalStore(
		coordinator.subscribe,
		coordinator.getSnapshot,
		coordinator.getSnapshot
	)
	const projectId = projectSession.snapshot.project.projectId
	useEffect(() => {
		coordinator.invalidateForProject(projectId)
	}, [coordinator, projectId])
	const value = useMemo(() => ({ coordinator, snapshot }), [coordinator, snapshot])
	return <LayerCreationContext.Provider value={value}>{children}</LayerCreationContext.Provider>
}
