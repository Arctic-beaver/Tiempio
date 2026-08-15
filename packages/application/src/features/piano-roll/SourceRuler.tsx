import type { JSX } from 'react'
import type { SourceViewportWindow } from './source-viewport.js'

export interface SourceRulerProperties {
	readonly canvasTicks: number
	readonly label: string
	readonly markerLabel: (bar: number, beat: number) => string
	readonly meterNumerator: number
	readonly onSeek: (tick: number) => void
	readonly ticksPerBeat: number
	readonly visibleWindow: SourceViewportWindow
}

export function SourceRuler({
	canvasTicks,
	label,
	markerLabel,
	meterNumerator,
	onSeek,
	ticksPerBeat,
	visibleWindow
}: SourceRulerProperties): JSX.Element {
	const beatCount = Math.ceil(canvasTicks / ticksPerBeat)
	const firstBeat = Math.max(0, Math.floor(visibleWindow.startTick / ticksPerBeat) - 2)
	const lastBeat = Math.min(
		beatCount,
		firstBeat + 256,
		Math.ceil(visibleWindow.endTick / ticksPerBeat) + 3
	)
	return (
		<div aria-label={label} className="roll-ruler source-ruler" role="group">
			{Array.from({ length: Math.max(0, lastBeat - firstBeat) }, (_, offset) => {
				const beatIndex = firstBeat + offset
				const tick = beatIndex * ticksPerBeat
				const downbeat = beatIndex % meterNumerator === 0
				const bar = Math.floor(beatIndex / meterNumerator) + 1
				const beat = (beatIndex % meterNumerator) + 1
				return (
					<button
						aria-label={markerLabel(bar, beat)}
						className="transport-ruler__marker source-ruler__marker"
						data-downbeat={downbeat || undefined}
						key={tick}
						onClick={() => onSeek(tick)}
						style={{
							left: `${String((tick / canvasTicks) * 100)}%`,
							width: `${String((ticksPerBeat / canvasTicks) * 100)}%`
						}}
						type="button"
					>
						<span>{downbeat ? bar : beat}</span>
					</button>
				)
			})}
		</div>
	)
}
