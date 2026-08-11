import { useCallback } from 'react'
import type { SynthPresetId } from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { SculptDimensionViewModel } from './view-model.js'

export function useSoundSculptActions(): {
	readonly commitMacro: (dimension: SculptDimensionViewModel['id'], value: number) => void
	readonly selectCharacter: (presetId: SynthPresetId) => void
} {
	const projectSession = useProjectSession()
	const { sculpt } = projectSession.projections
	const commitMacro = useCallback(
		(dimension: SculptDimensionViewModel['id'], value: number): void => {
			const layer = sculpt.layerId
			if (layer === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'layer.macro.commit',
				baseRevision: snapshot.revision,
				layerId: layer,
				macro: sculpt.macroByDimension[dimension],
				value: value / 100
			})
		},
		[projectSession, sculpt]
	)
	const selectCharacter = useCallback(
		(presetId: SynthPresetId): void => {
			const layer = sculpt.layerId
			if (layer === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'layer.character.select',
				baseRevision: snapshot.revision,
				layerId: layer,
				presetId
			})
		},
		[projectSession, sculpt.layerId]
	)
	return { commitMacro, selectCharacter }
}
