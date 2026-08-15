import { ChevronDown, ChevronUp, GripVertical, Pause, Play } from 'lucide-react'
import {
	useRef,
	useState,
	type CSSProperties,
	type DragEvent,
	type JSX,
	type KeyboardEvent,
	type PointerEvent
} from 'react'
import { IconButton, ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type { ProjectedLayerItem } from '../../project/projections/types.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import {
	arrangementGestureResult,
	arrangementTickAtPoint,
	type ArrangementGestureKind,
	type ArrangementGestureResult
} from './arrangement-interactions.js'
import type { ArrangementInstanceViewModel, ArrangementLayerViewModel } from './view-model.js'

interface InstanceGesture {
	readonly kind: ArrangementGestureKind
	readonly originClientX: number
	readonly pointerId: number
}

interface SongInstanceProperties {
	readonly endTick: number
	readonly gridTicks: number
	readonly instance: ArrangementInstanceViewModel
	readonly layer: ProjectedLayerItem
	readonly onDelete: () => void
	readonly onSelect: () => void
	readonly onSplit: (offsetTicks: number) => void
	readonly onUpdate: (kind: ArrangementGestureKind, result: ArrangementGestureResult) => void
	readonly selected: boolean
}

function instanceColor(layer: ProjectedLayerItem): string {
	if (layer.labelKey === 'layers.drums') return 'var(--ti-track-drum)'
	if (layer.labelKey === 'layers.chords') return 'var(--ti-track-harmony)'
	if (layer.labelKey === 'layers.melody') return 'var(--ti-track-lead)'
	return 'var(--ti-track-bass)'
}

function SongInstance({
	endTick,
	gridTicks,
	instance,
	layer,
	onDelete,
	onSelect,
	onSplit,
	onUpdate,
	selected
}: SongInstanceProperties): JSX.Element {
	const { t } = useLocalization()
	const [draft, setDraft] = useState<ArrangementGestureResult | null>(null)
	const gestureRef = useRef<InstanceGesture | null>(null)
	const draftRef = useRef<ArrangementGestureResult | null>(null)
	const visible = draft ?? instance
	const beginGesture = (
		event: PointerEvent<HTMLButtonElement>,
		kind: ArrangementGestureKind
	): void => {
		if (event.button !== 0) return
		event.preventDefault()
		event.stopPropagation()
		onSelect()
		event.currentTarget.setPointerCapture(event.pointerId)
		const nextGesture = { kind, pointerId: event.pointerId, originClientX: event.clientX }
		gestureRef.current = nextGesture
	}
	const moveGesture = (event: PointerEvent<HTMLButtonElement>): void => {
		const activeGesture = gestureRef.current
		if (activeGesture?.pointerId !== event.pointerId) return
		const parent = event.currentTarget.closest<HTMLElement>('.song-timeline')
		if (parent === null) return
		const width = parent.getBoundingClientRect().width
		const deltaTicks =
			((event.clientX - activeGesture.originClientX) / Math.max(1, width)) * endTick
		const nextDraft = arrangementGestureResult(
			instance,
			activeGesture.kind,
			deltaTicks,
			gridTicks
		)
		draftRef.current = nextDraft
		setDraft(nextDraft)
	}
	const finishGesture = (event: PointerEvent<HTMLButtonElement>, commit: boolean): void => {
		const activeGesture = gestureRef.current
		if (activeGesture?.pointerId !== event.pointerId) return
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		if (commit && draftRef.current !== null) onUpdate(activeGesture.kind, draftRef.current)
		gestureRef.current = null
		draftRef.current = null
		setDraft(null)
	}
	const handleKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault()
			onDelete()
			return
		}
		if (event.key === '/') {
			event.preventDefault()
			const offset = Math.round(instance.durationTicks / gridTicks / 2) * gridTicks
			if (offset > 0 && offset < instance.durationTicks) onSplit(offset)
			return
		}
		const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
		if (direction === 0) return
		event.preventDefault()
		const kind: ArrangementGestureKind = event.shiftKey
			? 'resize-left'
			: event.altKey
				? 'resize-right'
				: 'move'
		onUpdate(kind, arrangementGestureResult(instance, kind, direction * gridTicks, gridTicks))
	}
	return (
		<div
			className="song-instance"
			data-selected={selected || undefined}
			style={
				{
					left: `${String((visible.startTick / endTick) * 100)}%`,
					width: `${String(Math.max(1.25, (visible.durationTicks / endTick) * 100))}%`,
					'--instance-color': instanceColor(layer)
				} as CSSProperties
			}
		>
			<button
				aria-label={t('arrangement.selectInstance', { layer: editorLayerName(layer) })}
				aria-selected={selected}
				className="song-instance__body"
				onClick={onSelect}
				onKeyDown={handleKey}
				onPointerCancel={(event) => finishGesture(event, false)}
				onPointerDown={(event) => beginGesture(event, 'move')}
				onPointerMove={moveGesture}
				onPointerUp={(event) => finishGesture(event, true)}
				type="button"
			>
				<strong>{editorLayerSound(layer)}</strong>
				<small>{t('arrangement.linkedInstance')}</small>
			</button>
			<button
				aria-label={t('arrangement.trimLeft')}
				className="song-instance__handle song-instance__handle--left"
				onPointerCancel={(event) => finishGesture(event, false)}
				onPointerDown={(event) => beginGesture(event, 'resize-left')}
				onPointerMove={moveGesture}
				onPointerUp={(event) => finishGesture(event, true)}
				type="button"
			/>
			<button
				aria-label={t('arrangement.loopResize')}
				className="song-instance__handle song-instance__handle--right"
				onPointerCancel={(event) => finishGesture(event, false)}
				onPointerDown={(event) => beginGesture(event, 'resize-right')}
				onPointerMove={moveGesture}
				onPointerUp={(event) => finishGesture(event, true)}
				type="button"
			/>
		</div>
	)
}

