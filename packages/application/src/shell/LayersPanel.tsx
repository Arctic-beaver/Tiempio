import { AudioWaveform, Drum, Music2, Plus } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { IconButton, ScrollSurface } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { useCommands } from '../commands/CommandContext.js'
import { commandForView } from '../commands/command-registry.js'
import { LayerCreationCard } from '../features/first-layer/LayerCreationCard.js'
import { useLayerCreationActions } from '../features/first-layer/useLayerCreationActions.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import type { ProjectedLayerItem } from '../project/projectors.js'

function layerIcon(layer: ProjectedLayerItem): ReactNode {
	if (layer.view === 'drums') return <Drum />
	if (layer.color === 'coral') return <Music2 />
	return <AudioWaveform />
}

export function LayersPanel(): JSX.Element {
	const { t } = useLocalization()
	const { commands } = useCommands()
	const { projections } = useProjectSession()
	const creation = useLayerCreationActions()
	const model = projections.layers
	return (
		<section aria-label={t('layers.title')} className="layers-panel">
			<header>
				<div>
					<span>{String(model.items.length).padStart(2, '0')}</span>
					<h2>{t('layers.title')}</h2>
				</div>
				<IconButton
					data-layer-add
					icon={<Plus />}
					label={t('layers.add')}
					onClick={creation.openOrFocus}
					size="small"
				/>
			</header>
			<ScrollSurface className="layers-panel__list">
				{model.items.map((layer) => {
					const commandId = commandForView(layer.view)
					const command = commands[commandId]
					return (
						<button
							aria-current={model.activeLayerId === layer.id ? 'page' : undefined}
							className="layer-item"
							data-color={layer.color}
							data-layer-id={layer.id}
							disabled={!command.available}
							key={layer.id}
							onClick={() => {
								creation.selectExistingLayer(layer)
							}}
							type="button"
						>
							<span aria-hidden="true" className="layer-item__icon">
								{layerIcon(layer)}
							</span>
							<span>
								<strong>{t(layer.labelKey)}</strong>
								<small>{layer.soundName}</small>
							</span>
							<i aria-hidden="true" />
						</button>
					)
				})}
				<LayerCreationCard instanceId="drawer" />
			</ScrollSurface>
			<footer>
				<span>{model.projectTitle}</span>
				<small>
					{String(model.bpm)} BPM · {model.meter}
				</small>
			</footer>
		</section>
	)
}
