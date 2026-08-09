import { AudioLines, CircleDot, Drum, Music2 } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import {
	firstLayerViewModel,
	type FirstLayerViewModel,
	type LayerRoleViewModel
} from './view-model.js'

const roleIcons: Readonly<Record<LayerRoleViewModel['id'], ReactNode>> = Object.freeze({
	melody: <Music2 />,
	chords: <AudioLines />,
	bass: <CircleDot />,
	drums: <Drum />
})

export interface FirstLayerViewProperties {
	readonly model?: FirstLayerViewModel
	readonly onChoose: (role: LayerRoleViewModel['id']) => void
}

export function FirstLayerView({
	model = firstLayerViewModel,
	onChoose
}: FirstLayerViewProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section className="studio-view first-layer-view" data-testid="view-first-layer">
			<div className="studio-view__intro">
				<p className="studio-eyebrow">{t('firstLayer.eyebrow')}</p>
				<h1>{t('firstLayer.title')}</h1>
				<p className="studio-lede">{t('firstLayer.description')}</p>
			</div>
			<div className="first-layer-view__roles">
				{model.roles.map((role, index) => (
					<button
						className="first-layer-view__role"
						key={role.id}
						onClick={() => onChoose(role.id)}
						type="button"
					>
						<span className="first-layer-view__index">0{index + 1}</span>
						<span aria-hidden="true" className="first-layer-view__icon">
							{roleIcons[role.id]}
						</span>
						<strong>{t(role.labelKey)}</strong>
						<small>{role.description}</small>
					</button>
				))}
			</div>
		</section>
	)
}
