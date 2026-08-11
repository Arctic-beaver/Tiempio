import { useSyncExternalStore, type JSX, type PointerEvent } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { performanceKeyLabel, type PerformanceKeyMapping } from '../../../music-theory/src/index.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import {
	performancePointerCaptureLost,
	performancePointerDown,
	performancePointerEnd
} from './performance-input-events.js'

export interface PerformanceKeyControlProperties {
	readonly chordTone?: boolean
	readonly keyMapping: PerformanceKeyMapping
	readonly ownerId: string
	readonly previewHeld?: boolean
}

export function PerformanceKeyControl({
	chordTone = false,
	keyMapping,
	ownerId,
	previewHeld = false
}: PerformanceKeyControlProperties): JSX.Element {
	const { t } = useLocalization()
	const { performanceInput } = useApplicationRuntimeController()
	const snapshot = useSyncExternalStore(
		performanceInput.subscribe,
		performanceInput.getSnapshot,
		performanceInput.getSnapshot
	)
	const held =
		previewHeld ||
		snapshot.heldKeys.some(
			(key) => key.code === keyMapping.code && key.pitch === keyMapping.midi
		)
	const finishPointer = (event: PointerEvent<HTMLButtonElement>): void => {
		performancePointerEnd(performanceInput, event)
	}
	return (
		<button
			aria-label={`${keyMapping.label}, ${performanceKeyLabel(keyMapping.code)}${
				keyMapping.tonic
					? `, ${t('songPalette.homeNote')}`
					: chordTone
						? `, ${t('songPalette.chordTone')}`
						: ''
			}`}
			aria-pressed={held}
			className={`key-white${keyMapping.tonic ? ' tonic' : ''}${chordTone ? ' chord-tone' : ''}`}
			data-role={keyMapping.tonic ? 'tonic' : chordTone ? 'chord' : 'palette'}
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
