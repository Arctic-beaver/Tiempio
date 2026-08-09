import { AudioWaveform, Drum, Music2, Plus } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { IconButton, ScrollSurface, Tooltip } from '../../../design-system/src/index.js'
import { useLocalization, type LocalizationKey } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'

interface LayerItem {
	readonly color: 'coral' | 'gold' | 'blue' | 'violet'
	readonly icon: ReactNode
	readonly id: string
	readonly labelKey: LocalizationKey
	readonly view: StudioViewId
}

const layers: readonly LayerItem[] = Object.freeze([
	Object.freeze({
		id: 'melody',
		labelKey: 'layers.melody',
		view: 'piano-roll',
		color: 'coral',
		icon: <Music2 />
	}),
	Object.freeze({
		id: 'chords',
		labelKey: 'layers.chords',
		view: 'piano-roll',
		color: 'gold',
		icon: <AudioWaveform />
	}),
	Object.freeze({
		id: 'bass',
		labelKey: 'layers.bass',
		view: 'piano-roll',
		color: 'blue',
		icon: <AudioWaveform />
	}),
	Object.freeze({
		id: 'drums',
		labelKey: 'layers.drums',
		view: 'drums',
		color: 'violet',
		icon: <Drum />
	})
])

export interface LayersPanelProperties {
	readonly activeView: StudioViewId
	readonly onAdd: () => void
	readonly onNavigate: (view: StudioViewId) => void
}

export function LayersPanel({ activeView, onAdd, onNavigate }: LayersPanelProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section aria-label={t('layers.title')} className="layers-panel">
			<header>
				<div>
					<span>04</span>
					<h2>{t('layers.title')}</h2>
				</div>
				<Tooltip content={t('layers.add')} placement="right">
					<IconButton
						icon={<Plus />}
						label={t('layers.add')}
						onClick={onAdd}
						size="small"
					/>
				</Tooltip>
			</header>
			<ScrollSurface className="layers-panel__list">
				{layers.map((layer) => (
					<button
						aria-current={activeView === layer.view ? 'page' : undefined}
						className="layer-item"
						data-color={layer.color}
						key={layer.id}
						onClick={() => onNavigate(layer.view)}
						type="button"
					>
						<span aria-hidden="true" className="layer-item__icon">
							{layer.icon}
						</span>
						<span>
							<strong>{t(layer.labelKey)}</strong>
							<small>Felt Signal</small>
						</span>
						<i aria-hidden="true" />
					</button>
				))}
			</ScrollSurface>
			<footer>
				<span>Velvet Morning</span>
				<small>108 BPM · 4/4</small>
			</footer>
		</section>
	)
}
