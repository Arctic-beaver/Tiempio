import type { EditableNoteValues } from './note-editor-geometry.js'
import {
	commandForShortcut,
	type CommandId,
	type CommandShortcutOverrides
} from '../../commands/command-registry.js'

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

export function editNoteFromCommand(
	note: EditableNoteValues,
	commandId: CommandId,
	metrics: NoteKeyboardMetrics
): NoteKeyboardEdit | null {
	if (commandId === 'note.delete') return { kind: 'delete' }

	const horizontalCommands: Partial<
		Record<CommandId, readonly [number, keyof NoteKeyboardMetrics]>
	> = {
		'note.move-left': [-1, 'gridTicks'],
		'note.move-right': [1, 'gridTicks'],
		'note.move-fine-left': [-1, 'gridTicks'],
		'note.move-fine-right': [1, 'gridTicks'],
		'note.move-beat-left': [-1, 'ticksPerBeat'],
		'note.move-beat-right': [1, 'ticksPerBeat'],
		'note.move-bar-left': [-1, 'ticksPerBar'],
		'note.move-bar-right': [1, 'ticksPerBar']
	}
	const horizontal = horizontalCommands[commandId]
	if (horizontal !== undefined) {
		const [direction, metric] = horizontal
		const baseStep = metrics[metric]
		const step = commandId.includes('fine') ? Math.max(1, baseStep / 4) : baseStep
		const startTick = clamp(
			note.startTick + direction * step,
			0,
			Math.max(0, metrics.totalTicks - note.durationTicks)
		)
		return { kind: 'update', values: { ...note, startTick } }
	}

	if (
		['note.move-up', 'note.move-down', 'note.move-octave-up', 'note.move-octave-down'].includes(
			commandId
		)
	) {
		const direction = commandId.endsWith('up') ? 1 : -1
		const semitones = commandId.includes('octave') ? 12 : 1
		return {
			kind: 'update',
			values: { ...note, pitch: clamp(note.pitch + direction * semitones, 0, 127) }
		}
	}

	if (commandId.startsWith('note.duration-')) {
		const fineStep = Math.max(1, metrics.gridTicks / 4)
		const step = commandId.includes('fine') ? fineStep : metrics.gridTicks
		const direction = commandId.endsWith('shorter') ? -1 : 1
		const durationTicks = clamp(
			note.durationTicks + direction * step,
			fineStep,
			metrics.totalTicks - note.startTick
		)
		return { kind: 'update', values: { ...note, durationTicks } }
	}

	if (commandId === 'note.strength-decrease' || commandId === 'note.strength-increase') {
		const direction = commandId === 'note.strength-decrease' ? -1 : 1
		return {
			kind: 'update',
			values: { ...note, velocity: clamp(note.velocity + direction * 8, 1, 127) }
		}
	}

	return null
}

export function editNoteFromKeyboard(
	note: EditableNoteValues,
	event: NoteKeyboardEvent,
	metrics: NoteKeyboardMetrics,
	overrides: CommandShortcutOverrides = {}
): NoteKeyboardEdit | null {
	const platform = event.metaKey && !event.ctrlKey ? 'macos' : 'other'
	const commandId = commandForShortcut(event, platform, ['piano-roll'], overrides)
	return commandId === null ? null : editNoteFromCommand(note, commandId, metrics)
}
