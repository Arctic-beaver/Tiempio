import {
	ArrowUpRight,
	AudioLines,
	CircleDot,
	Copy,
	Drum,
	Pause,
	Plus,
	Redo2,
	Undo2,
	Waves
} from 'lucide-react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { ArrangementLayerViewModel, ArrangementViewModel } from './view-model.js'

interface ClipSpec {
	readonly label: string
	readonly left: string
	readonly rest?: boolean
	readonly sectionIndex: number
	readonly width: string
}

const clipSpecs: Readonly<Record<string, readonly ClipSpec[]>> = Object.freeze({
	'layers.drums': Object.freeze([
		{ label: 'Sparse', left: '1.5%', width: '24%', sectionIndex: 0 },
		{ label: 'Driving', left: '27%', width: '48%', sectionIndex: 1 },
		{ label: 'Pause', left: '76.5%', width: '11%', sectionIndex: 2, rest: true },
		{ label: 'Fill', left: '89%', width: '10%', sectionIndex: 3 }
	]),
	'layers.bass': Object.freeze([
		{ label: 'Deep A', left: '14%', width: '11%', sectionIndex: 0 },
		{ label: 'Main bass', left: '27%', width: '48%', sectionIndex: 1 },
		{ label: '1 bar rest', left: '76.5%', width: '11%', sectionIndex: 2, rest: true },
		{ label: 'Return', left: '89%', width: '10%', sectionIndex: 3 }
	]),
	'layers.chords': Object.freeze([
		{ label: 'Am · F', left: '1.5%', width: '36%', sectionIndex: 0 },
		{ label: 'C · G', left: '39%', width: '36%', sectionIndex: 1 },
		{ label: 'Am · G', left: '76.5%', width: '22.5%', sectionIndex: 3 }
	]),
	'layers.melody': Object.freeze([
		{ label: 'Motif', left: '27%', width: '23%', sectionIndex: 1 },
		{ label: 'Variation', left: '52%', width: '23%', sectionIndex: 1 },
		{ label: 'Mute', left: '76.5%', width: '11%', sectionIndex: 2, rest: true }
	])
})

const layerOrder = Object.freeze({
	'layers.drums': 0,
	'layers.bass': 1,
	'layers.chords': 2,
	'layers.melody': 3
} as const)

function trackIcon(item: ProjectedLayerItem): ReactNode {
	if (item.labelKey === 'layers.drums') return <Drum />
	if (item.labelKey === 'layers.chords') return <AudioLines />
	if (item.labelKey === 'layers.melody') return <Waves />
	return <CircleDot />
}

function orderOf(item: ProjectedLayerItem): number {
	if (item.labelKey in layerOrder) {
		return layerOrder[item.labelKey as keyof typeof layerOrder]
	}
	return 4
}

function trackColor(item: ProjectedLayerItem): string {
	if (item.labelKey === 'layers.drums') return 'var(--ti-track-drum)'
	if (item.labelKey === 'layers.chords') return 'var(--ti-track-harmony)'
	if (item.labelKey === 'layers.melody') return 'var(--ti-track-lead)'
	return 'var(--ti-track-bass)'
}

function modelLayer(
	model: ArrangementViewModel,
	item: ProjectedLayerItem
): ArrangementLayerViewModel | undefined {
	return model.layers.find((layer) => layer.id === item.id)
}

export interface ArrangementViewProperties {
	readonly layers: LayersProjection
	readonly model: ArrangementViewModel
	readonly onAddLayer: () => void
	readonly onOpenSculpt: () => void
	readonly onToggleCell: (layerId: string, sectionId: string, active: boolean) => void
	readonly totalBars: number
}

