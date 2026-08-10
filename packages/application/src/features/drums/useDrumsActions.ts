import { useCallback } from 'react'
import {
	clipId,
	createDrumClip,
	createDrumEvent,
	defaultTicksPerQuarter,
	type DrumInstrument
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useDrumsActions(): {
	readonly toggleStep: (instrument: DrumInstrument, step: number) => void
} {
	const projectSession = useProjectSession()
	const { drums } = projectSession.projections
	const toggleStep = useCallback(
		(instrument: DrumInstrument, step: number): void => {
			const layer = drums.layerId
			if (layer === null) return
			let snapshot = projectSession.getSnapshot()
			let targetClipId = drums.clipId
			if (targetClipId === null) {
				targetClipId = clipId(projectSession.nextId('clip.drums.ui'))
				snapshot = projectSession.dispatch({
					type: 'clip.place',
					baseRevision: snapshot.revision,
					layerId: layer,
					clip: createDrumClip({
						id: targetClipId,
						startTick: 0,
						lengthTicks: defaultTicksPerQuarter * 4
					})
				})
			}
			projectSession.dispatch({
				type: 'drum-event.toggle',
				baseRevision: snapshot.revision,
				layerId: layer,
				clipId: targetClipId,
				eventWhenAdded: createDrumEvent({
					id: projectSession.nextId('event.drums.ui'),
					instrument,
					step
				})
			})
		},
		[drums, projectSession]
	)
	return { toggleStep }
}
