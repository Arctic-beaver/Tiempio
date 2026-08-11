import { useState, type CSSProperties, type JSX } from 'react'
import { SemanticSlider } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type { SynthPresetId } from '../../../../project-core/src/index.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { type SculptDimensionViewModel, type SoundSculptViewModel } from './view-model.js'

const axes = Object.freeze([
	{ id: 'brightness', left: 'Dark', right: 'Bright' },
	{ id: 'movement', left: 'Soft', right: 'Hard' },
	{ id: 'texture', left: 'Clean', right: 'Dirty' }
] as const)

export interface SoundSculptViewProperties {
	readonly model: SoundSculptViewModel
	readonly onCommit: (dimensionId: SculptDimensionViewModel['id'], value: number) => void
	readonly onDone: () => void
	readonly onSelectCharacter: (presetId: SynthPresetId) => void
}

export function SoundSculptView({
	model,
	onCommit,
	onDone,
	onSelectCharacter
}: SoundSculptViewProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const [preview, setPreview] = useState<Partial<Record<SculptDimensionViewModel['id'], number>>>(
		{}
	)

	return (
		<section className="studio-view sound-sculpt" data-testid="view-sound-sculpt">
			<StudioTopBar
				actions={
					<button className="primary-action sculpt-done" onClick={onDone} type="button">
						{t('sculpt.done')}
					</button>
				}
				backLabel={t('common.back')}
				center={<TransportBar mode="preview" />}
				onBack={onDone}
				subtitle={`${model.familyName} · ${model.soundName}`}
				title={t('sculpt.characterTitle')}
			/>
			<div className="sculpt-layout">
				<main className="sculpt-main">
					<div className="sculpt-heading">
						<div>
							<h1>{model.soundName}</h1>
							<p>{t('sculpt.description')}</p>
						</div>
						<button className="advanced-link" disabled type="button">
							Advanced ↗
						</button>
					</div>
					<div aria-hidden="true" className="sculpt-visual">
						<span className="orbit orbit-one" />
						<span className="orbit orbit-two" />
						<span className="orbit orbit-three" />
						<svg
							className="sculpt-wave"
							preserveAspectRatio="none"
							viewBox="0 0 800 190"
						>
							<path d="M0 95 C20 45 38 145 58 95 S96 20 118 95 156 170 178 95 216 20 238 95 276 170 298 95 336 20 358 95 396 170 418 95 456 20 478 95 516 170 538 95 576 20 598 95 636 170 658 95 696 20 718 95 756 170 800 95" />
							<path
								d="M0 95 C30 70 48 120 78 95 S126 70 156 95 204 120 234 95 282 70 312 95 360 120 390 95 438 70 468 95 516 120 546 95 594 70 624 95 672 120 702 95 750 70 800 95"
								opacity=".28"
							/>
						</svg>
					</div>
					<div className="sculpt-controls">
						{axes.map((axis) => {
							const dimension = model.dimensions.find((item) => item.id === axis.id)
							const value = preview[axis.id] ?? dimension?.value ?? 0
							return (
								<div
									className="sculpt-axis"
									key={axis.id}
									style={{ '--v': `${String(value)}%` } as CSSProperties}
								>
									<SemanticSlider
										formatValue={() => axis.right}
										label={axis.left}
										max={100}
										min={0}
										onChange={(nextValue) =>
											setPreview((current) => ({
												...current,
												[axis.id]: nextValue
											}))
										}
										onCommit={(nextValue) => {
											onCommit(axis.id, nextValue)
											setPreview((current) => ({
												...current,
												[axis.id]: undefined
											}))
										}}
										value={value}
									/>
								</div>
							)
						})}
					</div>
				</main>
				<aside className="character-panel">
					<h2>{t('sculpt.nearbyCharacters')}</h2>
					<div className="character-list">
						{model.characters.map((character) => {
							const active = character.id === model.presetId
							return (
								<button
									aria-current={active ? 'true' : undefined}
									className={`character-row${active ? ' active' : ''}`}
									key={character.id}
									onClick={() => {
										controller.previewCoordinator.interrupt()
										controller.performanceInput.releaseAll()
										setPreview({})
										onSelectCharacter(character.id)
									}}
									type="button"
								>
									<span>
										<strong>{character.name}</strong>
										<small>{t(character.descriptionKey)}</small>
									</span>
									<span aria-hidden="true" className="character-radio" />
								</button>
							)
						})}
					</div>
				</aside>
			</div>
		</section>
	)
}
