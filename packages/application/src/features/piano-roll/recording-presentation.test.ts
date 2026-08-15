import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PerformanceRecordingSnapshot } from '../../performance/performance-recording-coordinator.js'
import {
	recordingLocation,
	recordingNote,
	recordingNoteState,
	sourceRecordingShortcut
} from './recording-presentation.js'
import type { SourceRecordingShortcutEvent } from './recording-presentation.js'

const shortcut = (
	code: string,
	overrides: Partial<SourceRecordingShortcutEvent> = {}
): SourceRecordingShortcutEvent => ({
	altKey: false,
	code,
	ctrlKey: false,
	isComposing: false,
	metaKey: false,
	repeat: false,
	shiftKey: false,
	...overrides
})

const snapshot = (phase: PerformanceRecordingSnapshot['phase']): PerformanceRecordingSnapshot => ({
	countInBeatsRemaining: 0,
	cursorTick: 1440,
	lastPass:
		phase === 'idle'
			? {
					endTick: 1440,
					layerId: 'layer.piano',
					noteCount: 1,
					reason: 'stopped',
					recordingId: 'recording.1',
					startTick: 960
				}
			: null,
	layerId: phase === 'idle' ? null : 'layer.piano',
	liveNotes: [
		{
			auditionId: 'audition.1',
			endTick: null,
			noteId: 'note.1',
			pitch: 60,
			startTick: 960,
			velocity: 104
		}
	],
	phase,
	recordingId: phase === 'idle' ? null : 'recording.1',
	startTick: phase === 'idle' ? null : 960
})

describe('source recording presentation', () => {
	it('keeps recording shortcuts scoped, modifier-safe and repeat-safe', () => {
		assert.equal(sourceRecordingShortcut(shortcut('KeyR'), false), 'start')
		assert.equal(sourceRecordingShortcut(shortcut('KeyR'), true), 'stop')
		assert.equal(sourceRecordingShortcut(shortcut('Escape'), true), 'stop')
		assert.equal(sourceRecordingShortcut(shortcut('Space'), true), 'stop')
		assert.equal(sourceRecordingShortcut(shortcut('Escape'), false), null)
		assert.equal(sourceRecordingShortcut(shortcut('KeyR', { ctrlKey: true }), false), null)
		assert.equal(sourceRecordingShortcut(shortcut('KeyR', { repeat: true }), false), null)
	})

	it('reports one-based bars and beats from the engine-owned source cursor', () => {
		assert.deepEqual(recordingLocation(0, 960, 4), { bar: 1, beat: 1 })
		assert.deepEqual(recordingLocation(4_800, 960, 4), { bar: 2, beat: 2 })
		assert.equal(recordingLocation(null, 960, 4), null)
	})

	it('grows acknowledged held notes and distinguishes live from last-pass notes', () => {
		const note = {
			durationTicks: 1,
			id: 'note.1',
			pitch: 'C4',
			pitchValue: 60,
			row: 67,
			startTick: 960,
			velocity: 1
		}
		assert.equal(
			recordingNote(note, snapshot('recording').liveNotes[0], 1440).durationTicks,
			480
		)
		assert.equal(recordingNoteState('note.1', snapshot('recording'), true), 'live')
		assert.equal(recordingNoteState('note.1', snapshot('idle'), true), 'last-pass')
		assert.equal(recordingNoteState('note.1', snapshot('idle'), false), null)
	})
})
