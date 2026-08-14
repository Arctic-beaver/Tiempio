import { ArrowLeft } from 'lucide-react'
import { useState, type CSSProperties, type JSX } from 'react'
import { Popover, SemanticSlider } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type {
	DrumInstrument,
	DrumPatternCharacter,
	DrumVoiceVariantId
} from '../../../../project-core/src/index.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { TransportPlayhead } from '../../shell/TransportPlayhead.js'
import { TransportRuler } from '../../shell/TransportRuler.js'
import { EditorLayerList } from '../shared/EditorLayerList.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { DrumsViewModel } from './view-model.js'

const patterns = Object.freeze([
	{ id: 'straight', name: 'Straight', descriptionKey: 'drums.patternStraight' },
	{ id: 'sparse', name: 'Sparse', descriptionKey: 'drums.patternSparse' },
	{ id: 'driving', name: 'Driving', descriptionKey: 'drums.patternDriving' },
	{ id: 'broken', name: 'Broken', descriptionKey: 'drums.patternBroken' }
] as const satisfies readonly {
	readonly id: Exclude<DrumPatternCharacter, 'custom'>
	readonly name: string
	readonly descriptionKey:
		| 'drums.patternStraight'
		| 'drums.patternSparse'
		| 'drums.patternDriving'
		| 'drums.patternBroken'
}[])

function DrumSwingControl({
	onCommit,
	swing
}: {
	readonly onCommit: (swing: number) => void
	readonly swing: number
}): JSX.Element {
	const { t } = useLocalization()
	const [preview, setPreview] = useState<number | null>(null)
	const value = preview ?? Math.round(swing * 100)
	return (
		<div className="transport__drum-swing">
			<Popover
				label={t('drums.swingControl', { value: Math.round(value) })}
				placement="start"
				triggerContent={
					<>
						<span>{t('drums.swing')}</span>
						<b>{String(Math.round(value))}%</b>
					</>
				}
			>
				<div className="drum-swing-popover">
					<SemanticSlider
						formatValue={(next) => `${String(Math.round(next))}%`}
						label={t('drums.swing')}
						max={35}
						min={0}
						onChange={setPreview}
						onCancel={() => setPreview(null)}
						onCommit={(next) => {
							onCommit(next / 100)
							setPreview(null)
						}}
						value={value}
					/>
					<p>{t('drums.swingHelp')}</p>
				</div>
			</Popover>
		</div>
	)
}

export interface DrumsViewProperties {
	readonly layers: LayersProjection
	readonly model: DrumsViewModel
	readonly onAddLayer: () => void
	readonly onAuditionVoice: (instrument: DrumInstrument) => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onSelectPattern: (character: Exclude<DrumPatternCharacter, 'custom'>) => void
	readonly onSelectVoiceVariant: (
		instrument: DrumInstrument,
		variantId: DrumVoiceVariantId
	) => void
	readonly onSetDensity: (density: number) => void
	readonly onSetSwing: (swing: number) => void
	readonly onToggleStep: (instrument: DrumInstrument, step: number) => void
}

