import { useCallback } from 'react'
import {
	clipId,
	createMidiClip,
	createMidiNote,
	defaultTicksPerQuarter,
	noteId
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function usePianoRollActions(): {
	readonly addNote: () => void
	readonly deleteNote: (id: string) => void
} {
	const projectSession = useProjectSession()
	const { pianoRoll } = projectSession.projections
	const addNote = useCallback((): void => {
		const layer = pianoRoll.layerId
		if (layer === null) return
		let snapshot = projectSession.getSnapshot()
		let targetClipId = pianoRoll.clipId
		if (targetClipId === null) {
			targetClipId = clipId(projectSession.nextId('clip.midi.ui'))
			snapshot = projectSession.dispatch({
				type: 'clip.place',
				baseRevision: snapshot.revision,
				layerId: layer,
				clip: createMidiClip({
					id: targetClipId,
					startTick: 0,
					lengthTicks: defaultTicksPerQuarter * 16
				})
			})
		}
		const layerState = snapshot.project.layers.find((candidate) => candidate.id === layer)
		const pitch = layerState?.role === 'bass' ? 48 : 72
		projectSession.dispatch({
			type: 'note.add',
			baseRevision: snapshot.revision,
			layerId: layer,
			clipId: targetClipId,
			note: createMidiNote({
				id: projectSession.nextId('note.ui'),
				pitch,
				startTick: ((pianoRoll.notes.length * 2) % 15) * (defaultTicksPerQuarter / 2),
				durationTicks: defaultTicksPerQuarter / 2
			})
		})
	}, [pianoRoll, projectSession])
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
	return { addNote, deleteNote }
}
