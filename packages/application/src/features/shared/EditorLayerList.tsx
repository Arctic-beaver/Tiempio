import { AudioLines, CircleDot, Drum, Plus, Waves } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { editorLayerDetail, editorLayerName } from './editor-layer-presentation.js'

function layerIcon(item: ProjectedLayerItem): ReactNode {
	if (item.labelKey === 'layers.drums') return <Drum />
	if (item.labelKey === 'layers.chords') return <AudioLines />
	if (item.labelKey === 'layers.melody') return <Waves />
	return <CircleDot />
}

export interface EditorLayerListProperties {
	readonly includeBassRange?: boolean
	readonly layers: LayersProjection
	readonly onAddLayer: () => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
}

export function EditorLayerList({
	includeBassRange = false,
	layers,
	onAddLayer,
	onSelectLayer
}: EditorLayerListProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<aside className="layer-list">
			<div className="layer-title">
				<span>{t('layers.title')}</span>
				<span>{layers.items.length}</span>
			</div>
			{layers.items.map((item) => {
				const selected = item.id === layers.activeLayerId
				return (
					<button
						aria-current={selected ? 'true' : undefined}
						className={`layer${selected ? ' selected' : ''}`}
						key={item.id}
						onClick={() => onSelectLayer(item)}
						type="button"
					>
						<span
							aria-hidden="true"
							className={`layer-symbol${item.labelKey === 'layers.bass' ? ' bass' : ''}`}
						>
							{layerIcon(item)}
						</span>
						<span>
							<span className="layer-name">{editorLayerName(item)}</span>
							<span className="layer-sub">
								{editorLayerDetail(item, includeBassRange)}
							</span>
						</span>
						<span aria-hidden="true" className="layer-tools">
							<span className="micro">S</span>
							<span className="micro">M</span>
						</span>
					</button>
				)
			})}
			<button className="add-layer" onClick={onAddLayer} type="button">
				<Plus aria-hidden="true" />
				{t('layers.add')}
			</button>
		</aside>
	)
}
