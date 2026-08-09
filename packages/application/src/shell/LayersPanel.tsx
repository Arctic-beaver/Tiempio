import { AudioWaveform, Drum, Music2, Plus } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { IconButton, ScrollSurface, Tooltip } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { useCommands } from '../commands/CommandContext.js'
import { commandForView } from '../commands/command-registry.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import type { ProjectedLayerItem } from '../project/projectors.js'

function layerIcon(layer: ProjectedLayerItem): ReactNode {
	if (layer.view === 'drums') return <Drum />
	if (layer.color === 'coral') return <Music2 />
	return <AudioWaveform />
}

export function LayersPanel(): JSX.Element {
	const { t } = useLocalization()
	const { execute } = useCommands()
	const { projections, selectLayer } = useProjectSession()
	const model = projections.layers
	return (
		<section aria-label={t('layers.title')} className="layers-panel">
			<header>
				<div>
					<span>{String(model.items.length).padStart(2, '0')}</span>
					<h2>{t('layers.title')}</h2>
				</div>
				<Tooltip content={t('layers.add')} placement="right">
					<IconButton
						icon={<Plus />}
						label={t('layers.add')}
						onClick={() => execute('studio.first-layer')}
						size="small"
					/>
				</Tooltip>
			</header>
			<ScrollSurface className="layers-panel__list">
				{model.items.map((layer) => (
					<button
						aria-current={model.activeLayerId === layer.id ? 'page' : undefined}
						className="layer-item"
						data-color={layer.color}
						key={layer.id}
						onClick={() => {
							selectLayer(layer.id)
							execute(commandForView(layer.view))
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
				))}
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
