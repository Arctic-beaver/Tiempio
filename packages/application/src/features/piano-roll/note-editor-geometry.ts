import type { PianoNoteViewModel, PianoPitchViewModel } from './view-model.js'

export const pianoRowHeight = 26 as const
export const minimumNoteHeight = 6 as const
export const maximumNoteHeight = 22 as const

export type NoteEditMode =
	'move' | 'resize-end' | 'resize-start' | 'resize-strength-bottom' | 'resize-strength-top'

export interface EditableNoteValues {
	readonly durationTicks: number
	readonly pitch: number
	readonly startTick: number
	readonly velocity: number
}

export interface NoteEditGesture {
	readonly mode: NoteEditMode
	readonly note: EditableNoteValues
	readonly originClientX: number
	readonly originClientY: number
}

export interface PianoGridMetrics {
	readonly gridTicks: number
	readonly height: number
	readonly pitchValues: readonly number[]
	readonly totalTicks: number
	readonly width: number
}

export interface NoteGeometry {
	readonly height: number
	readonly leftPercent: number
	readonly top: number
	readonly widthPercent: number
}

export interface NoteHandleRect {
	readonly height: number
	readonly left: number
	readonly top: number
	readonly width: number
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value))
}

function snap(value: number, interval: number): number {
	return Math.round(value / interval) * interval
}

export function geometryForNote(
	note: PianoNoteViewModel,
	totalTicks: number,
	height = noteHeightForVelocity(note.velocity)
): NoteGeometry {
	return {
		leftPercent: (note.startTick / totalTicks) * 100,
		widthPercent: (note.durationTicks / totalTicks) * 100,
		top: note.row * pianoRowHeight + (pianoRowHeight - height) / 2,
		height
	}
}

export function noteHeightForVelocity(velocity: number): number {
	const normalized = (clamp(velocity, 1, 127) - 1) / 126
	return Math.round(minimumNoteHeight + normalized * (maximumNoteHeight - minimumNoteHeight))
}

export function resolveOverlappingHandleMode(
	requestedMode: NoteEditMode,
	clientX: number,
	clientY: number,
	rect: NoteHandleRect,
	visualHeight: number
): NoteEditMode {
	if (requestedMode === 'move') return requestedMode
	const visualTop = rect.top + (rect.height - visualHeight) / 2
	const visualBottom = visualTop + visualHeight
	const distances: Readonly<Record<Exclude<NoteEditMode, 'move'>, number>> = {
		'resize-start': Math.abs(clientX - rect.left),
		'resize-end': Math.abs(clientX - (rect.left + rect.width)),
		'resize-strength-top': Math.abs(clientY - visualTop),
		'resize-strength-bottom': Math.abs(clientY - visualBottom)
	}
	return (Object.entries(distances) as [Exclude<NoteEditMode, 'move'>, number][]).reduce(
		(closest, candidate) => (candidate[1] < closest[1] ? candidate : closest),
		[requestedMode, distances[requestedMode]]
	)[0]
}

export function noteAtGridPoint(
	clientX: number,
	clientY: number,
	gridLeft: number,
	gridTop: number,
	metrics: PianoGridMetrics,
	defaultDurationTicks: number,
	defaultVelocity = 80
): EditableNoteValues {
	const row = clamp(
		Math.floor((clientY - gridTop) / pianoRowHeight),
		0,
		metrics.pitchValues.length - 1
	)
	const maximumStart = Math.max(0, metrics.totalTicks - defaultDurationTicks)
	const rawStart = ((clientX - gridLeft) / Math.max(1, metrics.width)) * metrics.totalTicks
	return {
		startTick: clamp(snap(rawStart, metrics.gridTicks), 0, maximumStart),
		durationTicks: defaultDurationTicks,
		pitch: metrics.pitchValues[row] ?? metrics.pitchValues[0] ?? 60,
		velocity: defaultVelocity
	}
}

export function editNoteFromPointer(
	gesture: NoteEditGesture,
	clientX: number,
	clientY: number,
	metrics: PianoGridMetrics
): EditableNoteValues {
	const minimumDuration = metrics.gridTicks
	if (gesture.mode === 'resize-strength-top' || gesture.mode === 'resize-strength-bottom') {
		const direction = gesture.mode === 'resize-strength-top' ? -1 : 1
		const velocityDelta = Math.round((clientY - gesture.originClientY) * direction * 3)
		return {
			...gesture.note,
			velocity: clamp(gesture.note.velocity + velocityDelta, 1, 127)
		}
	}
	const deltaTicks = snap(
		((clientX - gesture.originClientX) / Math.max(1, metrics.width)) * metrics.totalTicks,
		metrics.gridTicks
	)
	if (gesture.mode === 'resize-start') {
		const endTick = gesture.note.startTick + gesture.note.durationTicks
		const startTick = clamp(gesture.note.startTick + deltaTicks, 0, endTick - minimumDuration)
		return { ...gesture.note, startTick, durationTicks: endTick - startTick }
	}
	if (gesture.mode === 'resize-end') {
		const endTick = clamp(
			gesture.note.startTick + gesture.note.durationTicks + deltaTicks,
			gesture.note.startTick + minimumDuration,
			metrics.totalTicks
		)
		return { ...gesture.note, durationTicks: endTick - gesture.note.startTick }
	}

	const rowDelta = Math.round((clientY - gesture.originClientY) / pianoRowHeight)
	const originRow = metrics.pitchValues.indexOf(gesture.note.pitch)
	const nextRow = clamp(originRow + rowDelta, 0, metrics.pitchValues.length - 1)
	const maximumStart = Math.max(0, metrics.totalTicks - gesture.note.durationTicks)
	return {
		...gesture.note,
		startTick: clamp(gesture.note.startTick + deltaTicks, 0, maximumStart),
		pitch: metrics.pitchValues[nextRow] ?? gesture.note.pitch
	}
}

export function pitchModelsToValues(pitches: readonly PianoPitchViewModel[]): readonly number[] {
	return pitches.map(({ pitch }) => pitch)
}
