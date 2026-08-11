import { useEffect, type FocusEvent, type KeyboardEvent } from 'react'
import type { PerformanceKeyMapping } from '../../../music-theory/src/index.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { performanceKeyDown, performanceKeyUp } from './performance-input-events.js'

export interface PerformanceInputSurfaceBindings {
	readonly onBlurCapture: (event: FocusEvent<HTMLElement>) => void
	readonly onFocusCapture: () => void
	readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
	readonly onKeyUp: (event: KeyboardEvent<HTMLElement>) => void
	readonly onPointerDownCapture: () => void
	readonly tabIndex: 0
}

export function usePerformanceInputSurface(
	ownerId: string,
	mapping: readonly PerformanceKeyMapping[]
): PerformanceInputSurfaceBindings {
	const { performanceInput } = useApplicationRuntimeController()

	useEffect(() => {
		performanceInput.remap(ownerId, mapping)
	}, [mapping, ownerId, performanceInput])

	useEffect(() => {
		return () => {
			performanceInput.deactivate(ownerId)
		}
	}, [ownerId, performanceInput])

	return {
		tabIndex: 0,
		onFocusCapture: () => performanceInput.activate(ownerId, mapping),
		onPointerDownCapture: () => performanceInput.activate(ownerId, mapping),
		onBlurCapture: (event) => {
			if (
				event.relatedTarget !== null &&
				event.currentTarget.contains(event.relatedTarget as Node)
			) {
				return
			}
			performanceInput.deactivate(ownerId)
		},
		onKeyDown: (event) => performanceKeyDown(performanceInput, ownerId, event.nativeEvent),
		onKeyUp: (event) => performanceKeyUp(performanceInput, event.nativeEvent)
	}
}
