import { Equal, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState, type JSX } from 'react'
import { Select, SemanticSlider } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'

const soundOptions = Object.freeze([
	Object.freeze({
		value: 'bass.deep',
		label: 'Deep',
		descriptionKey: 'context.lowEmberDescription'
	})
] as const)

export function ContextPanel(): JSX.Element {
	const { t } = useLocalization()
	const { dispatch, getSnapshot, projections } = useProjectSession()
	const model = projections.context
	const [energyPreview, setEnergyPreview] = useState<number | null>(null)
	return (
		<aside aria-label={t('context.title')} className="context-panel">
			<header>
				<span>
					<SlidersHorizontal aria-hidden="true" />
					{t('context.title')}
				</span>
				<small>{t(model.labelKey)}</small>
			</header>
			<div className="context-panel__section">
				<div className="context-panel__section-title">
					<Sparkles aria-hidden="true" />
					<h3>{t('context.sound')}</h3>
				</div>
				<Select
					disabled={!model.soundEditable}
					label={t('context.feel')}
					onChange={() => {
						if (model.layerId === null) return
						const snapshot = getSnapshot()
						dispatch({
							type: 'layer.character.select',
							baseRevision: snapshot.revision,
							layerId: model.layerId,
							presetId: 'bass.deep'
						})
					}}
					options={soundOptions.map((option) => ({
						value: option.value,
						label: option.label,
						description: t(option.descriptionKey)
					}))}
					value="bass.deep"
				/>
			</div>
			<div className="context-panel__section">
				<div className="context-panel__section-title">
					<Equal aria-hidden="true" />
					<h3>{t('context.pattern')}</h3>
				</div>
				<SemanticSlider
					disabled={model.layerId === null}
					formatValue={(value) => `${String(value)}%`}
					label={t('context.velocity')}
					max={100}
					min={0}
					onChange={setEnergyPreview}
					onCancel={() => setEnergyPreview(null)}
					onCommit={(value) => {
						if (model.layerId !== null) {
							const snapshot = getSnapshot()
							dispatch({
								type: 'layer.gain.set',
								baseRevision: snapshot.revision,
								layerId: model.layerId,
								gain: value / 50
							})
						}
						setEnergyPreview(null)
					}}
					value={energyPreview ?? model.energy}
				/>
			</div>
			<div className="context-panel__note">
				<span aria-hidden="true">↗</span>
				<p>{t('context.enginePending')}</p>
			</div>
		</aside>
	)
}
