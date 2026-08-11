import type { CSSProperties, JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { TransportPlayhead } from '../../shell/TransportPlayhead.js'
import { TransportRuler } from '../../shell/TransportRuler.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { EditorLayerList } from '../shared/EditorLayerList.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { DrumsViewModel } from './view-model.js'

interface VisualDrumRow {
	readonly ghostSteps: readonly number[]
	readonly instrument: DrumInstrument | null
	readonly name: string
	readonly previewSteps: readonly number[]
	readonly type: string
}

const visualRows: readonly VisualDrumRow[] = Object.freeze([
	Object.freeze({
		instrument: 'kick',
		name: 'Kick',
		type: 'Deep',
		previewSteps: [0, 4, 8, 12],
		ghostSteps: [6, 14]
	}),
	Object.freeze({
		instrument: 'clap',
		name: 'Clap',
		type: 'Clean',
		previewSteps: [4, 12],
		ghostSteps: []
	}),
	Object.freeze({
		instrument: 'closedHat',
		name: 'Closed hat',
		type: 'Fine',
		previewSteps: [0, 2, 4, 6, 8, 10, 12, 14],
		ghostSteps: []
	}),
	Object.freeze({
		instrument: 'openHat',
		name: 'Open hat',
		type: 'Air',
		previewSteps: [7, 14],
		ghostSteps: []
	}),
	Object.freeze({
		instrument: 'perc',
		name: 'Perc',
		type: 'Glass',
		previewSteps: [],
		ghostSteps: [1, 6, 9, 14]
	})
])

const patterns = Object.freeze([
	{ name: 'Straight', descriptionKey: 'drums.patternStraight' },
	{ name: 'Sparse', descriptionKey: 'drums.patternSparse' },
	{ name: 'Driving', descriptionKey: 'drums.patternDriving' },
	{ name: 'Broken', descriptionKey: 'drums.patternBroken' }
] as const)

export interface DrumsViewProperties {
	readonly layers: LayersProjection
	readonly model: DrumsViewModel
	readonly onAddLayer: () => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onToggleStep: (instrument: DrumInstrument, step: number) => void
}

export function DrumsView({
	layers,
	model,
	onAddLayer,
	onSelectLayer,
	onToggleStep
}: DrumsViewProperties): JSX.Element {
	const { t } = useLocalization()
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const hasRecordedSteps = model.rows.some((row) => row.activeSteps.length > 0)

	return (
		<section className="studio-view drums-editor" data-testid="view-drums">
			<StudioTopBar
				center={<TransportBar detailLabel="Swing" detailValue="8%" />}
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
						{visualRows.map((row) => (
							<div className="voice" key={row.name}>
								<span aria-hidden="true" className="voice-dot" />
								<span>
									<span className="voice-name">{row.name}</span>
									<span className="voice-type">{row.type}</span>
								</span>
								<span aria-hidden="true">›</span>
							</div>
						))}
					</div>
					<div aria-label={t('drums.title')} className="drum-grid" role="group">
						<TransportRuler
							className="drum-ruler"
							endTick={model.startTick + model.totalTicks}
							granularity="beat"
							startTick={model.startTick}
						/>
						{visualRows.map((visualRow) => {
							const sourceRow = model.rows.find(
								(row) => row.id === visualRow.instrument
							)
							const steps =
								hasRecordedSteps && sourceRow !== undefined
									? sourceRow.activeSteps
									: visualRow.previewSteps
							return (
								<div className="step-row" key={visualRow.name}>
									{Array.from({ length: model.stepCount }, (_, step) => {
										const selected = steps.includes(step)
										const ghost =
											!selected && visualRow.ghostSteps.includes(step)
										const unavailable = visualRow.instrument === null
										return (
											<button
												aria-label={t('drums.stepLabel', {
													instrument: visualRow.name,
													step: step + 1
												})}
												aria-pressed={selected}
												className={`step${selected ? ' on' : ''}${ghost ? ' ghost' : ''}`}
												disabled={unavailable}
												key={step}
												onClick={() => {
													if (visualRow.instrument !== null) {
														onToggleStep(visualRow.instrument, step)
													}
												}}
												type="button"
											/>
										)
									})}
								</div>
							)
						})}
						<TransportPlayhead
							endTick={model.startTick + model.totalTicks}
							startTick={model.startTick}
						/>
					</div>
					<aside className="pattern-panel">
						<h2>Straight</h2>
						<p>{t('drums.patternDescription')}</p>
						<div className="pattern-list">
							{patterns.map((pattern, index) => (
								<button
									className={`pattern-row${index === 0 ? ' active' : ''}`}
									disabled
									key={pattern.name}
									type="button"
								>
									<strong>{pattern.name}</strong>
									<small>{t(pattern.descriptionKey)}</small>
								</button>
							))}
						</div>
						<div className="density">
							<div className="semantic-labels">
								<span>Simple</span>
								<span>Busy</span>
							</div>
							<div
								aria-hidden="true"
								className="semantic-line"
								style={{ '--v': '38%' } as CSSProperties}
							/>
						</div>
					</aside>
				</div>
			</div>
		</section>
	)
}
