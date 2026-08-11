import { Copy, Repeat2, Scissors } from 'lucide-react'
import type { CSSProperties, JSX } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { TransportPlayhead } from '../../shell/TransportPlayhead.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { EditorLayerList } from '../shared/EditorLayerList.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import type { PianoNoteViewModel, PianoRollViewModel } from './view-model.js'

const pianoKeys = Object.freeze([
	{ label: 'C3', black: false },
	{ label: '', black: true },
	{ label: 'B2', black: false },
	{ label: '', black: true },
	{ label: 'A2', black: false },
	{ label: '', black: true },
	{ label: 'G2', black: false },
	{ label: '', black: true },
	{ label: 'F2', black: false },
	{ label: 'E2', black: false },
	{ label: '', black: true },
	{ label: 'D2', black: false },
	{ label: '', black: true },
	{ label: 'C2', black: false },
	{ label: 'B1', black: false },
	{ label: '', black: true },
	{ label: 'A1', black: false }
])

const previewNotes = Object.freeze([
	{ left: '4%', top: '16.75rem', width: '9%' },
	{ left: '15%', top: '15.125rem', width: '9%' },
	{ left: '27%', top: '13.5rem', width: '13%', selected: true },
	{ left: '43%', top: '16.75rem', width: '9%' },
	{ left: '55%', top: '15.125rem', width: '9%' },
	{ left: '67%', top: '18.375rem', width: '10%' },
	{ left: '80%', top: '16.75rem', width: '13%' }
])

const pitchRowMap = Object.freeze([0, 2, 4, 6, 8, 9, 11, 13])

function noteStyle(note: PianoNoteViewModel): CSSProperties {
	const pitchRow = pitchRowMap[note.row] ?? 13
	return {
		left: `${String(Math.max(0, note.beat / 16) * 100)}%`,
		top: `${String(35 + pitchRow * 26 + 4)}px`,
		width: `${String(Math.max(2.5, (note.duration / 16) * 100))}%`
	}
}

export interface PianoRollViewProperties {
	readonly layers: LayersProjection
	readonly model: PianoRollViewModel
	readonly onAddLayer: () => void
	readonly onAddNote: () => void
	readonly onDeleteNote: (noteId: string) => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
}

export function PianoRollView({
	layers,
	model,
	onAddLayer,
	onAddNote,
	onDeleteNote,
	onSelectLayer
}: PianoRollViewProperties): JSX.Element {
	const { t } = useLocalization()
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const hasNotes = model.notes.length > 0

	return (
		<section className="studio-view piano-editor" data-testid="view-piano-roll">
			<StudioTopBar
				actions={
					<>
						<button
							aria-label={t('pianoRoll.octaveDown')}
							className="icon-button octave-action"
							disabled
							type="button"
						>
							−8va
						</button>
						<button
							aria-label={t('pianoRoll.octaveUp')}
							className="icon-button octave-action"
							disabled
							type="button"
						>
							+8va
						</button>
					</>
				}
				center={<TransportBar />}
				subtitle={subtitle}
				title={layers.projectTitle}
			/>
			<div className="project-space">
				<EditorLayerList
					includeBassRange
					layers={layers}
					onAddLayer={onAddLayer}
					onSelectLayer={onSelectLayer}
				/>
				<div className="canvas editor-grid">
					<div className="piano-area">
						<div aria-hidden="true" className="piano-keys">
							{pianoKeys.map((key, index) => (
								<div
									className={`pkey${key.black ? ' black' : ''}`}
									key={`${key.label}:${String(index)}`}
								>
									{key.label}
								</div>
							))}
						</div>
						<div aria-label={t('pianoRoll.title')} className="piano-roll" role="group">
							<div aria-hidden="true" className="roll-ruler">
								{Array.from({ length: 8 }, (_, index) => (
									<span key={index}>{index + 1}</span>
								))}
							</div>
							<TransportPlayhead />
							{hasNotes
								? model.notes.map((note, index) => (
										<button
											aria-label={t('pianoRoll.noteAtBeat', {
												pitch: note.pitch,
												beat: note.beat + 1
											})}
											className={`note${index === 2 ? ' selected' : ''}`}
											key={note.id}
											onClick={() => onDeleteNote(note.id)}
											style={noteStyle(note)}
											type="button"
										/>
									))
								: previewNotes.map((note, index) => (
										<span
											aria-hidden="true"
											className={`note${note.selected === true ? ' selected' : ''}`}
											key={index}
											style={note}
										/>
									))}
							<button
								aria-label={t('pianoRoll.addNote')}
								className="note ghost"
								onClick={onAddNote}
								style={{ left: '54%', top: '11.875rem', width: '8%' }}
								type="button"
							/>
						</div>
						<aside className="harmony-panel">
							<div className="harmony-head">
								<h2>A minor</h2>
								<span className="scale-badge">Natural</span>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.scaleNotes')}</div>
								<div className="note-set">
									{['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((note) => (
										<span
											className={`note-pill${note === 'A' ? ' root' : ''}${['C', 'E', 'G'].includes(note) ? ' chord' : ''}`}
											key={note}
										>
											{note}
										</span>
									))}
								</div>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.selectedNote')}</div>
								<div className="theory-copy">
									<strong>{t('pianoRoll.selectedNoteTitle')}</strong>
									<br />
									{t('pianoRoll.selectedNoteDescription')}
								</div>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.nextVariant')}</div>
								<div className="theory-copy">
									{t('pianoRoll.nextVariantDescription')}
								</div>
							</div>
						</aside>
					</div>
					<div className="editor-footer">
						<div className="footer-tools">
							<button className="text-tool" disabled type="button">
								{t('pianoRoll.grid')} 1/16
							</button>
							<button className="text-tool" disabled type="button">
								{t('pianoRoll.length')} 100%
							</button>
							<button className="text-tool" disabled type="button">
								Impact 80
							</button>
						</div>
						<div className="cycle-strip">
							<Repeat2 aria-hidden="true" />
							<div aria-hidden="true" className="cycle">
								<div className="cycle-sound">{t('pianoRoll.fourBars')}</div>
								<div className="cycle-rest">{t('pianoRoll.rest')}</div>
							</div>
						</div>
						<div className="footer-tools right">
							<button className="text-tool" disabled type="button">
								<Copy aria-hidden="true" /> {t('pianoRoll.repeat')}
							</button>
							<button className="text-tool" disabled type="button">
								<Scissors aria-hidden="true" /> {t('pianoRoll.split')}
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
