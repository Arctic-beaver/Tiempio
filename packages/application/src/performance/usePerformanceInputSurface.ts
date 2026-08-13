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

export type PerformanceKeyboardCapture = 'surface' | 'document'

export function usePerformanceInputSurface(
	ownerId: string,
	layerId: string | null,
	mapping: readonly PerformanceKeyMapping[],
	keyboardCapture: PerformanceKeyboardCapture = 'surface'
): PerformanceInputSurfaceBindings {
	const { performanceInput } = useApplicationRuntimeController()

	useEffect(() => {
		if (layerId === null) return
		if (keyboardCapture === 'document') {
			performanceInput.activate(ownerId, layerId, mapping)
			return
		}
		performanceInput.remap(ownerId, layerId, mapping)
	}, [keyboardCapture, layerId, mapping, ownerId, performanceInput])

	useEffect(() => {
		if (keyboardCapture !== 'document') return
		const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
			performanceKeyDown(performanceInput, ownerId, event)
		}
		const handleKeyUp = (event: globalThis.KeyboardEvent): void => {
			performanceKeyUp(performanceInput, event)
		}
		const releaseOwnedNotes = (): void => {
			if (performanceInput.getSnapshot().ownerId === ownerId) performanceInput.releaseAll()
		}
		const handleVisibilityChange = (): void => {
			if (document.visibilityState !== 'visible') releaseOwnedNotes()
		}
		document.addEventListener('keydown', handleKeyDown)
		document.addEventListener('keyup', handleKeyUp)
		document.addEventListener('visibilitychange', handleVisibilityChange)
		window.addEventListener('blur', releaseOwnedNotes)
		return () => {
			document.removeEventListener('keydown', handleKeyDown)
			document.removeEventListener('keyup', handleKeyUp)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			window.removeEventListener('blur', releaseOwnedNotes)
		}
	}, [keyboardCapture, ownerId, performanceInput])

	useEffect(() => {
		return () => {
			performanceInput.deactivate(ownerId)
		}
	}, [ownerId, performanceInput])

	return {
		tabIndex: 0,
		onFocusCapture: () => {
			if (layerId !== null) performanceInput.activate(ownerId, layerId, mapping)
		},
		onPointerDownCapture: () => {
			if (layerId !== null) performanceInput.activate(ownerId, layerId, mapping)
		},
		onBlurCapture: (event) => {
			if (keyboardCapture === 'document') return
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
