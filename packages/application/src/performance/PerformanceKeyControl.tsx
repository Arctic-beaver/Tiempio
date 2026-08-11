import { useSyncExternalStore, type JSX, type PointerEvent } from 'react'
import { performanceKeyLabel, type PerformanceKeyMapping } from '../../../music-theory/src/index.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import {
	performancePointerCaptureLost,
	performancePointerDown,
	performancePointerEnd
} from './performance-input-events.js'

export interface PerformanceKeyControlProperties {
	readonly keyMapping: PerformanceKeyMapping
	readonly ownerId: string
}

export function PerformanceKeyControl({
	keyMapping,
	ownerId
}: PerformanceKeyControlProperties): JSX.Element {
	const { performanceInput } = useApplicationRuntimeController()
	const snapshot = useSyncExternalStore(
		performanceInput.subscribe,
		performanceInput.getSnapshot,
		performanceInput.getSnapshot
	)
	const held = snapshot.heldKeys.some(
		(key) => key.code === keyMapping.code && key.pitch === keyMapping.midi
	)
	const finishPointer = (event: PointerEvent<HTMLButtonElement>): void => {
		performancePointerEnd(performanceInput, event)
	}
	return (
		<button
			aria-label={`${keyMapping.label}, ${performanceKeyLabel(keyMapping.code)}`}
			aria-pressed={held}
			className={`key-white${keyMapping.tonic ? ' tonic' : ''}`}
			onLostPointerCapture={(event) =>
				performancePointerCaptureLost(performanceInput, event.pointerId)
			}
			onPointerCancel={finishPointer}
			onPointerDown={(event) =>
				performancePointerDown(performanceInput, ownerId, keyMapping.code, event)
			}
			onPointerUp={finishPointer}
			type="button"
		>
			<strong className="performance-key__pitch">{keyMapping.noteName}</strong>
			<span className="performance-key__code">{performanceKeyLabel(keyMapping.code)}</span>
		</button>
	)
}
