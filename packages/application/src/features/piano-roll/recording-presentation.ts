import type {
	PerformanceRecordingSnapshot,
	RecordingLiveNote
} from '../../performance/performance-recording-coordinator.js'
import type { PianoNoteViewModel } from './view-model.js'

export interface SourceRecordingShortcutEvent {
	readonly altKey: boolean
	readonly code: string
	readonly ctrlKey: boolean
	readonly isComposing: boolean
	readonly metaKey: boolean
	readonly repeat: boolean
	readonly shiftKey: boolean
}

export type SourceRecordingShortcut = 'start' | 'stop'

export function sourceRecordingShortcut(
	event: SourceRecordingShortcutEvent,
	recordingActive: boolean
): SourceRecordingShortcut | null {
	if (
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.isComposing ||
		event.repeat
	) {
		return null
	}
	if (recordingActive && (event.code === 'Escape' || event.code === 'Space')) return 'stop'
	if (event.code === 'KeyR') return recordingActive ? 'stop' : 'start'
	return null
}

export function recordingLocation(
	cursorTick: number | null,
	ticksPerBeat: number,
	beatsPerBar: number
): { readonly bar: number; readonly beat: number } | null {
	if (cursorTick === null || ticksPerBeat <= 0 || beatsPerBar <= 0) return null
	const beatIndex = Math.floor(cursorTick / ticksPerBeat)
	return Object.freeze({
		bar: Math.floor(beatIndex / beatsPerBar) + 1,
		beat: (beatIndex % beatsPerBar) + 1
	})
}

export function recordingNote(
	note: PianoNoteViewModel,
	liveNote: RecordingLiveNote | undefined,
	cursorTick: number | null
): PianoNoteViewModel {
	if (liveNote === undefined) return note
	const endTick = liveNote.endTick ?? Math.max(liveNote.startTick + 1, cursorTick ?? 0)
	return {
		...note,
		durationTicks: Math.max(1, endTick - liveNote.startTick),
		startTick: liveNote.startTick,
		velocity: liveNote.velocity
	}
}

export function recordingNoteState(
	noteId: string,
	snapshot: PerformanceRecordingSnapshot,
	showLastPass: boolean
): 'live' | 'last-pass' | null {
	if (!snapshot.liveNotes.some((note) => note.noteId === noteId)) return null
	if (['starting', 'count-in', 'recording', 'stopping'].includes(snapshot.phase)) return 'live'
	return showLastPass && snapshot.lastPass !== null ? 'last-pass' : null
}
