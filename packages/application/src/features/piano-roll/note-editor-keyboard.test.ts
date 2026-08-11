import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EditableNoteValues } from './note-editor-geometry.js'
import { editNoteFromKeyboard, type NoteKeyboardEvent } from './note-editor-keyboard.js'

const note = { startTick: 960, durationTicks: 960, pitch: 60, velocity: 80 }
const metrics = { gridTicks: 240, ticksPerBeat: 960, ticksPerBar: 3840, totalTicks: 15_360 }
const key = (code: string, overrides: Partial<NoteKeyboardEvent> = {}): NoteKeyboardEvent => ({
	code,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	...overrides
})

function updatedValues(event: NoteKeyboardEvent, source = note): EditableNoteValues {
	const edit = editNoteFromKeyboard(source, event, metrics)
	assert.equal(edit?.kind, 'update')
	if (edit?.kind !== 'update') throw new Error('Expected an update edit.')
	return edit.values
}

describe('piano-roll keyboard editing', () => {
	it('uses physical arrows for grid, fine, beat, bar, semitone and octave movement', () => {
		assert.equal(updatedValues(key('ArrowRight')).startTick, 1200)
		assert.equal(updatedValues(key('ArrowRight', { altKey: true })).startTick, 1020)
		assert.equal(updatedValues(key('ArrowRight', { shiftKey: true })).startTick, 1920)
		assert.equal(updatedValues(key('ArrowRight', { ctrlKey: true })).startTick, 4800)
		assert.equal(updatedValues(key('ArrowUp')).pitch, 61)
		assert.equal(updatedValues(key('ArrowDown', { shiftKey: true })).pitch, 48)
	})

	it('bounds duration, strength, pitch and clip movement', () => {
		assert.equal(
			updatedValues(key('ArrowRight', { ctrlKey: true }), {
				...note,
				startTick: 14_400
			}).startTick,
			14_400
		)
		assert.equal(updatedValues(key('ArrowUp'), { ...note, pitch: 127 }).pitch, 127)
		assert.equal(updatedValues(key('Minus'), { ...note, velocity: 4 }).velocity, 1)
		assert.equal(updatedValues(key('BracketLeft', { altKey: true })).durationTicks, 900)
	})

	it('provides delete and backspace without capturing unrelated physical keys', () => {
		assert.deepEqual(editNoteFromKeyboard(note, key('Delete'), metrics), { kind: 'delete' })
		assert.deepEqual(editNoteFromKeyboard(note, key('Backspace'), metrics), { kind: 'delete' })
		assert.equal(editNoteFromKeyboard(note, key('KeyL'), metrics), null)
	})
})
