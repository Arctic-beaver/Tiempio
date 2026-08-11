import {
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type JSX,
	type KeyboardEvent
} from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { transportRulerMarkers } from './transport-presentation.js'

export interface TransportRulerProperties {
	readonly className?: string
	readonly endTick: number
	readonly granularity: 'bar' | 'beat'
	readonly startTick?: number
}

export function TransportRuler({
	className = '',
	endTick,
	granularity,
	startTick = 0
}: TransportRulerProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const { snapshot } = useProjectSession()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const [focusIndex, setFocusIndex] = useState(0)
	const buttonReferences = useRef<Array<HTMLButtonElement | null>>([])
	const markers = useMemo(
		() =>
			transportRulerMarkers(
				startTick,
				endTick,
				snapshot.project.transport.meterMap,
				snapshot.project.transport.ticksPerQuarter,
				granularity
			),
		[
			endTick,
			granularity,
			snapshot.project.transport.meterMap,
			snapshot.project.transport.ticksPerQuarter,
			startTick
		]
	)
	const seekAt = (index: number): void => {
		const boundedIndex = Math.min(markers.length - 1, Math.max(0, index))
		const marker = markers[boundedIndex]
		if (marker === undefined) return
		setFocusIndex(boundedIndex)
		buttonReferences.current[boundedIndex]?.focus()
		controller.seek(marker.tick)
	}
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
		const targetIndex =
			event.key === 'ArrowLeft'
				? index - 1
				: event.key === 'ArrowRight'
					? index + 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? markers.length - 1
							: null
		if (targetIndex === null) return
		event.preventDefault()
		seekAt(targetIndex)
	}
	const currentIndex = markers.findIndex(
		(marker) => engine.tick >= marker.tick && engine.tick < marker.tick + marker.durationTicks
	)
	const style = {
		gridTemplateColumns: markers.map((marker) => `${String(marker.durationTicks)}fr`).join(' '),
		minWidth: `${String(markers.length * 48)}px`
	} satisfies CSSProperties

	return (
		<div
			aria-label={t('transport.ruler')}
			className={`transport-ruler ${className}`.trim()}
			role="group"
			style={style}
		>
			{markers.map((marker, index) => (
				<button
					aria-current={index === currentIndex ? 'time' : undefined}
					aria-label={t('transport.seekBarBeat', {
						bar: marker.bar,
						beat: marker.beat
					})}
					className="transport-ruler__marker"
					data-downbeat={marker.downbeat || undefined}
					disabled={!engine.available}
					key={marker.tick}
					onClick={() => controller.seek(marker.tick)}
					onFocus={() => setFocusIndex(index)}
					onKeyDown={(event) => handleKeyDown(event, index)}
					ref={(element) => {
						buttonReferences.current[index] = element
					}}
					tabIndex={index === focusIndex ? 0 : -1}
					type="button"
				>
					<span>{marker.downbeat ? marker.bar : marker.beat}</span>
				</button>
			))}
		</div>
	)
}
