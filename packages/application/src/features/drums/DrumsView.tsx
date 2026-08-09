import type { JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'
import type { DrumsViewModel } from './view-model.js'

export interface DrumsViewProperties {
	readonly model: DrumsViewModel
	readonly onToggleStep: (instrument: DrumInstrument, step: number) => void
}

function stepKey(rowId: string, step: number): string {
	return `${rowId}:${String(step)}`
}

export function DrumsView({ model, onToggleStep }: DrumsViewProperties): JSX.Element {
	const { t } = useLocalization()
	const activeSteps = new Set(
		model.rows.flatMap((row) => row.activeSteps.map((step) => stepKey(row.id, step)))
	)

	return (
		<section className="studio-view editor-view" data-testid="view-drums">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('drums.subtitle')}</p>
					<h1>{t('drums.title')}</h1>
				</div>
				<span className="editor-view__meter">
					{t('drums.steps', { count: model.stepCount })}
				</span>
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
										aria-label={t('drums.stepLabel', {
											instrument: t(row.labelKey),
											step: step + 1
										})}
										aria-pressed={selected}
										data-beat={step % 4 === 0 || undefined}
										key={key}
										onClick={() => onToggleStep(row.id, step)}
										type="button"
									/>
								)
							})}
						</div>
					</div>
				))}
			</div>
			<p className="studio-hint">{t('drums.hint')}</p>
		</section>
	)
}
