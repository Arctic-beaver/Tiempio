import { useState, type JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { drumsViewModel, type DrumsViewModel } from './view-model.js'

export interface DrumsViewProperties {
	readonly model?: DrumsViewModel
}

function stepKey(rowId: string, step: number): string {
	return `${rowId}:${String(step)}`
}

export function DrumsView({ model = drumsViewModel }: DrumsViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [activeSteps, setActiveSteps] = useState(
		new Set(model.rows.flatMap((row) => row.activeSteps.map((step) => stepKey(row.id, step))))
	)
	const toggleStep = (key: string): void => {
		setActiveSteps((current) => {
			const next = new Set(current)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	return (
		<section className="studio-view editor-view" data-testid="view-drums">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('drums.subtitle')}</p>
					<h1>{t('drums.title')}</h1>
				</div>
				<span className="editor-view__meter">16 steps</span>
			</header>
			<div className="drum-grid" role="group" aria-label={t('drums.title')}>
				{model.rows.map((row) => (
					<div className="drum-grid__row" key={row.id}>
						<strong>{t(row.labelKey)}</strong>
						<div>
							{Array.from({ length: model.stepCount }, (_, step) => {
								const key = stepKey(row.id, step)
								const selected = activeSteps.has(key)
								return (
									<button
										aria-label={`${t(row.labelKey)}, step ${String(step + 1)}`}
										aria-pressed={selected}
										data-beat={step % 4 === 0 || undefined}
										key={key}
										onClick={() => toggleStep(key)}
										type="button"
									/>
								)
							})}
						</div>
					</div>
				))}
			</div>
			<p className="studio-hint">
				Use arrow keys to move through steps · Space toggles a hit
			</p>
		</section>
	)
}
