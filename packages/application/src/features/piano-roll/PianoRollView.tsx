import { Copy, Repeat2, Scissors, X } from 'lucide-react'
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent
} from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { ProjectHistoryControls } from '../../commands/ProjectHistoryControls.js'
import { usePresentationSettings } from '../../providers/PresentationSettingsContext.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { TransportPlayhead } from '../../shell/TransportPlayhead.js'
import { TransportRuler } from '../../shell/TransportRuler.js'
import { EditorLayerList } from '../shared/EditorLayerList.js'
import { editorLayerName, editorLayerSound } from '../shared/editor-layer-presentation.js'
import {
	editNoteFromPointer,
	geometryForNote,
	noteAtGridPoint,
	pianoRowHeight,
	pitchModelsToValues,
	resolveOverlappingHandleMode,
	type EditableNoteValues,
	type NoteEditGesture,
	type NoteEditMode,
	type PianoGridMetrics
} from './note-editor-geometry.js'
import { editNoteFromKeyboard } from './note-editor-keyboard.js'
import type { PianoNoteUpdateOptions } from './usePianoRollActions.js'
import type { PianoNoteViewModel, PianoRollViewModel } from './view-model.js'

interface ActiveNoteGesture extends NoteEditGesture {
	readonly noteId: string
	readonly pointerId: number
	readonly revision: number
}

interface NotePreview {
	readonly id: string
	readonly values: EditableNoteValues
}

interface ActiveKeyboardGesture {
	readonly code: string
	readonly group: string
	readonly noteId: string
	readonly values: EditableNoteValues
}

const pianoHintPreferenceKey = 'tiempio.piano-roll.first-use-hint-dismissed'

function pianoHintWasDismissed(): boolean {
	try {
		return globalThis.localStorage?.getItem(pianoHintPreferenceKey) === 'true'
	} catch {
		return false
	}
}

