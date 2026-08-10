import { useCallback } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { layerId, type ProjectRole } from '../../../../project-core/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type { LayerRoleViewModel } from './view-model.js'

const roleMap: Readonly<Record<LayerRoleViewModel['id'], ProjectRole>> = Object.freeze({
	melody: 'melody',
	chords: 'harmony',
	bass: 'bass',
	drums: 'rhythm'
})

export function useFirstLayerActions(): {
	readonly chooseLayer: (choice: LayerRoleViewModel['id']) => void
} {
	const { t } = useLocalization()
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const chooseLayer = useCallback(
		(choice: LayerRoleViewModel['id']): void => {
			const snapshot = projectSession.getSnapshot()
			const id = layerId(projectSession.nextId('layer.ui'))
			projectSession.dispatch({
				type: 'layer.add',
				baseRevision: snapshot.revision,
				id,
				name: t(`firstLayer.${choice}`),
				role: roleMap[choice]
			})
			projectSession.selectLayer(id)
			execute(commandForView(choice === 'drums' ? 'drums' : 'sound-chooser'))
		},
		[execute, projectSession, t]
	)
	return { chooseLayer }
}
