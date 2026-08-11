import { Copy, Repeat2, Scissors } from 'lucide-react'
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type PointerEvent as ReactPointerEvent
} from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { ProjectHistoryControls } from '../../commands/ProjectHistoryControls.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { TransportPlayhead } from '../../shell/TransportPlayhead.js'
import { EditorLayerList } from '../shared/EditorLayerList.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import {
	editNoteFromPointer,
	geometryForNote,
	noteAtGridPoint,
	pianoRowHeight,
	pitchModelsToValues,
	type EditableNoteValues,
	type NoteEditGesture,
	type NoteEditMode
} from './note-editor-geometry.js'
import type { PianoNoteViewModel, PianoRollViewModel } from './view-model.js'

interface ActiveNoteGesture extends NoteEditGesture {
	readonly noteId: string
	readonly pointerId: number
}

interface NotePreview {
	readonly id: string
	readonly values: EditableNoteValues
}

function editableValues(note: PianoNoteViewModel): EditableNoteValues {
	return {
		startTick: note.startTick,
		durationTicks: note.durationTicks,
		pitch: note.pitchValue,
		velocity: note.velocity
	}
}

function noteWithPreview(
	note: PianoNoteViewModel,
	preview: NotePreview | null,
	model: PianoRollViewModel
): PianoNoteViewModel {
	if (preview?.id !== note.id) return note
	const row = model.pitches.findIndex(({ pitch }) => pitch === preview.values.pitch)
	const pitch = model.pitches[row]
	return {
		...note,
		...preview.values,
		pitch: pitch?.label || note.pitch,
		pitchValue: preview.values.pitch,
		row: row < 0 ? note.row : row
	}
}

function noteStyle(note: PianoNoteViewModel, totalTicks: number): CSSProperties {
	const geometry = geometryForNote(note, totalTicks)
	return {
		left: `${String(geometry.leftPercent)}%`,
		top: `${String(geometry.top)}px`,
		width: `${String(geometry.widthPercent)}%`,
		height: `${String(geometry.height)}px`
	}
}

export interface PianoRollViewProperties {
	readonly layers: LayersProjection
	readonly model: PianoRollViewModel
	readonly onAddLayer: () => void
	readonly onAddNote: (note: EditableNoteValues) => string | null
	readonly onDeleteNote: (noteId: string) => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onUpdateNote: (noteId: string, note: EditableNoteValues) => void
}

