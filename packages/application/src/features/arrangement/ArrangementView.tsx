import type { JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import type { ArrangementViewModel } from './view-model.js'

export interface ArrangementViewProperties {
	readonly model: ArrangementViewModel
	readonly onToggleCell: (layerId: string, sectionId: string, active: boolean) => void
	readonly totalBars: number
}

export function ArrangementView({
	model,
	onToggleCell,
	totalBars
}: ArrangementViewProperties): JSX.Element {
	const { t } = useLocalization()
	const activeCells = new Set(
		model.layers.flatMap((layer) =>
			layer.sections.map((sectionId) => `${layer.id}:${sectionId}`)
		)
	)
	return (
		<section className="studio-view editor-view" data-testid="view-arrangement">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('arrangement.subtitle')}</p>
					<h1>{t('arrangement.title')}</h1>
				</div>
				<span className="editor-view__meter">
					{t('arrangement.bars', { count: totalBars })}
				</span>
			</header>
			<div className="arrangement" role="group" aria-label={t('arrangement.title')}>
				<div className="arrangement__sections" aria-hidden="true">
					<span />
					{model.sections.map((section) => (
						<div data-tone={section.tone} key={section.id}>
							<strong>{t(section.labelKey)}</strong>
							<small>{t('arrangement.bars', { count: section.bars })}</small>
						</div>
					))}
				</div>
				{model.layers.map((layer) => (
					<div className="arrangement__layer" data-color={layer.color} key={layer.id}>
						<strong>{t(layer.labelKey)}</strong>
						{model.sections.map((section) => {
							const active = activeCells.has(`${layer.id}:${section.id}`)
							return (
								<button
									aria-label={`${t(layer.labelKey)}, ${t(section.labelKey)}`}
									aria-pressed={active}
									key={section.id}
									onClick={() => onToggleCell(layer.id, section.id, active)}
									type="button"
								/>
							)
						})}
					</div>
				))}
			</div>
		</section>
	)
}
