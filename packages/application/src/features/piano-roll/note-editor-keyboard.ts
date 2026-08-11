import type { EditableNoteValues } from './note-editor-geometry.js'

export interface NoteKeyboardEvent {
	readonly altKey: boolean
	readonly code: string
	readonly ctrlKey: boolean
	readonly metaKey: boolean
	readonly shiftKey: boolean
}

export interface NoteKeyboardMetrics {
	readonly gridTicks: number
	readonly ticksPerBar: number
	readonly ticksPerBeat: number
	readonly totalTicks: number
}

export type NoteKeyboardEdit =
	{ readonly kind: 'delete' } | { readonly kind: 'update'; readonly values: EditableNoteValues }

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value))
}

function horizontalStep(event: NoteKeyboardEvent, metrics: NoteKeyboardMetrics): number {
	if (event.ctrlKey || event.metaKey) return metrics.ticksPerBar
	if (event.shiftKey) return metrics.ticksPerBeat
	if (event.altKey) return Math.max(1, metrics.gridTicks / 4)
	return metrics.gridTicks
}

export function editNoteFromKeyboard(
	note: EditableNoteValues,
	event: NoteKeyboardEvent,
	metrics: NoteKeyboardMetrics
): NoteKeyboardEdit | null {
	if (
		(event.code === 'Delete' || event.code === 'Backspace') &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.shiftKey
	) {
		return { kind: 'delete' }
	}

	if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
		const direction = event.code === 'ArrowLeft' ? -1 : 1
		const startTick = clamp(
			note.startTick + direction * horizontalStep(event, metrics),
			0,
			Math.max(0, metrics.totalTicks - note.durationTicks)
		)
		return { kind: 'update', values: { ...note, startTick } }
	}

	if (
		(event.code === 'ArrowUp' || event.code === 'ArrowDown') &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey
	) {
		const direction = event.code === 'ArrowUp' ? 1 : -1
		const semitones = event.shiftKey ? 12 : 1
		return {
			kind: 'update',
			values: { ...note, pitch: clamp(note.pitch + direction * semitones, 0, 127) }
		}
	}

	if (
		(event.code === 'BracketLeft' || event.code === 'BracketRight') &&
		!event.ctrlKey &&
		!event.metaKey
	) {
		const fineStep = Math.max(1, metrics.gridTicks / 4)
		const step = event.altKey ? fineStep : metrics.gridTicks
		const direction = event.code === 'BracketLeft' ? -1 : 1
		const durationTicks = clamp(
			note.durationTicks + direction * step,
			fineStep,
			metrics.totalTicks - note.startTick
		)
		return { kind: 'update', values: { ...note, durationTicks } }
	}

	if (
		['Minus', 'NumpadSubtract', 'Equal', 'NumpadAdd'].includes(event.code) &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey
	) {
		const direction = event.code === 'Minus' || event.code === 'NumpadSubtract' ? -1 : 1
		return {
			kind: 'update',
			values: { ...note, velocity: clamp(note.velocity + direction * 8, 1, 127) }
		}
	}

	return null
}
