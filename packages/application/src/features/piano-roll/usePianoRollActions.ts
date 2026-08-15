import { useCallback } from 'react'
import {
	createSongInstance,
	createMidiNote,
	noteId,
	songInstanceId
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { EditableNoteValues } from './note-editor-geometry.js'

export interface PianoNoteUpdateOptions {
	readonly expectedRevision?: number
	readonly historyGroup?: string
}

export function usePianoRollActions(): {
	readonly addNote: (note: EditableNoteValues) => string | null
	readonly deleteNote: (id: string) => void
	readonly endHistoryGroup: (historyGroup: string) => void
	readonly updateNote: (
		id: string,
		note: EditableNoteValues,
		options?: PianoNoteUpdateOptions
	) => void
} {
	const projectSession = useProjectSession()
	const { pianoRoll } = projectSession.projections
	const addNote = useCallback(
		(note: EditableNoteValues): string | null => {
			const layer = pianoRoll.layerId
			if (layer === null) return null
			const snapshot = projectSession.getSnapshot()
			const createdNoteId = projectSession.nextId('note.ui')
			const hasInstance = snapshot.project.song.instances.some(
				(instance) => instance.sourceLayerId === layer
			)
			projectSession.dispatch({
				type: 'note.add',
				baseRevision: snapshot.revision,
				layerId: layer,
				...(!hasInstance
					? {
							instanceWhenMissing: createSongInstance({
								id: songInstanceId(projectSession.nextId('instance.material.ui')),
								sourceLayerId: layer,
								startTick: 0,
								durationTicks: Math.max(
									pianoRoll.totalTicks,
									note.startTick + note.durationTicks
								)
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
			const { layerId: layer } = pianoRoll
			if (layer === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'note.delete',
				baseRevision: snapshot.revision,
				layerId: layer,
				noteId: noteId(id)
			})
		},
		[pianoRoll, projectSession]
	)
	const updateNote = useCallback(
		(id: string, note: EditableNoteValues, options: PianoNoteUpdateOptions = {}): void => {
			const { layerId: layer } = pianoRoll
			if (layer === null) return
			const snapshot = projectSession.getSnapshot()
			if (
				options.expectedRevision !== undefined &&
				options.expectedRevision !== snapshot.revision
			) {
				return
			}
			projectSession.dispatch(
				{
					type: 'note.update',
					baseRevision: snapshot.revision,
					layerId: layer,
					noteId: noteId(id),
					pitch: note.pitch,
					startTick: note.startTick,
					durationTicks: note.durationTicks,
					velocity: note.velocity
				},
				options.historyGroup === undefined ? {} : { historyGroup: options.historyGroup }
			)
		},
		[pianoRoll, projectSession]
	)
	return {
		addNote,
		deleteNote,
		endHistoryGroup: projectSession.endHistoryGroup,
		updateNote
	}
}
