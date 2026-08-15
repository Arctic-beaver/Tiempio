import { PanelRightOpen, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import { IconButton } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { ProjectHistoryControls } from '../../commands/ProjectHistoryControls.js'
import type { BrickPreviewCursorSnapshot } from '../../preview/brick-preview-session.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { ArrangementInspector } from './ArrangementInspector.js'
import { BrickSourceEditor } from './BrickSourceEditor.js'
import { CompositionLayerList } from './CompositionLayerList.js'
import { SongDock } from './SongDock.js'
import type {
	ArrangementGestureKind,
	ArrangementGestureResult
} from './arrangement-interactions.js'
import type {
	ArrangementInstanceViewModel,
	ArrangementLayerViewModel,
	ArrangementViewModel
} from './view-model.js'

function selectedInstance(
	modelLayers: readonly ArrangementLayerViewModel[],
	instanceId: string | null
): ArrangementInstanceViewModel | null {
	if (instanceId === null) return null
	for (const layer of modelLayers) {
		const instance = layer.instances.find((candidate) => candidate.id === instanceId)
		if (instance !== undefined) return instance
	}
	return null
}

function previewCursor(
	cursors: readonly BrickPreviewCursorSnapshot[],
	layerId: string | undefined
): BrickPreviewCursorSnapshot | undefined {
	return layerId === undefined
		? undefined
		: cursors.find((cursor) => cursor.sourceLayerId === layerId)
}

export interface ArrangementViewProperties {
	readonly layers: LayersProjection
	readonly model: ArrangementViewModel & { readonly endTick: number; readonly revision: number }
	readonly onAddLayer: () => void
	readonly onDeleteInstance: (instanceId: string) => void
	readonly onDuplicateAsVariation: (instanceId: string) => string | null
	readonly onDuplicateLinked: (instanceId: string) => string | null
	readonly onOpenSculpt: (item: ProjectedLayerItem) => void
	readonly onPlaceInstance: (
		layerId: string,
		startTick: number,
		durationTicks: number
	) => string | null
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onSplitInstance: (instanceId: string, splitOffsetTicks: number) => string | null
	readonly onUpdateInstance: (
		instanceId: string,
		kind: ArrangementGestureKind,
		result: ArrangementGestureResult
	) => void
	readonly totalBars: number
}

export function ArrangementView({
	layers,
	model,
	onAddLayer,
	onDeleteInstance,
	onDuplicateAsVariation,
	onDuplicateLinked,
	onOpenSculpt,
	onPlaceInstance,
	onSelectLayer,
	onSplitInstance,
	onUpdateInstance,
	totalBars
}: ArrangementViewProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const preview = useSyncExternalStore(
		controller.brickPreviewSession.subscribe,
		controller.brickPreviewSession.getSnapshot,
		controller.brickPreviewSession.getSnapshot
	)
	const initializedSources = useRef(new Set<string>())
	const [dockExpanded, setDockExpanded] = useState(true)
	const [inspectorExpanded, setInspectorExpanded] = useState(true)
	const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
	const activeLayer =
		model.layers.find((layer) => layer.id === layers.activeLayerId) ?? model.layers[0]
	const activeLayerItem = layers.items.find((item) => item.id === activeLayer?.id)
	const activeCursor = previewCursor(preview.cursors, activeLayer?.id)
	const instance = selectedInstance(model.layers, selectedInstanceId)
	const instanceLayer = layers.items.find((item) => item.id === instance?.sourceLayerId)
	const instanceModelLayer = model.layers.find((layer) => layer.id === instance?.sourceLayerId)

	useEffect(() => {
		const currentIds = new Set(model.layers.map((layer) => layer.id))
		for (const enabledId of preview.enabledSourceLayerIds) {
			if (!currentIds.has(enabledId)) {
				controller.brickPreviewSession.setSourceEnabled(enabledId, false)
			}
		}
		for (const layer of model.layers) {
			if (initializedSources.current.has(layer.id)) continue
			initializedSources.current.add(layer.id)
			controller.brickPreviewSession.setSourceEnabled(layer.id, true)
		}
	}, [controller.brickPreviewSession, model.layers, preview.enabledSourceLayerIds])

	const toggleBrickPreview = (): void => {
		if (preview.status !== 'idle') {
			controller.brickPreviewSession.stop()
			return
		}
		const availableIds = new Set(model.layers.map((layer) => layer.id))
		controller.brickPreviewSession.start(
			model.revision,
			preview.enabledSourceLayerIds.filter((id) => availableIds.has(id))
		)
	}
	const selectInstanceAndSource = (instanceId: string): void => {
		setSelectedInstanceId(instanceId)
		setInspectorExpanded(true)
		const selected = selectedInstance(model.layers, instanceId)
		const layer = layers.items.find((item) => item.id === selected?.sourceLayerId)
		if (layer !== undefined) onSelectLayer(layer)
	}
	const splitSelected = (): void => {
		if (instance === null) return
		const gridTicks = Math.max(1, Math.round(model.ticksPerQuarter / 4))
		const offset = Math.round(instance.durationTicks / gridTicks / 2) * gridTicks
		if (offset <= 0 || offset >= instance.durationTicks) return
		const rightId = onSplitInstance(instance.id, offset)
		if (rightId !== null) selectInstanceAndSource(rightId)
	}

	return (
		<section
			className="studio-view arrangement-editor composition-editor"
			data-dock-expanded={dockExpanded || undefined}
			data-inspector-expanded={inspectorExpanded || undefined}
			data-total-bars={totalBars}
			data-testid="view-arrangement"
		>
			<StudioTopBar
				actions={<ProjectHistoryControls />}
				center={
					<div
						aria-label={t('arrangement.brickPreview')}
						className="brick-preview-transport"
						role="toolbar"
					>
						<IconButton
							disabled={!engine.available}
							icon={preview.status === 'idle' ? <Play /> : <Pause />}
							label={t(
								preview.status === 'idle'
									? 'arrangement.playBricks'
									: 'arrangement.stopBricks'
							)}
							onClick={toggleBrickPreview}
							selected={preview.status !== 'idle'}
							tone="accent"
						/>
						<span>
							<strong>{t('arrangement.brickPreview')}</strong>
							<small>
								{t(
									preview.status === 'idle'
										? 'arrangement.previewReady'
										: 'arrangement.previewRunning'
								)}
							</small>
						</span>
					</div>
				}
				subtitle={t('arrangement.linkedComposition')}
				title={layers.projectTitle}
			/>
			<div className="composition-main">
				<CompositionLayerList
					enabledSourceLayerIds={preview.enabledSourceLayerIds}
					layers={layers}
					modelLayers={model.layers}
					onAddLayer={onAddLayer}
					onEditLayer={onOpenSculpt}
					onSelectLayer={(item) => {
						setSelectedInstanceId(null)
						onSelectLayer(item)
					}}
					onToggleSpeaker={(layerId) =>
						controller.brickPreviewSession.setSourceEnabled(
							layerId,
							!preview.enabledSourceLayerIds.includes(layerId)
						)
					}
					ticksPerQuarter={model.ticksPerQuarter}
				/>
				{activeLayer === undefined ? (
					<div className="composition-empty">{t('arrangement.noBricks')}</div>
				) : (
					<BrickSourceEditor
						cursor={activeCursor}
						layer={activeLayer}
						onSeekRunningSource={(tick, iteration) =>
							controller.brickPreviewSession.seekSource(
								activeLayer.id,
								tick,
								true,
								iteration
							)
						}
						onSuspendRunningSource={() =>
							controller.brickPreviewSession.suspendSource(activeLayer.id)
						}
						ticksPerQuarter={model.ticksPerQuarter}
					/>
				)}
				{inspectorExpanded ? (
					<ArrangementInspector
						instance={instance}
						layer={instance === null ? activeLayerItem : instanceLayer}
						modelLayer={instance === null ? activeLayer : instanceModelLayer}
						onClose={() => {
							setInspectorExpanded(false)
							globalThis.queueMicrotask(() =>
								document
									.querySelector<HTMLElement>('[data-inspector-reopen]')
									?.focus()
							)
						}}
						onDelete={() => {
							if (instance === null) return
							onDeleteInstance(instance.id)
							setSelectedInstanceId(null)
						}}
						onDuplicateLinked={() => {
							if (instance === null) return
							const id = onDuplicateLinked(instance.id)
							if (id !== null) selectInstanceAndSource(id)
						}}
						onDuplicateVariation={() => {
							if (instance === null) return
							const id = onDuplicateAsVariation(instance.id)
							if (id !== null) setSelectedInstanceId(id)
						}}
						onEditSource={() => {
							const item = instance === null ? activeLayerItem : instanceLayer
							if (item !== undefined) onOpenSculpt(item)
						}}
						onSplit={splitSelected}
					/>
				) : (
					<IconButton
						className="composition-inspector__reopen"
						data-inspector-reopen
						icon={<PanelRightOpen />}
						label={t('arrangement.showInspector')}
						onClick={() => setInspectorExpanded(true)}
					/>
				)}
			</div>
			<SongDock
				endTick={model.endTick}
				expanded={dockExpanded}
				layers={layers.items}
				modelLayers={model.layers}
				onDeleteInstance={(id) => {
					onDeleteInstance(id)
					if (selectedInstanceId === id) setSelectedInstanceId(null)
				}}
				onPlaceInstance={(layerId, startTick, durationTicks) => {
					const id = onPlaceInstance(layerId, startTick, durationTicks)
					if (id !== null) selectInstanceAndSource(id)
					return id
				}}
				onSelectInstance={selectInstanceAndSource}
				onSplitInstance={(id, offset) => {
					const rightId = onSplitInstance(id, offset)
					if (rightId !== null) selectInstanceAndSource(rightId)
				}}
				onToggleExpanded={() => setDockExpanded((value) => !value)}
				onTogglePlayback={controller.togglePlayback}
				onUpdateInstance={onUpdateInstance}
				playing={engine.playing}
				selectedInstanceId={instance === null ? null : selectedInstanceId}
				ticksPerQuarter={model.ticksPerQuarter}
			/>
		</section>
	)
}