export function ArrangementView({
	layers,
	model,
	onAddLayer,
	onOpenSculpt,
	onToggleCell,
	totalBars
}: ArrangementViewProperties): JSX.Element {
	const { t } = useLocalization()
	const tracks = [...layers.items].sort((left, right) => orderOf(left) - orderOf(right))
	const projectTitle = tracks.length >= 4 ? 'Night Drive' : layers.projectTitle

	return (
		<section
			className="studio-view arrangement-editor"
			data-total-bars={totalBars}
			data-testid="view-arrangement"
		>
			<StudioTopBar
				actions={
					<>
						<button
							aria-label={t('arrangement.undo')}
							className="icon-button"
							disabled
							type="button"
						>
							<Undo2 aria-hidden="true" />
						</button>
						<button
							aria-label={t('arrangement.redo')}
							className="icon-button"
							disabled
							type="button"
						>
							<Redo2 aria-hidden="true" />
						</button>
					</>
				}
				center={<TransportBar />}
				subtitle={t('arrangement.changedNow')}
				title={projectTitle}
			/>
			<div className="arrange-body">
				<aside className="arrange-tracks">
					{tracks.map((track) => {
						const selected = track.labelKey === 'layers.bass'
						return (
							<div
								aria-current={selected ? 'true' : undefined}
								className={`track-head${selected ? ' selected' : ''}`}
								key={track.id}
							>
								<span aria-hidden="true" className="track-glyph">
									{trackIcon(track)}
								</span>
								<span>
									<span className="track-role">{editorLayerName(track)}</span>
									<span className="track-sound">{editorLayerSound(track)}</span>
								</span>
								<span aria-hidden="true" className="track-tools">
									<span className="track-control">S</span>
									<span
										className={`track-control${track.labelKey === 'layers.melody' ? ' active' : ''}`}
									>
										M
									</span>
								</span>
							</div>
						)
					})}
					<button
						className="add-layer arrange-add-layer"
						onClick={onAddLayer}
						type="button"
					>
						<Plus aria-hidden="true" />
						{t('layers.add')}
					</button>
				</aside>
				<div aria-label={t('arrangement.title')} className="arrange-canvas" role="group">
					<div aria-hidden="true" className="arrange-ruler">
						{Array.from({ length: 16 }, (_, index) => (
							<span key={index}>{index + 1}</span>
						))}
					</div>
					<span className="section-label" style={{ left: '2%' }}>
						Intro
					</span>
					<span className="section-label" style={{ left: '27%' }}>
						Main
					</span>
					<span className="section-label" style={{ left: '76%' }}>
						Break
					</span>
					{tracks.map((track) => {
						const projection = modelLayer(model, track)
						const specs = clipSpecs[track.labelKey] ?? []
						return (
							<div className="arrange-row" data-track={track.labelKey} key={track.id}>
								{specs.map((clip, index) => {
									const section = model.sections[clip.sectionIndex]
									const active =
										section !== undefined &&
										projection?.sections.includes(section.id) === true
									return (
										<button
											aria-label={`${editorLayerName(track)} · ${clip.label}`}
											aria-pressed={active}
											className={`clip${clip.rest === true ? ' rest' : ''}`}
											disabled={section === undefined}
											key={`${clip.label}:${String(index)}`}
											onClick={() => {
												if (section !== undefined) {
													onToggleCell(track.id, section.id, active)
												}
											}}
											style={
												{
													left: clip.left,
													width: clip.width,
													'--clip': trackColor(track)
												} as CSSProperties
											}
											type="button"
										>
											<span>{clip.label}</span>
										</button>
									)
								})}
							</div>
						)
					})}
					<div aria-hidden="true" className="playhead arrange-playhead" />
				</div>
				<aside className="arrange-inspector">
					<h2>Main bass</h2>
					<p>{t('arrangement.inspectorDescription')}</p>
					<button className="inspector-action" disabled type="button">
						<Copy aria-hidden="true" />
						<span>
							<strong>{t('arrangement.repeatAfter')}</strong>
							<small>{t('arrangement.createContinuation')}</small>
						</span>
						<ArrowUpRight aria-hidden="true" />
					</button>
					<button className="inspector-action" disabled type="button">
						<Pause aria-hidden="true" />
						<span>
							<strong>{t('arrangement.addPause')}</strong>
							<small>{t('arrangement.oneBarAfter')}</small>
						</span>
						<ArrowUpRight aria-hidden="true" />
					</button>
					<button className="inspector-action" disabled type="button">
						<span className="octave-glyph">−8va</span>
						<span>
							<strong>{t('arrangement.octaveDown')}</strong>
							<small>{t('arrangement.keepPattern')}</small>
						</span>
						<ArrowUpRight aria-hidden="true" />
					</button>
					<button className="inspector-action" onClick={onOpenSculpt} type="button">
						<Waves aria-hidden="true" />
						<span>
							<strong>{t('arrangement.changeCharacter')}</strong>
							<small>Deep → Warm → Dirty</small>
						</span>
						<ArrowUpRight aria-hidden="true" />
					</button>
				</aside>
			</div>
		</section>
	)
}
