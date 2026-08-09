import { useState, type JSX } from 'react'
import { SemanticSlider } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import {
	soundSculptViewModel,
	type SculptDimensionViewModel,
	type SoundSculptViewModel
} from './view-model.js'

export interface SoundSculptViewProperties {
	readonly model?: SoundSculptViewModel
}

export function SoundSculptView({
	model = soundSculptViewModel
}: SoundSculptViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [values, setValues] = useState(
		Object.fromEntries(model.dimensions.map(({ id, value }) => [id, value])) as Record<
			SculptDimensionViewModel['id'],
			number
		>
	)

	return (
		<section className="studio-view sculpt-view" data-testid="view-sound-sculpt">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('sculpt.subtitle')}</p>
					<h1>{t('sculpt.title')}</h1>
				</div>
				<strong className="sculpt-view__sound-name">{model.soundName}</strong>
			</header>
			<div className="sculpt-view__body">
				<div aria-hidden="true" className="sculpt-orbit">
					<span />
					<span />
					<span />
					<strong>FS</strong>
				</div>
				<div className="sculpt-view__controls">
					{model.dimensions.map((dimension) => (
						<SemanticSlider
							formatValue={(value) => `${String(value)}%`}
							key={dimension.id}
							label={t(dimension.labelKey)}
							max={100}
							min={0}
							onChange={(value) =>
								setValues((current) => ({ ...current, [dimension.id]: value }))
							}
							value={values[dimension.id]}
						/>
					))}
				</div>
			</div>
		</section>
	)
}
