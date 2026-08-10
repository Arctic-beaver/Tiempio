import { useCallback } from 'react'
import {
	clipId,
	createDrumClip,
	createMidiClip,
	sectionId
} from '../../../../project-core/src/index.js'
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
			const existing = layer.clips.find((clip) => clip.sectionId === section.id)
			if (active && existing !== undefined) {
				projectSession.dispatch({
					type: 'clip.delete',
					baseRevision: snapshot.revision,
					layerId: layer.id,
					clipId: existing.id
				})
				return
			}
			if (active) return
			const id = clipId(projectSession.nextId('clip.arrangement.ui'))
			projectSession.dispatch({
				type: 'clip.place',
				baseRevision: snapshot.revision,
				layerId: layer.id,
				clip:
					layer.source.type === 'drum'
						? createDrumClip({
								id,
								startTick: section.startTick,
								lengthTicks: section.lengthTicks,
								sectionId: sectionId(sectionValue)
							})
						: createMidiClip({
								id,
								startTick: section.startTick,
								lengthTicks: section.lengthTicks,
								sectionId: sectionId(sectionValue)
							})
			})
		},
		[projectSession]
	)
	return { toggleCell }
}
