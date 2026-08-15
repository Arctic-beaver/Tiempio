import { Pause, Repeat2 } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import type { BrickPreviewCursorSnapshot } from '../../preview/brick-preview-session.js'
import { SourcePlayhead } from '../piano-roll/SourcePlayhead.js'
import { useSourceViewport } from '../piano-roll/useSourceViewport.js'
import type { ArrangementLayerViewModel } from './view-model.js'

export interface BrickSourceEditorProperties {
	readonly cursor: BrickPreviewCursorSnapshot | undefined
	readonly layer: ArrangementLayerViewModel
	readonly onSeekRunningSource: (tick: number, cycleIteration: number) => void
	readonly onSuspendRunningSource: () => void
	readonly ticksPerQuarter: number
}

export function BrickSourceEditor({
	cursor,
	layer,
	onSeekRunningSource,
	onSuspendRunningSource,
	ticksPerQuarter
}: BrickSourceEditorProperties): JSX.Element {
	const { t } = useLocalization()
	const gridRef = useRef<HTMLDivElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const [seeking, setSeeking] = useState(false)
	const gestureOrigin = useRef<{
		iteration: number
		manualTick: number
		running: boolean
	} | null>(null)
	const defaults = useMemo(
		() => ({
			pitchAnchor:
				layer.notes.length === 0
					? 60
					: layer.notes.reduce((sum, note) => sum + note.pitch, 0) / layer.notes.length
		}),
		[layer.notes]
	)
	const viewport = useSourceViewport(layer.id, defaults)
	const running = cursor?.running === true
	const playheadTick =
		running && !seeking
			? Math.min(layer.cycleTicks, cursor.localTick)
			: Math.min(layer.cycleTicks, viewport.state.manualPlayheadTick)
	const pitches = layer.notes.map((note) => note.pitch)
	const lowest = Math.min(...pitches, 48)
	const highest = Math.max(...pitches, 72)
	const pitchSpan = Math.max(12, highest - lowest + 1)
	const beats = Math.max(1, Math.ceil(layer.cycleTicks / ticksPerQuarter))

	return (
		<section className="brick-source-editor">
			<header>
				<div>
					<strong>{t('arrangement.sourceEditor')}</strong>
					<span>{t('arrangement.linkedSourceHint')}</span>
				</div>
				<div className="brick-source-editor__cycle">
					<Repeat2 aria-hidden="true" />
					<span>{t('arrangement.cycleTicks', { count: layer.cycleTicks })}</span>
					{layer.tailRestTicks > 0 ? (
						<span>
							<Pause aria-hidden="true" />
							{t('arrangement.pauseTicks', { count: layer.tailRestTicks })}
						</span>
					) : null}
				</div>
			</header>
			<div className="brick-source-scroll" ref={scrollRef}>
				<div
					aria-label={t('arrangement.sourceCanvas')}
					className="brick-source-grid"
					ref={gridRef}
					role="group"
				>
					<div aria-hidden="true" className="brick-source-ruler">
						{Array.from({ length: Math.min(64, beats) }, (_, index) => (
							<span key={index} style={{ left: `${String((index / beats) * 100)}%` }}>
								{index + 1}
							</span>
						))}
					</div>
					<div aria-hidden="true" className="brick-source-events">
						{layer.notes.map((note) => (
							<span
								className="brick-source-note"
								key={note.id}
								style={
									{
										left: `${String((note.startTick / layer.cycleTicks) * 100)}%`,
										top: `${String(8 + ((highest - note.pitch) / pitchSpan) * 76)}%`,
										width: `${String(Math.max(1.5, (note.durationTicks / layer.cycleTicks) * 100))}%`
									} as CSSProperties
								}
							/>
						))}
						{layer.hits.map((hit, index) => (
							<span
								className="brick-source-hit"
								data-instrument={hit.instrument}
								key={hit.id}
								style={{
									left: `${String((hit.tick / layer.cycleTicks) * 100)}%`,
									top: `${String(18 + (index % 5) * 14)}%`
								}}
							/>
						))}
						{layer.tailRestTicks > 0 ? (
							<span
								className="brick-source-rest"
								style={{
									left: `${String((layer.materialLengthTicks / layer.cycleTicks) * 100)}%`,
									width: `${String((layer.tailRestTicks / layer.cycleTicks) * 100)}%`
								}}
							>
								{t('arrangement.cyclePause')}
							</span>
						) : null}
					</div>
					<SourcePlayhead
						canvasTicks={layer.cycleTicks}
						gridRef={gridRef}
						gridTicks={Math.max(1, Math.round(ticksPerQuarter / 4))}
						label={t('arrangement.sourcePlayhead')}
						onSeek={(tick) => viewport.update({ manualPlayheadTick: tick })}
						onSeekCancel={() => {
							const origin = gestureOrigin.current
							if (origin !== null) {
								viewport.update({ manualPlayheadTick: origin.manualTick })
								if (origin.running)
									onSeekRunningSource(cursor?.localTick ?? 0, origin.iteration)
							}
							gestureOrigin.current = null
							setSeeking(false)
						}}
						onSeekCommit={(tick) => {
							const origin = gestureOrigin.current
							if (origin?.running === true)
								onSeekRunningSource(tick, origin.iteration)
							gestureOrigin.current = null
							setSeeking(false)
						}}
						onSeekStart={() => {
							gestureOrigin.current = {
								iteration: cursor?.cycleIteration ?? 0,
								manualTick: viewport.state.manualPlayheadTick,
								running
							}
							setSeeking(true)
							if (running) onSuspendRunningSource()
						}}
						playheadTick={playheadTick}
						scrollRef={scrollRef}
						ticksPerBeat={ticksPerQuarter}
					/>
				</div>
			</div>
		</section>
	)
}