export interface SongDockProperties {
	readonly endTick: number
	readonly expanded: boolean
	readonly layers: readonly ProjectedLayerItem[]
	readonly modelLayers: readonly ArrangementLayerViewModel[]
	readonly onDeleteInstance: (instanceId: string) => void
	readonly onPlaceInstance: (
		layerId: string,
		startTick: number,
		durationTicks: number
	) => string | null
	readonly onSelectInstance: (instanceId: string) => void
	readonly onSplitInstance: (instanceId: string, offsetTicks: number) => void
	readonly onToggleExpanded: () => void
	readonly onTogglePlayback: () => void
	readonly onUpdateInstance: (
		instanceId: string,
		kind: ArrangementGestureKind,
		result: ArrangementGestureResult
	) => void
	readonly playing: boolean
	readonly selectedInstanceId: string | null
	readonly ticksPerQuarter: number
}

export function SongDock({
	endTick,
	expanded,
	layers,
	modelLayers,
	onDeleteInstance,
	onPlaceInstance,
	onSelectInstance,
	onSplitInstance,
	onToggleExpanded,
	onTogglePlayback,
	onUpdateInstance,
	playing,
	selectedInstanceId,
	ticksPerQuarter
}: SongDockProperties): JSX.Element {
	const { t } = useLocalization()
	const timelineEnd = Math.max(endTick, ticksPerQuarter * 4 * 16)
	const gridTicks = Math.max(1, Math.round(ticksPerQuarter / 4))
	const bars = Math.ceil(timelineEnd / (ticksPerQuarter * 4))
	const dropLayer = (
		event: DragEvent<HTMLDivElement>,
		layer: ArrangementLayerViewModel
	): void => {
		event.preventDefault()
		const sourceLayerId = event.dataTransfer.getData('application/x-tiempio-source-layer')
		if (sourceLayerId !== layer.id) return
		const bounds = event.currentTarget.getBoundingClientRect()
		const startTick =
			Math.round(
				arrangementTickAtPoint(event.clientX, bounds.left, bounds.width, timelineEnd) /
					gridTicks
			) * gridTicks
		onPlaceInstance(layer.id, startTick, layer.cycleTicks)
	}
	return (
		<section className="song-dock" data-expanded={expanded || undefined}>
			<header>
				<button
					aria-expanded={expanded}
					className="song-dock__toggle"
					onClick={onToggleExpanded}
					type="button"
				>
					{expanded ? (
						<ChevronDown aria-hidden="true" />
					) : (
						<ChevronUp aria-hidden="true" />
					)}
					<span>
						<strong>{t('arrangement.song')}</strong>
						<small>
							{t('arrangement.songSummary', { bars, count: layers.length })}
						</small>
					</span>
				</button>
				<span>{t('arrangement.songHint')}</span>
				<IconButton
					icon={playing ? <Pause /> : <Play />}
					label={t(playing ? 'transport.pause' : 'arrangement.playSong')}
					onClick={onTogglePlayback}
					selected={playing}
					tone="accent"
				/>
			</header>
			{expanded ? (
				<div className="song-dock__body">
					<div className="song-lane-labels">
						<div className="song-lane-labels__ruler" />
						{layers.map((layer) => (
							<button
								className="song-lane-label"
								key={layer.id}
								onClick={() =>
									document
										.querySelector<HTMLElement>(
											`[data-layer-id="${CSS.escape(layer.id)}"]`
										)
										?.focus()
								}
								type="button"
							>
								<GripVertical aria-hidden="true" />
								<span>
									<strong>{editorLayerName(layer)}</strong>
									<small>{editorLayerSound(layer)}</small>
								</span>
							</button>
						))}
					</div>
					<ScrollSurface className="song-timeline-scroll" direction="horizontal">
						<div
							className="song-timeline"
							style={{ minWidth: `${String(Math.max(768, bars * 72))}px` }}
						>
							<div aria-hidden="true" className="song-timeline__ruler">
								{Array.from({ length: bars }, (_, index) => (
									<span
										key={index}
										style={{ left: `${String((index / bars) * 100)}%` }}
									>
										{index + 1}
									</span>
								))}
							</div>
							{modelLayers.map((modelLayer) => {
								const layer = layers.find(
									(candidate) => candidate.id === modelLayer.id
								)
								if (layer === undefined) return null
								return (
									<div
										className="song-lane"
										key={layer.id}
										onDragOver={(event) => {
											event.preventDefault()
											event.dataTransfer.dropEffect = 'copy'
										}}
										onDrop={(event) => dropLayer(event, modelLayer)}
									>
										{modelLayer.instances.map((instance) => (
											<SongInstance
												endTick={timelineEnd}
												gridTicks={gridTicks}
												instance={instance}
												key={instance.id}
												layer={layer}
												onDelete={() => onDeleteInstance(instance.id)}
												onSelect={() => onSelectInstance(instance.id)}
												onSplit={(offset) =>
													onSplitInstance(instance.id, offset)
												}
												onUpdate={(kind, result) =>
													onUpdateInstance(instance.id, kind, result)
												}
												selected={selectedInstanceId === instance.id}
											/>
										))}
									</div>
								)
							})}
						</div>
					</ScrollSurface>
				</div>
			) : null}
		</section>
	)
}
