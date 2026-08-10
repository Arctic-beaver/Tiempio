import { useCallback } from 'react'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { SculptDimensionViewModel } from './view-model.js'

export function useSoundSculptActions(): {
	readonly commitMacro: (dimension: SculptDimensionViewModel['id'], value: number) => void
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
	return { commitMacro }
}
