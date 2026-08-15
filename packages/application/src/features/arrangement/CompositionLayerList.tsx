import { AudioLines, CircleDot, Drum, Pencil, Plus, Volume2, VolumeX, Waves } from 'lucide-react'
import type { DragEvent, JSX, ReactNode } from 'react'
import { IconButton, ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { LayerCreationCard } from '../first-layer/LayerCreationCard.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { ArrangementLayerViewModel } from './view-model.js'

function layerIcon(item: ProjectedLayerItem): ReactNode {
	if (item.labelKey === 'layers.drums') return <Drum />
	if (item.labelKey === 'layers.chords') return <AudioLines />
	if (item.labelKey === 'layers.melody') return <Waves />
	return <CircleDot />
}

function beginLayerDrag(event: DragEvent<HTMLDivElement>, layerId: string): void {
	event.dataTransfer.effectAllowed = 'copy'
	event.dataTransfer.setData('application/x-tiempio-source-layer', layerId)
}

export interface CompositionLayerListProperties {
	readonly enabledSourceLayerIds: readonly string[]
	readonly layers: LayersProjection
	readonly modelLayers: readonly ArrangementLayerViewModel[]
	readonly onAddLayer: () => void
	readonly onEditLayer: (item: ProjectedLayerItem) => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onToggleSpeaker: (layerId: string) => void
	readonly ticksPerQuarter: number
}

export function CompositionLayerList({
	enabledSourceLayerIds,
	layers,
	modelLayers,
	onAddLayer,
	onEditLayer,
	onSelectLayer,
	onToggleSpeaker,
	ticksPerQuarter
}: CompositionLayerListProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<aside className="composition-layers">
			<header>
				<span>{t('arrangement.bricks')}</span>
				<small>{t('arrangement.dragToSong')}</small>
			</header>
			<ScrollSurface className="composition-layers__scroll">
				{layers.items.map((item) => {
					const selected = item.id === layers.activeLayerId
					const source = modelLayers.find((candidate) => candidate.id === item.id)
					const enabled = enabledSourceLayerIds.includes(item.id)
					const bars = Math.max(1, (source?.cycleTicks ?? 0) / (ticksPerQuarter * 4))
					return (
						<div
							className={`composition-layer${selected ? ' selected' : ''}`}
							draggable
							key={item.id}
							onDragStart={(event) => beginLayerDrag(event, item.id)}
						>
							<button
								aria-current={selected ? 'true' : undefined}
								className="composition-layer__select"
								data-layer-id={item.id}
								onClick={() => onSelectLayer(item)}
								type="button"
							>
								<span aria-hidden="true" className="composition-layer__icon">
									{layerIcon(item)}
								</span>
								<span>
									<strong>{editorLayerName(item)}</strong>
									<small>
										{editorLayerSound(item)} ·{' '}
										{t('arrangement.cycleBars', { count: bars })}
									</small>
								</span>
							</button>
							<div className="composition-layer__tools">
								<IconButton
									icon={enabled ? <Volume2 /> : <VolumeX />}
									label={t(
										enabled
											? 'arrangement.excludePreview'
											: 'arrangement.includePreview',
										{ layer: editorLayerName(item) }
									)}
									onClick={() => onToggleSpeaker(item.id)}
									selected={enabled}
									size="small"
								/>
								<IconButton
									icon={<Pencil />}
									label={t('arrangement.editBrickSound', {
										layer: editorLayerName(item)
									})}
									onClick={() => onEditLayer(item)}
									size="small"
								/>
							</div>
						</div>
					)
				})}
				<LayerCreationCard instanceId="composition" />
				<button
					className="add-layer composition-add-layer"
					data-layer-add
					onClick={onAddLayer}
					type="button"
				>
					<Plus aria-hidden="true" />
					{t('layers.add')}
				</button>
			</ScrollSurface>
		</aside>
	)
}
