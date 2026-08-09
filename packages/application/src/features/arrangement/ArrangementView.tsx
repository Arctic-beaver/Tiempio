import { useState, type JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { arrangementViewModel, type ArrangementViewModel } from './view-model.js'

export interface ArrangementViewProperties {
	readonly model?: ArrangementViewModel
}

export function ArrangementView({
	model = arrangementViewModel
}: ArrangementViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [activeCells, setActiveCells] = useState(
		new Set(
			model.layers.flatMap((layer) =>
				layer.sections.map((sectionId) => `${layer.id}:${sectionId}`)
			)
		)
	)
	const toggleCell = (cell: string): void => {
		setActiveCells((current) => {
			const next = new Set(current)
			if (next.has(cell)) next.delete(cell)
			else next.add(cell)
			return next
		})
	}
	return (
		<section className="studio-view editor-view" data-testid="view-arrangement">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('arrangement.subtitle')}</p>
					<h1>{t('arrangement.title')}</h1>
				</div>
				<span className="editor-view__meter">{t('arrangement.bars', { count: 40 })}</span>
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
						{model.sections.map((section) => (
							<button
								aria-label={`${t(layer.labelKey)}, ${t(section.labelKey)}`}
								aria-pressed={activeCells.has(`${layer.id}:${section.id}`)}
								key={section.id}
								onClick={() => toggleCell(`${layer.id}:${section.id}`)}
								type="button"
							/>
						))}
					</div>
				))}
			</div>
		</section>
	)
}
