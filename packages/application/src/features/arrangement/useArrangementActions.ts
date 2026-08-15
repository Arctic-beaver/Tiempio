import { useCallback } from 'react'
import { createSongInstance, songInstanceId } from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useArrangementActions(): {
	readonly toggleCell: (layerId: string, sectionId: string, active: boolean) => void
} {
	const projectSession = useProjectSession()
	const toggleCell = useCallback(
		(layerValue: string, sectionValue: string, active: boolean): void => {
			const snapshot = projectSession.getSnapshot()
			const layer = snapshot.project.layers.find((candidate) => candidate.id === layerValue)
			const section = snapshot.project.sections.find(
				(candidate) => candidate.id === sectionValue
			)
			if (layer === undefined || section === undefined) return
			const existing = snapshot.project.song.instances.find(
				(instance) =>
					instance.sourceLayerId === layer.id &&
					instance.startTick === section.startTick &&
					instance.durationTicks === section.lengthTicks
			)
			if (active && existing !== undefined) {
				projectSession.dispatch({
					type: 'song-instance.delete',
					baseRevision: snapshot.revision,
					instanceId: existing.id
				})
				return
			}
			if (active) return
			const id = songInstanceId(projectSession.nextId('instance.arrangement.ui'))
			projectSession.dispatch({
				type: 'song-instance.place',
				baseRevision: snapshot.revision,
				instance: createSongInstance({
					id,
					sourceLayerId: layer.id,
					startTick: section.startTick,
					durationTicks: section.lengthTicks
				})
			})
		},
		[projectSession]
	)
	return { toggleCell }
}
