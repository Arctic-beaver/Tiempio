import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import type { JSX } from 'react'
import type { SourceViewportNote } from './source-viewport.js'

export interface SourceOffscreenIndicatorsProperties {
	readonly above: readonly SourceViewportNote[]
	readonly below: readonly SourceViewportNote[]
	readonly canvasTicks: number
	readonly higherLabel: (count: number) => string
	readonly lowerLabel: (count: number) => string
	readonly onRevealPitch: (pitch: number) => void
}

interface IndicatorProperties {
	readonly canvasTicks: number
	readonly direction: 'above' | 'below'
	readonly icon: LucideIcon
	readonly label: string
	readonly notes: readonly SourceViewportNote[]
	readonly onRevealPitch: (pitch: number) => void
}

function Indicator({
	canvasTicks,
	direction,
	icon: Icon,
	label,
	notes,
	onRevealPitch
}: IndicatorProperties): JSX.Element | null {
	if (notes.length === 0) return null
	const target = notes.reduce((nearest, note) =>
		direction === 'above'
			? note.pitchValue < nearest.pitchValue
				? note
				: nearest
			: note.pitchValue > nearest.pitchValue
				? note
				: nearest
	)
	return (
		<button
			aria-label={label}
			className={`offscreen-note-indicator ${direction}`}
			onClick={() => onRevealPitch(target.pitchValue)}
			type="button"
		>
			{notes.slice(0, 12).map((note) => (
				<span
					aria-hidden="true"
					className="offscreen-note-ghost"
					key={note.id}
					style={{
						left: `${String((note.startTick / Math.max(1, canvasTicks)) * 100)}%`,
						width: `${String((note.durationTicks / Math.max(1, canvasTicks)) * 100)}%`
					}}
				/>
			))}
			<span className="offscreen-note-count">
				<Icon aria-hidden="true" /> {notes.length}
			</span>
		</button>
	)
}

export function SourceOffscreenIndicators({
	above,
	below,
	canvasTicks,
	higherLabel,
	lowerLabel,
	onRevealPitch
}: SourceOffscreenIndicatorsProperties): JSX.Element {
	return (
		<>
			<Indicator
				canvasTicks={canvasTicks}
				direction="above"
				icon={ArrowUp}
				label={higherLabel(above.length)}
				notes={above}
				onRevealPitch={onRevealPitch}
			/>
			<Indicator
				canvasTicks={canvasTicks}
				direction="below"
				icon={ArrowDown}
				label={lowerLabel(below.length)}
				notes={below}
				onRevealPitch={onRevealPitch}
			/>
		</>
	)
}
