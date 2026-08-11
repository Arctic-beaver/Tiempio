import { useCallback } from 'react'
import type { LayerPerformanceMapping } from '../../../../project-core/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useSoundChooserActions(): {
	readonly chooseSound: (performance: LayerPerformanceMapping) => void
	readonly returnToLayerChoice: () => void
} {
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const chooseSound = useCallback(
		(performance: LayerPerformanceMapping): void => {
			const snapshot = projectSession.getSnapshot()
			const selected = projectSession.selectedLayerId
			if (selected === null) return
			projectSession.dispatch({
				type: 'layer.sound.configure',
				baseRevision: snapshot.revision,
				layerId: selected,
				presetId: 'bass.deep',
				performance
			})
			execute(commandForView('piano-roll'))
		},
		[execute, projectSession]
	)
	const returnToLayerChoice = useCallback((): void => {
		execute(commandForView('first-layer'))
	}, [execute])
	return { chooseSound, returnToLayerChoice }
}
