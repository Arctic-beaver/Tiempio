import { useCallback } from 'react'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useSoundChooserActions(): {
	readonly chooseSound: () => void
	readonly returnToLayerChoice: () => void
} {
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const chooseSound = useCallback((): void => {
		const snapshot = projectSession.getSnapshot()
		const selected = projectSession.selectedLayerId
		if (selected !== null) {
			projectSession.dispatch({
				type: 'layer.character.select',
				baseRevision: snapshot.revision,
				layerId: selected,
				presetId: 'bass.deep'
			})
		}
		execute(commandForView('song-palette'))
	}, [execute, projectSession])
	const returnToLayerChoice = useCallback((): void => {
		execute(commandForView('first-layer'))
	}, [execute])
	return { chooseSound, returnToLayerChoice }
}
