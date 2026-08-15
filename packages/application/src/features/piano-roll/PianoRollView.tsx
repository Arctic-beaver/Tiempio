import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Circle,
	Keyboard,
	Minus,
	Plus,
	Repeat2,
	Square,
	X
} from 'lucide-react'
import {
	useEffect,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent
} from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { ProjectHistoryControls } from '../../commands/ProjectHistoryControls.js'
import { classifyPerformanceFocusTarget } from '../../performance/performance-input-events.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { usePresentationSettings } from '../../providers/PresentationSettingsContext.js'
import type { LayersProjection, ProjectedLayerItem } from '../../project/projections/types.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
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
import {
	recordingLocation,
	recordingNote,
	recordingNoteState,
	sourceRecordingShortcut
} from './recording-presentation.js'
import { SourceOffscreenIndicators } from './SourceOffscreenIndicators.js'
import { SourcePlayhead } from './SourcePlayhead.js'
import { SourceRuler } from './SourceRuler.js'
import {
	offscreenSourceNotes,
	sourceCanvasTicks,
	sourceViewportLimits,
	sourceViewportWindowFromPixels,
	type SourceViewportWindow
} from './source-viewport.js'
import type { PianoNoteUpdateOptions } from './usePianoRollActions.js'
import { useSourceViewport } from './useSourceViewport.js'
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
const inspectorPreferenceKey = 'tiempio.piano-roll.musical-context-expanded'
const keyboardPreferenceKey = 'tiempio.piano-roll.performance-keyboard-expanded'
const pianoRulerHeight = 48
const pianoKeysWidth = 58

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

function inspectorWasExpanded(): boolean {
	try {
		return globalThis.localStorage?.getItem(inspectorPreferenceKey) !== 'false'
	} catch {
		return true
	}
}

function rememberInspectorExpanded(expanded: boolean): void {
	try {
		globalThis.localStorage?.setItem(inspectorPreferenceKey, String(expanded))
	} catch {
		// The inspector remains usable for this session when storage is unavailable.
	}
}

function keyboardWasExpanded(): boolean {
	try {
		return globalThis.localStorage?.getItem(keyboardPreferenceKey) !== 'false'
	} catch {
		return true
	}
}