export function PianoRollView({
	layers,
	model,
	onAddLayer,
	onAddNote,
	onDeleteNote,
	onSelectLayer,
	onUpdateNote
}: PianoRollViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
	const [preview, setPreview] = useState<NotePreview | null>(null)
	const previewRef = useRef<NotePreview | null>(null)
	const gestureRef = useRef<ActiveNoteGesture | null>(null)
	const gridRef = useRef<HTMLDivElement | null>(null)
	const noteRefs = useRef(new Map<string, HTMLButtonElement>())
	const pendingFocusId = useRef<string | null>(null)
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const selectedNote = model.notes.find((note) => note.id === selectedNoteId) ?? null
	const pitchValues = pitchModelsToValues(model.pitches)
	const gridHeight = model.pitches.length * pianoRowHeight

	useEffect(() => {
		const pending = pendingFocusId.current
		if (pending === null) return
		const element = noteRefs.current.get(pending)
		if (element === undefined) return
		pendingFocusId.current = null
		element.focus()
	}, [model.notes])

	useEffect(() => {
		if (selectedNoteId !== null && !model.notes.some(({ id }) => id === selectedNoteId)) {
			setSelectedNoteId(null)
		}
	}, [model.notes, selectedNoteId])

	const gridMetrics = () => {
		const rect = gridRef.current?.getBoundingClientRect()
		return {
			rect,
			metrics: {
				gridTicks: model.gridTicks,
				height: rect?.height ?? gridHeight,
				pitchValues,
				totalTicks: model.totalTicks,
				width: rect?.width ?? 1
			}
		}
	}

	const beginGesture = (
		event: ReactPointerEvent<HTMLElement>,
		note: PianoNoteViewModel,
		mode: NoteEditMode
	): void => {
		if (event.button !== 0) return
		event.preventDefault()
		event.stopPropagation()
		const button = event.currentTarget.closest('button')
		if (!(button instanceof HTMLButtonElement)) return
		button.focus()
		button.setPointerCapture(event.pointerId)
		const active: ActiveNoteGesture = {
			noteId: note.id,
			pointerId: event.pointerId,
			mode,
			note: editableValues(note),
			originClientX: event.clientX,
			originClientY: event.clientY
		}
		gestureRef.current = active
		const nextPreview = { id: note.id, values: active.note }
		previewRef.current = nextPreview
		setPreview(nextPreview)
	}

	const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>): void => {
		const gesture = gestureRef.current
		if (gesture === null || gesture.pointerId !== event.pointerId) return
		const { metrics } = gridMetrics()
		const nextPreview = {
			id: gesture.noteId,
			values: editNoteFromPointer(gesture, event.clientX, event.clientY, metrics)
		}
		previewRef.current = nextPreview
		setPreview(nextPreview)
	}

	const finishGesture = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean): void => {
		const gesture = gestureRef.current
		if (gesture === null || gesture.pointerId !== event.pointerId) return
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		const completedPreview = previewRef.current
		gestureRef.current = null
		previewRef.current = null
		setPreview(null)
		if (commit && completedPreview?.id === gesture.noteId) {
			onUpdateNote(gesture.noteId, completedPreview.values)
		}
	}

	return (
		<section className="studio-view piano-editor" data-testid="view-piano-roll">
			<StudioTopBar
				actions={
					<>
						<ProjectHistoryControls />
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
						<div className="piano-track-scroll">
							<div aria-hidden="true" className="piano-keys">
								<div className="piano-key-ruler" />
								{model.pitches.map((pitch) => (
									<div
										className={`pkey${pitch.black ? ' black' : ''}`}
										key={pitch.pitch}
									>
										{pitch.label}
									</div>
								))}
							</div>
							<div
								aria-label={t('pianoRoll.title')}
								className="piano-roll"
								role="group"
							>
								<div
									aria-hidden="true"
									className="roll-ruler"
									style={{
										gridTemplateColumns: `repeat(${String(Math.ceil(model.bars))}, minmax(3.5rem, 1fr))`
									}}
								>
									{Array.from({ length: Math.ceil(model.bars) }, (_, index) => (
										<span key={index}>{index + 1}</span>
									))}
								</div>
								<div
									className="piano-roll-grid"
									onDoubleClick={(event) => {
										const rect = event.currentTarget.getBoundingClientRect()
										const note = noteAtGridPoint(
											event.clientX,
											event.clientY,
											rect.left,
											rect.top,
											gridMetrics().metrics,
											model.ticksPerQuarter
										)
										const id = onAddNote(note)
										if (id !== null) {
											pendingFocusId.current = id
											setSelectedNoteId(id)
										}
									}}
									onPointerDown={() => setSelectedNoteId(null)}
									ref={gridRef}
									style={{
										height: `${String(gridHeight)}px`,
										backgroundSize: `${String(100 / model.bars)}% 100%, 100% ${String(pianoRowHeight)}px`
									}}
								>
									<TransportPlayhead />
									{model.notes.length === 0 ? (
										<p aria-hidden="true" className="piano-empty-hint">
											{t('pianoRoll.emptyHint')}
										</p>
									) : null}
									{model.notes.map((sourceNote) => {
										const note = noteWithPreview(sourceNote, preview, model)
										const selected = selectedNoteId === note.id
										return (
											<button
												aria-label={t('pianoRoll.noteAtBeat', {
													pitch: note.pitch,
													beat: note.startTick / model.ticksPerQuarter + 1
												})}
												className={`piano-note${selected ? ' selected' : ''}`}
												data-note-id={note.id}
												key={note.id}
												onBlur={() => {
													if (gestureRef.current === null)
														setSelectedNoteId(null)
												}}
												onDoubleClick={(event) => {
													event.stopPropagation()
													setSelectedNoteId(null)
													onDeleteNote(note.id)
												}}
												onFocus={() => setSelectedNoteId(note.id)}
												onPointerCancel={(event) =>
													finishGesture(event, false)
												}
												onPointerDown={(event) =>
													beginGesture(event, sourceNote, 'move')
												}
												onPointerMove={moveGesture}
												onPointerUp={(event) => finishGesture(event, true)}
												ref={(element) => {
													if (element === null)
														noteRefs.current.delete(note.id)
													else noteRefs.current.set(note.id, element)
												}}
												style={noteStyle(note, model.totalTicks)}
												type="button"
											>
												{(['start', 'end', 'top', 'bottom'] as const).map(
													(point) => (
														<span
															aria-hidden="true"
															className={`note-point ${point}`}
															key={point}
															onPointerDown={
																point === 'start' || point === 'end'
																	? (event) =>
																			beginGesture(
																				event,
																				sourceNote,
																				point === 'start'
																					? 'resize-start'
																					: 'resize-end'
																			)
																	: undefined
															}
														/>
													)
												)}
											</button>
										)
									})}
								</div>
							</div>
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
									{selectedNote === null
										? t('pianoRoll.selectedNoteNone')
										: t('pianoRoll.selectedNoteSummary', {
												pitch: selectedNote.pitch,
												beat:
													selectedNote.startTick / model.ticksPerQuarter +
													1,
												length:
													selectedNote.durationTicks /
													model.ticksPerQuarter
											})}
								</div>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.editing')}</div>
								<div className="theory-copy">{t('pianoRoll.editHint')}</div>
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
								{t('pianoRoll.velocity')} 80
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