function rememberPianoHintDismissal(): void {
	try {
		globalThis.localStorage?.setItem(pianoHintPreferenceKey, 'true')
	} catch {
		// The hint can still be dismissed for this session when storage is unavailable.
	}
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

function noteStyle(
	note: PianoNoteViewModel,
	totalTicks: number
): CSSProperties & { readonly '--note-visual-height': string } {
	const geometry = geometryForNote(note, totalTicks)
	return {
		left: `${String(geometry.leftPercent)}%`,
		top: `${String(note.row * pianoRowHeight + 1)}px`,
		width: `${String(geometry.widthPercent)}%`,
		height: '24px',
		'--note-visual-height': `${String(geometry.height)}px`
	}
}

export interface PianoRollViewProperties {
	readonly layers: LayersProjection
	readonly model: PianoRollViewModel & { readonly revision: number }
	readonly onAddLayer: () => void
	readonly onAddNote: (note: EditableNoteValues) => string | null
	readonly onDeleteNote: (noteId: string) => void
	readonly onEndHistoryGroup: (historyGroup: string) => void
	readonly onSelectLayer: (item: ProjectedLayerItem) => void
	readonly onUpdateNote: (
		noteId: string,
		note: EditableNoteValues,
		options?: PianoNoteUpdateOptions
	) => void
}

export function PianoRollView({
	layers,
	model,
	onAddLayer,
	onAddNote,
	onDeleteNote,
	onEndHistoryGroup,
	onSelectLayer,
	onUpdateNote
}: PianoRollViewProperties): JSX.Element {
	const { t } = useLocalization()
	const { shortcutOverrides } = usePresentationSettings()
	const [hintDismissed, setHintDismissed] = useState(
		() => pianoHintWasDismissed() || model.notes.length > 0
	)
	const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
	const [preview, setPreview] = useState<NotePreview | null>(null)
	const previewRef = useRef<NotePreview | null>(null)
	const gestureRef = useRef<ActiveNoteGesture | null>(null)
	const gridRef = useRef<HTMLDivElement | null>(null)
	const noteRefs = useRef(new Map<string, HTMLButtonElement>())
	const pendingFocusId = useRef<string | null>(null)
	const keyboardGestureRef = useRef<ActiveKeyboardGesture | null>(null)
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const selectedNoteSource = model.notes.find((note) => note.id === selectedNoteId) ?? null
	const selectedNote =
		selectedNoteSource === null ? null : noteWithPreview(selectedNoteSource, preview, model)
	const pitchValues = pitchModelsToValues(model.pitches)
	const gridHeight = model.pitches.length * pianoRowHeight
	const beatCount = Math.max(1, Math.ceil(model.totalTicks / model.ticksPerBeat))
	const homeChord = model.palette.chords.find(({ role }) => role === 'home')
	const homeChordDegrees = new Set(homeChord?.degreeIndices ?? [])

	useEffect(() => {
		const pending = pendingFocusId.current
		if (pending === null) return
		const element = noteRefs.current.get(pending)
		if (element === undefined) return
		pendingFocusId.current = null
		element.focus()
	}, [model.notes])

	const gridMetrics = (): {
		readonly metrics: PianoGridMetrics
		readonly rect: DOMRect | undefined
	} => {
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
		const keyboardGesture = keyboardGestureRef.current
		if (keyboardGesture !== null) {
			onEndHistoryGroup(keyboardGesture.group)
			keyboardGestureRef.current = null
		}
		event.preventDefault()
		event.stopPropagation()
		const button = event.currentTarget.closest('button')
		if (!(button instanceof HTMLButtonElement)) return
		const rect = button.getBoundingClientRect()
		const resolvedMode = resolveOverlappingHandleMode(
			mode,
			event.clientX,
			event.clientY,
			rect,
			geometryForNote(note, model.totalTicks).height
		)
		button.focus()
		button.setPointerCapture(event.pointerId)
		const active: ActiveNoteGesture = {
			noteId: note.id,
			pointerId: event.pointerId,
			revision: model.revision,
			mode: resolvedMode,
			note: editableValues(note),
			originClientX: event.clientX,
			originClientY: event.clientY
		}
		gestureRef.current = active
		const nextPreview = { id: note.id, values: active.note }
		previewRef.current = nextPreview
		setPreview(nextPreview)
	}

	const endKeyboardGesture = (code?: string): void => {
		const active = keyboardGestureRef.current
		if (active === null || (code !== undefined && active.code !== code)) return
		onEndHistoryGroup(active.group)
		keyboardGestureRef.current = null
	}

	const handleNoteKeyDown = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		note: PianoNoteViewModel
	): void => {
		const group = [
			'note-key',
			note.id,
			event.code,
			event.altKey ? 'alt' : '-',
			event.ctrlKey ? 'ctrl' : '-',
			event.metaKey ? 'meta' : '-',
			event.shiftKey ? 'shift' : '-'
		].join(':')
		const active = keyboardGestureRef.current
		if (active !== null && active.group !== group) endKeyboardGesture()
		const sourceValues = active?.group === group ? active.values : editableValues(note)
		const edit = editNoteFromKeyboard(
			sourceValues,
			event,
			{
				gridTicks: model.gridTicks,
				ticksPerBar: model.ticksPerBar,
				ticksPerBeat: model.ticksPerBeat,
				totalTicks: model.totalTicks
			},
			shortcutOverrides
		)
		if (edit === null) return
		event.preventDefault()
		event.stopPropagation()
		if (edit.kind === 'delete') {
			endKeyboardGesture()
			setSelectedNoteId(null)
			onDeleteNote(note.id)
			return
		}
		keyboardGestureRef.current = {
			code: event.code,
			group,
			noteId: note.id,
			values: edit.values
		}
		onUpdateNote(note.id, edit.values, { historyGroup: group })
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
			onUpdateNote(gesture.noteId, completedPreview.values, {
				expectedRevision: gesture.revision
			})
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
				center={
					<TransportBar
						meterDescription={t('pianoRoll.meterDescription', {
							beats: model.meterNumerator
						})}
						meterValue={`${String(model.meterNumerator)}/${String(model.meterDenominator)}`}
					/>
				}
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
								style={{ minWidth: `${String(Math.max(544, beatCount * 48))}px` }}
							>
								<TransportRuler
									className="roll-ruler"
									endTick={model.startTick + model.totalTicks}
									granularity="beat"
									startTick={model.startTick}
								/>
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
											setHintDismissed(true)
											rememberPianoHintDismissal()
											pendingFocusId.current = id
											setSelectedNoteId(id)
										}
									}}
									onPointerDown={() => setSelectedNoteId(null)}
									ref={gridRef}
									style={{
										height: `${String(gridHeight)}px`,
										backgroundSize: `${String((model.gridTicks / model.totalTicks) * 100)}% 100%, 100% ${String(pianoRowHeight)}px`
									}}
								>
									<div
										aria-hidden="true"
										className="piano-beat-lines"
										style={{
											gridTemplateColumns: `repeat(${String(beatCount)}, minmax(0, 1fr))`
										}}
									>
										{Array.from({ length: beatCount }, (_, index) => (
											<span
												className={
													index % model.meterNumerator === 0
														? 'bar-start'
														: ''
												}
												key={index}
											/>
										))}
									</div>
									<TransportPlayhead
										endTick={model.startTick + model.totalTicks}
										startTick={model.startTick}
									/>
									{model.notes.length === 0 && !hintDismissed ? (
										<div className="piano-empty-hint" role="note">
											<span>{t('pianoRoll.emptyHint')}</span>
											<button
												aria-label={t('pianoRoll.dismissHint')}
												onClick={() => {
													setHintDismissed(true)
													rememberPianoHintDismissal()
												}}
												onDoubleClick={(event) => event.stopPropagation()}
												onPointerDown={(event) => event.stopPropagation()}
												type="button"
											>
												<X aria-hidden="true" />
											</button>
										</div>
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
													endKeyboardGesture()
													if (gestureRef.current === null)
														setSelectedNoteId(null)
												}}
												onDoubleClick={(event) => {
													event.stopPropagation()
													setSelectedNoteId(null)
													onDeleteNote(note.id)
												}}
												onFocus={() => setSelectedNoteId(note.id)}
												onKeyDown={(event) =>
													handleNoteKeyDown(event, sourceNote)
												}
												onKeyUp={(event) => endKeyboardGesture(event.code)}
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
												<span aria-hidden="true" className="note-fill" />
												{(['start', 'end', 'top', 'bottom'] as const).map(
													(point) => (
														<span
															aria-hidden="true"
															className={`note-point ${point}`}
															key={point}
															onPointerDown={(event) =>
																beginGesture(
																	event,
																	sourceNote,
																	point === 'start'
																		? 'resize-start'
																		: point === 'end'
																			? 'resize-end'
																			: point === 'top'
																				? 'resize-strength-top'
																				: 'resize-strength-bottom'
																)
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
								<h2>{model.palette.name}</h2>
								<span className="scale-badge">
									{t(
										model.palette.mode === 'major'
											? 'pianoRoll.majorScale'
											: 'pianoRoll.naturalMinorScale'
									)}
								</span>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.scaleNotes')}</div>
								<div className="note-set">
									{model.palette.noteNames.map((note, degreeIndex) => (
										<span
											className={`note-pill${degreeIndex === 0 ? ' root' : ''}${homeChordDegrees.has(degreeIndex) ? ' chord' : ''}`}
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
													model.ticksPerQuarter,
												velocity: selectedNote.velocity
											})}
								</div>
							</div>
							<div className="theory-line">
								<div className="theory-label">{t('pianoRoll.editing')}</div>
								<div className="theory-copy">
									{t('pianoRoll.editHint')}
									<br />
									{t('pianoRoll.keyboardHint')}
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
								{t('pianoRoll.velocity')} {selectedNote?.velocity ?? 80}
							</button>
						</div>
						<div className="cycle-strip">
							<Repeat2 aria-hidden="true" />
							<div aria-hidden="true" className="cycle">
								<div className="cycle-sound">
									{t('pianoRoll.barCount', { count: model.bars })}
								</div>
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
