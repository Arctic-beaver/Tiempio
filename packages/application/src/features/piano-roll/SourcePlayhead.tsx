import { useRef, type JSX, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { tickAtSourcePointer } from './source-viewport.js'

export interface SourcePlayheadProperties {
	readonly canvasTicks: number
	readonly gridRef: RefObject<HTMLDivElement | null>
	readonly label: string
	readonly onSeek: (tick: number) => void
	readonly playheadTick: number
	readonly scrollRef: RefObject<HTMLDivElement | null>
	readonly ticksPerBeat: number
	readonly gridTicks: number
}

export function SourcePlayhead({
	canvasTicks,
	gridRef,
	gridTicks,
	label,
	onSeek,
	playheadTick,
	scrollRef,
	ticksPerBeat
}: SourcePlayheadProperties): JSX.Element {
	const pointerId = useRef<number | null>(null)
	const seekFromPointer = (clientX: number): void => {
		const grid = gridRef.current
		if (grid === null) return
		const scroll = scrollRef.current
		if (scroll !== null) {
			const bounds = scroll.getBoundingClientRect()
			const edge = 36
			if (clientX < bounds.left + edge) scroll.scrollBy({ left: -edge })
			else if (clientX > bounds.right - edge) scroll.scrollBy({ left: edge })
		}
		const rect = grid.getBoundingClientRect()
		onSeek(tickAtSourcePointer(clientX, rect.left, rect.width, canvasTicks))
	}
	const handlePointer = (event: PointerEvent<HTMLButtonElement>): void => {
		if (pointerId.current !== event.pointerId) return
		event.preventDefault()
		seekFromPointer(event.clientX)
	}
	const finishPointer = (event: PointerEvent<HTMLButtonElement>): void => {
		if (pointerId.current !== event.pointerId) return
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		pointerId.current = null
	}
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? canvasTicks
					: event.key === 'ArrowLeft'
						? playheadTick - (event.shiftKey ? ticksPerBeat : gridTicks)
						: event.key === 'ArrowRight'
							? playheadTick + (event.shiftKey ? ticksPerBeat : gridTicks)
							: null
		if (next === null) return
		event.preventDefault()
		onSeek(Math.min(canvasTicks, Math.max(0, next)))
	}
	return (
		<button
			aria-label={label}
			aria-valuemax={canvasTicks}
			aria-valuemin={0}
			aria-valuenow={playheadTick}
			className="source-playhead"
			onKeyDown={handleKeyDown}
			onPointerCancel={finishPointer}
			onPointerDown={(event) => {
				if (event.button !== 0) return
				event.preventDefault()
				event.stopPropagation()
				pointerId.current = event.pointerId
				event.currentTarget.setPointerCapture(event.pointerId)
				seekFromPointer(event.clientX)
			}}
			onPointerMove={handlePointer}
			onPointerUp={finishPointer}
			role="slider"
			style={{ left: `${String((playheadTick / Math.max(1, canvasTicks)) * 100)}%` }}
			type="button"
		/>
	)
}
