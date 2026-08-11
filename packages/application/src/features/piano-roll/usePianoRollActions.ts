import { useCallback } from 'react'
import {
	clipId,
	createMidiClip,
	createMidiNote,
	noteId
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { EditableNoteValues } from './note-editor-geometry.js'

export function usePianoRollActions(): {
	readonly addNote: (note: EditableNoteValues) => string | null
	readonly deleteNote: (id: string) => void
	readonly updateNote: (id: string, note: EditableNoteValues) => void
} {
	const projectSession = useProjectSession()
	const { pianoRoll } = projectSession.projections
	const addNote = useCallback(
		(note: EditableNoteValues): string | null => {
			const layer = pianoRoll.layerId
			if (layer === null) return null
			const snapshot = projectSession.getSnapshot()
			const targetClipId = pianoRoll.clipId ?? clipId(projectSession.nextId('clip.midi.ui'))
			const createdNoteId = projectSession.nextId('note.ui')
			projectSession.dispatch({
				type: 'note.add',
				baseRevision: snapshot.revision,
				layerId: layer,
				clipId: targetClipId,
				...(pianoRoll.clipId === null
					? {
							clipWhenMissing: createMidiClip({
								id: targetClipId,
								startTick: 0,
								lengthTicks: pianoRoll.totalTicks
							})
						}
					: {}),
				note: createMidiNote({
					id: createdNoteId,
					pitch: note.pitch,
					startTick: note.startTick,
					durationTicks: note.durationTicks,
					velocity: note.velocity
				})
			})
			return createdNoteId
		},
		[pianoRoll, projectSession]
	)
	const deleteNote = useCallback(
		(id: string): void => {
			const { layerId: layer, clipId: clip } = pianoRoll
			if (layer === null || clip === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'note.delete',
				baseRevision: snapshot.revision,
				layerId: layer,
				clipId: clip,
				noteId: noteId(id)
			})
		},
		[pianoRoll, projectSession]
	)
	const updateNote = useCallback(
		(id: string, note: EditableNoteValues): void => {
			const { layerId: layer, clipId: clip } = pianoRoll
			if (layer === null || clip === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'note.update',
				baseRevision: snapshot.revision,
				layerId: layer,
				clipId: clip,
				noteId: noteId(id),
				pitch: note.pitch,
				startTick: note.startTick,
				durationTicks: note.durationTicks,
				velocity: note.velocity
			})
		},
		[pianoRoll, projectSession]
	)
	return { addNote, deleteNote, updateNote }
}
