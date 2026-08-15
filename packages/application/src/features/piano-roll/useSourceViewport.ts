import { useCallback, useSyncExternalStore } from 'react'
import {
	sourceViewportStore,
	type SourceViewportDefaults,
	type SourceViewportState,
	type SourceViewportUpdate
} from './source-viewport.js'

export interface SourceViewportBinding {
	readonly state: SourceViewportState
	readonly update: (update: SourceViewportUpdate) => void
}

export function useSourceViewport(
	sourceLayerId: string,
	defaults: SourceViewportDefaults
): SourceViewportBinding {
	const subscribe = useCallback(
		(listener: () => void) => sourceViewportStore.subscribe(sourceLayerId, listener),
		[sourceLayerId]
	)
	const getSnapshot = useCallback(
		() => sourceViewportStore.get(sourceLayerId, defaults),
		[defaults, sourceLayerId]
	)
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
	const update = useCallback(
		(next: SourceViewportUpdate): void => {
			sourceViewportStore.update(sourceLayerId, defaults, next)
		},
		[defaults, sourceLayerId]
	)
	return { state, update }
}