export function DrumsView({
	layers,
	model,
	onAddLayer,
	onAuditionVoice,
	onSelectLayer,
	onSelectPattern,
	onSelectVoiceVariant,
	onSetDensity,
	onSetSwing,
	onToggleStep
}: DrumsViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [selectedVoice, setSelectedVoice] = useState<DrumInstrument | null>(null)
	const [densityPreview, setDensityPreview] = useState<number | null>(null)
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const selectedVoiceRow = model.rows.find((row) => row.id === selectedVoice)
	const selectedPattern = patterns.find((pattern) => pattern.id === model.character)
	const densityValue = densityPreview ?? Math.round(model.density * 100)

	return (
		<section className="studio-view drums-editor" data-testid="view-drums">
			<StudioTopBar
				center={
					<TransportBar
						detailControl={
							<DrumSwingControl onCommit={onSetSwing} swing={model.swing} />
						}
					/>
				}
				subtitle={subtitle}
				title={layers.projectTitle}
			/>
			<div className="project-space">
				<EditorLayerList
					layers={layers}
					onAddLayer={onAddLayer}
					onSelectLayer={onSelectLayer}
				/>
				<div className="canvas drum-layout">
					<div className="drum-voices">
						{model.rows.map((row) => (
							<button
								aria-current={selectedVoice === row.id ? 'true' : undefined}
								aria-label={t('drums.openVoice', {
									instrument: t(row.labelKey),
									variant: row.selectedVariantName
								})}
								className={`voice${selectedVoice === row.id ? ' active' : ''}`}
								key={row.id}
								onClick={() => setSelectedVoice(row.id)}
								type="button"
							>
								<span aria-hidden="true" className="voice-dot" />
								<span>
									<span className="voice-name">{t(row.labelKey)}</span>
									<span className="voice-type">{row.selectedVariantName}</span>
								</span>
								<span aria-hidden="true">›</span>
							</button>
						))}
					</div>
					<div aria-label={t('drums.title')} className="drum-grid" role="group">
						<TransportRuler
							className="drum-ruler"
							endTick={model.startTick + model.totalTicks}
							granularity="beat"
							startTick={model.startTick}
						/>
						{model.rows.map((row) => (
							<div
								className="step-row"
								key={row.id}
								style={{ '--drum-step-count': model.stepCount } as CSSProperties}
							>
								{Array.from({ length: model.stepCount }, (_, step) => {
									const active = row.activeSteps.includes(step)
									return (
										<button
											aria-label={t('drums.stepLabel', {
												instrument: t(row.labelKey),
												step: step + 1
											})}
											aria-pressed={active}
											className={`step${active ? ' on' : ''}`}
											key={step}
											onClick={() => onToggleStep(row.id, step)}
											type="button"
										/>
									)
								})}
							</div>
						))}
						<TransportPlayhead
							endTick={model.startTick + model.totalTicks}
							startTick={model.startTick}
						/>
					</div>
					<aside
						className="pattern-panel"
						data-mode={selectedVoiceRow ? 'voice' : 'patterns'}
					>
						{selectedVoiceRow === undefined ? (
							<>
								<h2>{selectedPattern?.name ?? t('drums.customPattern')}</h2>
								<p>{t('drums.patternDescription')}</p>
								<div className="pattern-list">
									{patterns.map((pattern) => {
										const active = pattern.id === model.character
										return (
											<button
												aria-current={active ? 'true' : undefined}
												className={`pattern-row${active ? ' active' : ''}`}
												key={pattern.id}
												onClick={() => onSelectPattern(pattern.id)}
												type="button"
											>
												<strong>{pattern.name}</strong>
												<small>{t(pattern.descriptionKey)}</small>
											</button>
										)
									})}
								</div>
								<div
									className="density"
									style={{ '--v': `${String(densityValue)}%` } as CSSProperties}
								>
									<SemanticSlider
										formatValue={() => t('drums.busy')}
										label={t('drums.simple')}
										max={100}
										min={0}
										onChange={setDensityPreview}
										onCancel={() => setDensityPreview(null)}
										onCommit={(next) => {
											onSetDensity(next / 100)
											setDensityPreview(null)
										}}
										value={densityValue}
									/>
								</div>
							</>
						) : (
							<>
								<button
									className="pattern-back"
									onClick={() => setSelectedVoice(null)}
									type="button"
								>
									<ArrowLeft aria-hidden="true" />
									{t('drums.backToPatterns')}
								</button>
								<h2>{t(selectedVoiceRow.labelKey)}</h2>
								<p>{t('drums.voiceDescription')}</p>
								<div className="pattern-list voice-variant-list">
									{selectedVoiceRow.variants.map((variant) => {
										const active =
											variant.id === selectedVoiceRow.selectedVariantId
										return (
											<button
												aria-current={active ? 'true' : undefined}
												className={`pattern-row${active ? ' active' : ''}`}
												key={variant.id}
												onClick={() => {
													onSelectVoiceVariant(
														selectedVoiceRow.id,
														variant.id
													)
													onAuditionVoice(selectedVoiceRow.id)
												}}
												type="button"
											>
												<strong>{variant.name}</strong>
												<small>{t('drums.hearVariant')}</small>
											</button>
										)
									})}
								</div>
							</>
						)}
					</aside>
				</div>
			</div>
		</section>
	)
}