function rememberKeyboardExpanded(expanded: boolean): void {
	try {
		globalThis.localStorage?.setItem(keyboardPreferenceKey, String(expanded))
	} catch {
		// The dock remains independently collapsible for this session.
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
	totalTicks: number,
	rowHeight: number
): CSSProperties & { readonly '--note-visual-height': string } {
	const geometry = geometryForNote(note, totalTicks, undefined, rowHeight)
	return {
		left: `${String(geometry.leftPercent)}%`,
		top: `${String(note.row * rowHeight)}px`,
		width: `${String(geometry.widthPercent)}%`,
		height: `${String(rowHeight)}px`,
		'--note-visual-height': `${String(geometry.height)}px`
	}
}

export interface PianoRollViewProperties {
	readonly layers: LayersProjection
	readonly model: PianoRollViewModel & {
		readonly layerId: string | null
		readonly revision: number
	}
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
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const recording = useSyncExternalStore(
		controller.recordingCoordinator.subscribe,
		controller.recordingCoordinator.getSnapshot,
		controller.recordingCoordinator.getSnapshot
	)
	const sourceLayerId = model.layerId ?? 'source.empty'
	const viewportDefaults = useMemo(
		() => ({ pitchAnchor: model.recommendedPitch }),
		[model.recommendedPitch]
	)
	const viewport = useSourceViewport(sourceLayerId, viewportDefaults)
	const updateViewport = viewport.update
	const [hintDismissed, setHintDismissed] = useState(
		() => pianoHintWasDismissed() || model.notes.length > 0
	)
	const [inspectorExpanded, setInspectorExpanded] = useState(inspectorWasExpanded)
	const [keyboardExpanded, setKeyboardExpanded] = useState(keyboardWasExpanded)
	const [dismissedPassId, setDismissedPassId] = useState<string | null>(null)
	const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
	const [preview, setPreview] = useState<NotePreview | null>(null)
	const previewRef = useRef<NotePreview | null>(null)
	const gestureRef = useRef<ActiveNoteGesture | null>(null)
	const gridRef = useRef<HTMLDivElement | null>(null)
	const scrollRef = useRef<HTMLDivElement | null>(null)
	const inspectorToggleRef = useRef<HTMLButtonElement | null>(null)
	const noteRefs = useRef(new Map<string, HTMLButtonElement>())
	const pendingFocusId = useRef<string | null>(null)
	const keyboardGestureRef = useRef<ActiveKeyboardGesture | null>(null)
	const selectedLayer = layers.items.find((item) => item.id === layers.activeLayerId)
	const subtitle = `${editorLayerName(selectedLayer)} · ${editorLayerSound(selectedLayer)}`
	const selectedNoteSource = model.notes.find((note) => note.id === selectedNoteId) ?? null
	const selectedNote =
		selectedNoteSource === null ? null : noteWithPreview(selectedNoteSource, preview, model)
	const pitchValues = pitchModelsToValues(model.pitches)
	const rowHeight = pianoRowHeight * viewport.state.verticalZoom
	const gridHeight = model.pitches.length * rowHeight
	const canvasTicks = sourceCanvasTicks(model.materialEndTick, viewport.state, model.ticksPerBar)
	const beatCount = Math.max(1, Math.ceil(canvasTicks / model.ticksPerBeat))
	const canvasWidth = Math.max(544, beatCount * 48 * viewport.state.horizontalZoom)
	const homeChord = model.palette.chords.find(({ role }) => role === 'home')
	const homeChordDegrees = new Set(homeChord?.degreeIndices ?? [])
	const [visibleWindow, setVisibleWindow] = useState<SourceViewportWindow>(() => ({
		startTick: viewport.state.timeAnchorTick,
		endTick: Math.min(canvasTicks, viewport.state.timeAnchorTick + model.ticksPerBar * 8),
		highestPitch: Math.min(127, viewport.state.pitchAnchor + 12),
		lowestPitch: Math.max(0, viewport.state.pitchAnchor - 12)
	}))
	const offscreenNotes = offscreenSourceNotes(model.notes, visibleWindow)
	const firstVisibleBeat = Math.max(
		0,
		Math.floor(visibleWindow.startTick / model.ticksPerBeat) - 1
	)
	const lastVisibleBeat = Math.min(
		beatCount,
		firstVisibleBeat + 256,
		Math.ceil(visibleWindow.endTick / model.ticksPerBeat) + 2
	)
	const visibleBeats = Array.from(
		{ length: Math.max(0, lastVisibleBeat - firstVisibleBeat) },
		(_, offset) => firstVisibleBeat + offset
	)
	const restoredViewportKey = useRef<string | null>(null)
	const recordingActive = ['starting', 'count-in', 'recording', 'stopping'].includes(
		recording.phase
	)
	const recordingForLayer =
		recordingActive && recording.layerId !== null && recording.layerId === model.layerId
	const showLastPass =
		recording.lastPass !== null && recording.lastPass.recordingId !== dismissedPassId
	const liveNotesById = useMemo(
		() => new Map(recording.liveNotes.map((note) => [note.noteId, note])),
		[recording.liveNotes]
	)
	const cursorLocation = recordingLocation(
		recording.cursorTick,
		model.ticksPerBeat,
		model.meterNumerator
	)
	const recordingStatus =
		recording.phase === 'starting'
			? t('pianoRoll.startingRecording')
			: recording.phase === 'count-in'
				? t('pianoRoll.countIn', { count: recording.countInBeatsRemaining })
				: recording.phase === 'recording' && cursorLocation !== null
					? t('pianoRoll.recordingStatus', cursorLocation)
					: recording.phase === 'stopping'
						? t('pianoRoll.stoppingRecording')
						: recording.phase === 'recovery-required'
							? t('pianoRoll.recordingRecovery')
							: t('pianoRoll.record')
	const dismissLastPass = useCallback((): void => {
		if (recording.lastPass !== null) setDismissedPassId(recording.lastPass.recordingId)
	}, [recording.lastPass])

	const readVisibleWindow = useCallback(
		(element: HTMLDivElement): SourceViewportWindow =>
			sourceViewportWindowFromPixels({
				canvasTicks,
				canvasWidth,
				clientHeight: element.clientHeight,
				clientWidth: element.clientWidth,
				keysWidth: pianoKeysWidth,
				rowHeight,
				rulerHeight: pianoRulerHeight,
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop
			}),
		[canvasTicks, canvasWidth, rowHeight]
	)

	const publishScrollPosition = useCallback(
		(element: HTMLDivElement): void => {
			const window = readVisibleWindow(element)
			setVisibleWindow(window)
			updateViewport({
				timeAnchorTick: window.startTick,
				pitchAnchor: (window.highestPitch + window.lowestPitch) / 2
			})
		},
		[readVisibleWindow, updateViewport]
	)

	const scrollPitchIntoView = (pitch: number): void => {
		const element = scrollRef.current
		if (element === null) return
		const centerRow = sourceViewportLimits.maximumPitch - pitch
		element.scrollTop = Math.max(
			0,
			pianoRulerHeight + centerRow * rowHeight - element.clientHeight / 2
		)
		viewport.update({ pitchAnchor: pitch })
		publishScrollPosition(element)
	}

	useLayoutEffect(() => {
		const restoreKey = `${sourceLayerId}:${String(viewport.state.horizontalZoom)}:${String(viewport.state.verticalZoom)}`
		if (restoredViewportKey.current === restoreKey) return
		const element = scrollRef.current
		if (element === null) return
		restoredViewportKey.current = restoreKey
		element.scrollLeft =
			pianoKeysWidth +
			(viewport.state.timeAnchorTick / Math.max(1, canvasTicks)) * canvasWidth
		const centerRow = sourceViewportLimits.maximumPitch - viewport.state.pitchAnchor
		element.scrollTop = Math.max(
			0,
			pianoRulerHeight + centerRow * rowHeight - element.clientHeight / 2
		)
		setVisibleWindow(readVisibleWindow(element))
	}, [
		canvasTicks,
		canvasWidth,
		readVisibleWindow,
		rowHeight,
		sourceLayerId,
		viewport.state.horizontalZoom,
		viewport.state.pitchAnchor,
		viewport.state.timeAnchorTick,
		viewport.state.verticalZoom
	])

	useEffect(() => {
		const pending = pendingFocusId.current
		if (pending === null) return
		const element = noteRefs.current.get(pending)
		if (element === undefined) return
		pendingFocusId.current = null
		element.focus()
	}, [model.notes])

	useEffect(() => {
		return () => {
			controller.stopRecording()
		}
	}, [controller])

	useEffect(() => {
		const handleRecordingShortcut = (event: globalThis.KeyboardEvent): void => {
			const focusTarget = classifyPerformanceFocusTarget(event.target)
			if (focusTarget === 'text-editing' || focusTarget === 'modal-or-capture') return
			const action = sourceRecordingShortcut(event, recordingActive)
			if (action === null) return
			if (action === 'stop') {
				event.preventDefault()
				controller.stopRecording()
				return
			}
			const layerId = model.layerId
			if (!engine.available || layerId === null || recording.phase !== 'idle') return
			event.preventDefault()
			dismissLastPass()
			void controller.startRecording(
				layerId,
				Math.max(0, Math.round(viewport.state.manualPlayheadTick)),
				1
			)
		}
		document.addEventListener('keydown', handleRecordingShortcut)
		return () => document.removeEventListener('keydown', handleRecordingShortcut)
	}, [
		controller,
		dismissLastPass,
		engine.available,
		model.layerId,
		recording.phase,
		recordingActive,
		viewport.state.manualPlayheadTick
	])

	useEffect(() => {
		if (!recordingForLayer || recording.cursorTick === null) return
		const element = scrollRef.current
		if (element === null) return
		const window = readVisibleWindow(element)
		const followThreshold = Math.max(
			model.ticksPerBeat,
			(window.endTick - window.startTick) * 0.22
		)
		if (recording.cursorTick <= window.endTick - followThreshold) return
		const cursorPixel =
			pianoKeysWidth + (recording.cursorTick / Math.max(1, canvasTicks)) * canvasWidth
		element.scrollLeft = Math.max(0, cursorPixel - element.clientWidth * 0.72)
		publishScrollPosition(element)
	}, [
		canvasTicks,
		canvasWidth,
		model.ticksPerBeat,
		publishScrollPosition,
		readVisibleWindow,
		recording.cursorTick,
		recordingForLayer
	])

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
				rowHeight,
				totalTicks: canvasTicks,
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
			geometryForNote(note, canvasTicks, undefined, rowHeight).height
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
				totalTicks: canvasTicks
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

	const transposeSelectedNote = (semitones: -12 | 12): void => {
		if (selectedNoteSource === null) return
		const pitch = selectedNoteSource.pitchValue + semitones
		if (pitch < 0 || pitch > 127) return
		pendingFocusId.current = selectedNoteSource.id
		onUpdateNote(selectedNoteSource.id, {
			...editableValues(selectedNoteSource),
			pitch
		})
	}

	const changeZoom = (axis: 'horizontalZoom' | 'verticalZoom', direction: -1 | 1): void => {
		const current = viewport.state[axis]
		viewport.update({ [axis]: current + direction * 0.25 })
	}

	const toggleRecording = (): void => {
		if (recordingActive) {
			controller.stopRecording()
			return
		}
		if (!engine.available || model.layerId === null || recording.phase !== 'idle') return
		dismissLastPass()
		void controller.startRecording(
			model.layerId,
			Math.max(0, Math.round(viewport.state.manualPlayheadTick)),
			1
		)
	}

	return (
		<section
			className="studio-view piano-editor"
			data-recording-state={recording.phase}
			data-testid="view-piano-roll"
		>
			<StudioTopBar
				actions={
					<div className="history-actions" role="group">
						<ProjectHistoryControls />
					</div>
				}
				center={
					<div className="source-editor-transport">
						<TransportBar
							meterDescription={t('pianoRoll.meterDescription', {
								beats: model.meterNumerator
							})}
							meterValue={`${String(model.meterNumerator)}/${String(model.meterDenominator)}`}
						/>
						<button
							aria-keyshortcuts={recordingActive ? 'R Escape Space' : 'R'}
							aria-label={
								recordingActive
									? t('pianoRoll.stopRecording')
									: t('pianoRoll.record')
							}
							aria-pressed={recordingActive}
							className="source-recording-control"
							data-phase={recording.phase}
							disabled={
								(!recordingActive &&
									(!engine.available ||
										model.layerId === null ||
										recording.phase !== 'idle')) ||
								recording.phase === 'stopping'
							}
							onClick={toggleRecording}
							title={recordingStatus}
							type="button"
						>
							{recordingActive ? (
								<Square aria-hidden="true" />
							) : (
								<Circle aria-hidden="true" />
							)}
							<span>{recordingStatus}</span>
						</button>
					</div>
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
					<div className={`piano-area${inspectorExpanded ? '' : ' inspector-collapsed'}`}>
						<div
							className="piano-track-scroll"
							onScroll={(event) => publishScrollPosition(event.currentTarget)}
							ref={scrollRef}
						>
							<div aria-hidden="true" className="piano-keys">
								<div className="piano-key-ruler" />
								{model.pitches.map((pitch) => (
									<div
										className={`pkey${pitch.black ? ' black' : ''}`}
										key={pitch.pitch}
										style={{ height: `${String(rowHeight)}px` }}
									>
										{pitch.label}
									</div>
								))}
							</div>
							<div
								aria-label={t('pianoRoll.title')}
								className="piano-roll"
								role="group"
								style={{ minWidth: `${String(canvasWidth)}px` }}
							>
								<SourceRuler
									canvasTicks={canvasTicks}
									label={t('pianoRoll.sourceRuler')}
									markerLabel={(bar, beat) =>
										t('transport.seekBarBeat', { bar, beat })
									}
									meterNumerator={model.meterNumerator}
									onSeek={(manualPlayheadTick) =>
										viewport.update({ manualPlayheadTick })
									}
									ticksPerBeat={model.ticksPerBeat}
									visibleWindow={visibleWindow}
								/>
								<div
									className="piano-roll-grid"
									onDoubleClick={(event) => {
										if (recordingActive) return
										dismissLastPass()
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
									onPointerDown={() => {
										dismissLastPass()
										setSelectedNoteId(null)
									}}
									ref={gridRef}
									style={{
										height: `${String(gridHeight)}px`,
										backgroundSize: `${String((model.gridTicks / canvasTicks) * 100)}% 100%, 100% ${String(rowHeight)}px`
									}}
								>
									<div
										aria-hidden="true"
										className="piano-beat-lines"
										style={{
											gridTemplateColumns: 'none'
										}}
									>
										{visibleBeats.map((index) => (
											<span
												className={
													index % model.meterNumerator === 0
														? 'bar-start'
														: ''
												}
												key={index}
												style={{
													left: `${String(((index * model.ticksPerBeat) / canvasTicks) * 100)}%`
												}}
											/>
										))}
									</div>
									<div
										aria-label={t('pianoRoll.materialEnd')}
										className="material-end-boundary"
										role="separator"
										style={{
											left: `${String((model.materialEndTick / Math.max(1, canvasTicks)) * 100)}%`
										}}
									>
										<span>{t('pianoRoll.materialEnd')}</span>
									</div>
									<SourcePlayhead
										canvasTicks={canvasTicks}
										gridRef={gridRef}
										gridTicks={model.gridTicks}
										label={t('pianoRoll.sourcePlayhead', {
											tick: viewport.state.manualPlayheadTick
										})}
										onSeek={(manualPlayheadTick) =>
											viewport.update({ manualPlayheadTick })
										}
										playheadTick={viewport.state.manualPlayheadTick}
										scrollRef={scrollRef}
										ticksPerBeat={model.ticksPerBeat}
									/>
									{recordingForLayer && recording.cursorTick !== null ? (
										<div
											aria-label={t('pianoRoll.recordingPlayhead', {
												tick: recording.cursorTick
											})}
											aria-orientation="vertical"
											className="recording-playhead"
											role="separator"
											style={{
												left: `${String((recording.cursorTick / Math.max(1, canvasTicks)) * 100)}%`
											}}
										/>
									) : null}
									<SourceOffscreenIndicators
										above={offscreenNotes.above}
										below={offscreenNotes.below}
										canvasTicks={canvasTicks}
										higherLabel={(count) =>
											t('pianoRoll.notesAbove', { count })
										}
										lowerLabel={(count) => t('pianoRoll.notesBelow', { count })}
										onRevealPitch={scrollPitchIntoView}
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
										const note = noteWithPreview(
											recordingNote(
												sourceNote,
												liveNotesById.get(sourceNote.id),
												recording.cursorTick
											),
											preview,
											model
										)
										const selected = selectedNoteId === note.id
										const recordingState = recordingNoteState(
											note.id,
											recording,
											showLastPass
										)
										return (
											<button
												aria-label={t('pianoRoll.noteAtBeat', {
													pitch: note.pitch,
													beat: note.startTick / model.ticksPerQuarter + 1
												})}
												aria-roledescription={
													recordingState === 'live'
														? t('pianoRoll.liveRecordingNote')
														: recordingState === 'last-pass'
															? t('pianoRoll.lastRecordedPass')
															: undefined
												}
												className={`piano-note${selected ? ' selected' : ''}${recordingState === 'live' ? ' recording-live' : ''}${recordingState === 'last-pass' ? ' recording-last-pass' : ''}`}
												data-note-id={note.id}
												disabled={recordingActive}
												key={note.id}
												onBlur={(event) => {
													endKeyboardGesture()
													const preservesSelection =
														event.relatedTarget instanceof
															HTMLElement &&
														event.relatedTarget.closest(
															'[data-preserve-note-selection]'
														) !== null
													if (
														gestureRef.current === null &&
														!preservesSelection
													)
														setSelectedNoteId(null)
												}}
												onDoubleClick={(event) => {
													event.stopPropagation()
													setSelectedNoteId(null)
													onDeleteNote(note.id)
												}}
												onFocus={() => {
													dismissLastPass()
													setSelectedNoteId(note.id)
												}}
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
												style={noteStyle(note, canvasTicks, rowHeight)}
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
						{recordingForLayer && recording.phase === 'count-in' ? (
							<div
								aria-atomic="true"
								aria-live="assertive"
								className="recording-count-in"
								role="status"
							>
								<strong>{recording.countInBeatsRemaining}</strong>
								<span>
									{t('pianoRoll.countIn', {
										count: recording.countInBeatsRemaining
									})}
								</span>
							</div>
						) : null}
						<aside
							aria-label={t('pianoRoll.musicalContext')}
							className={`harmony-panel${inspectorExpanded ? ' expanded' : ' collapsed'}`}
						>
							<button
								aria-controls="piano-roll-musical-context"
								aria-expanded={inspectorExpanded}
								aria-label={
									inspectorExpanded
										? t('pianoRoll.collapseMusicalContext')
										: t('pianoRoll.openMusicalContext')
								}
								className="inspector-disclosure"
								data-preserve-note-selection="true"
								onClick={() => {
									const expanded = !inspectorExpanded
									setInspectorExpanded(expanded)
									rememberInspectorExpanded(expanded)
								}}
								ref={inspectorToggleRef}
								type="button"
							>
								{inspectorExpanded ? (
									<ChevronRight aria-hidden="true" />
								) : (
									<ChevronLeft aria-hidden="true" />
								)}
								<span>{t('pianoRoll.musicalContext')}</span>
							</button>
							{inspectorExpanded ? (
								<div id="piano-roll-musical-context">
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
										<div className="theory-label">
											{t('pianoRoll.scaleNotes')}
										</div>
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
										<div className="theory-label">
											{t('pianoRoll.selectedNote')}
										</div>
										<div className="theory-copy">
											{selectedNote === null
												? t('pianoRoll.selectedNoteNone')
												: t('pianoRoll.selectedNoteSummary', {
														pitch: selectedNote.pitch,
														beat:
															selectedNote.startTick /
																model.ticksPerQuarter +
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
								</div>
							) : null}
						</aside>
					</div>
					<section
						aria-label={t('pianoRoll.keyboardDock')}
						className={`source-performance-dock${keyboardExpanded ? ' expanded' : ' collapsed'}`}
					>
						<header>
							<span>
								<Keyboard aria-hidden="true" />
								{t('pianoRoll.keyboardDock')}
							</span>
							<button
								aria-expanded={keyboardExpanded}
								aria-label={
									keyboardExpanded
										? t('pianoRoll.collapseKeyboard')
										: t('pianoRoll.expandKeyboard')
								}
								onClick={() => {
									const expanded = !keyboardExpanded
									setKeyboardExpanded(expanded)
									rememberKeyboardExpanded(expanded)
								}}
								type="button"
							>
								{keyboardExpanded ? (
									<ChevronDown aria-hidden="true" />
								) : (
									<ChevronUp aria-hidden="true" />
								)}
							</button>
						</header>
						<div hidden={!keyboardExpanded}>
							<PerformanceKeyboard
								keyboardCapture="document"
								layout="compact"
								layerId={model.layerId}
								octave={model.performanceOctave}
								ownerId={`piano-roll:${sourceLayerId}`}
								palette={model.palette}
								presentation="strip"
								rotation={0}
							/>
						</div>
					</section>
					<div className="editor-footer">
						<div className="footer-tools source-viewport-tools">
							<span>{t('pianoRoll.timeZoom')}</span>
							<button
								aria-label={t('pianoRoll.timeZoomOut')}
								className="text-tool"
								data-preserve-note-selection="true"
								disabled={
									viewport.state.horizontalZoom <=
									sourceViewportLimits.horizontalZoomMinimum
								}
								onClick={() => changeZoom('horizontalZoom', -1)}
								type="button"
							>
								<Minus aria-hidden="true" />
							</button>
							<strong>{Math.round(viewport.state.horizontalZoom * 100)}%</strong>
							<button
								aria-label={t('pianoRoll.timeZoomIn')}
								className="text-tool"
								data-preserve-note-selection="true"
								disabled={
									viewport.state.horizontalZoom >=
									sourceViewportLimits.horizontalZoomMaximum
								}
								onClick={() => changeZoom('horizontalZoom', 1)}
								type="button"
							>
								<Plus aria-hidden="true" />
							</button>
						</div>
						<div className="source-footer-center">
							<div className="cycle-strip">
								<Repeat2 aria-hidden="true" />
								<div aria-hidden="true" className="cycle">
									<div className="cycle-sound">
										{t('pianoRoll.barCount', { count: model.bars })}
									</div>
									<div className="cycle-rest">{t('pianoRoll.rest')}</div>
								</div>
							</div>
							{selectedNote === null ? null : (
								<div className="selected-note-actions" role="group">
									<button
										data-preserve-note-selection="true"
										disabled={recordingActive || selectedNote.pitchValue < 12}
										onClick={() => transposeSelectedNote(-12)}
										title={
											selectedNote.pitchValue < 12
												? t('pianoRoll.octaveLowerBoundary')
												: t('pianoRoll.octaveDownDescription')
										}
										type="button"
									>
										{t('pianoRoll.octaveDown')}
									</button>
									<button
										data-preserve-note-selection="true"
										disabled={recordingActive || selectedNote.pitchValue > 115}
										onClick={() => transposeSelectedNote(12)}
										title={
											selectedNote.pitchValue > 115
												? t('pianoRoll.octaveUpperBoundary')
												: t('pianoRoll.octaveUpDescription')
										}
										type="button"
									>
										{t('pianoRoll.octaveUp')}
									</button>
								</div>
							)}
						</div>
						<div className="footer-tools source-viewport-tools right">
							<span>{t('pianoRoll.pitchZoom')}</span>
							<button
								aria-label={t('pianoRoll.pitchZoomOut')}
								className="text-tool"
								data-preserve-note-selection="true"
								disabled={
									viewport.state.verticalZoom <=
									sourceViewportLimits.verticalZoomMinimum
								}
								onClick={() => changeZoom('verticalZoom', -1)}
								type="button"
							>
								<Minus aria-hidden="true" />
							</button>
							<strong>{Math.round(viewport.state.verticalZoom * 100)}%</strong>
							<button
								aria-label={t('pianoRoll.pitchZoomIn')}
								className="text-tool"
								data-preserve-note-selection="true"
								disabled={
									viewport.state.verticalZoom >=
									sourceViewportLimits.verticalZoomMaximum
								}
								onClick={() => changeZoom('verticalZoom', 1)}
								type="button"
							>
								<Plus aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
