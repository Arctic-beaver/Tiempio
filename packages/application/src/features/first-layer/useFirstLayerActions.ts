import { useCallback } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import {
	clipId,
	createDrumClip,
	defaultTicksPerQuarter,
	layerId,
	type ProjectRole
} from '../../../../project-core/src/index.js'
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
			let snapshot = projectSession.getSnapshot()
			const id = layerId(projectSession.nextId('layer.ui'))
			const historyGroup = `layer.create.${id}`
			snapshot = projectSession.dispatch(
				{
					type: 'layer.add',
					baseRevision: snapshot.revision,
					id,
					name: t(`firstLayer.${choice}`),
					role: roleMap[choice]
				},
				{ historyGroup }
			)
			if (choice === 'drums') {
				const drumClipId = clipId(projectSession.nextId('clip.drums.ui'))
				snapshot = projectSession.dispatch(
					{
						type: 'clip.place',
						baseRevision: snapshot.revision,
						layerId: id,
						clip: createDrumClip({
							id: drumClipId,
							startTick: 0,
							lengthTicks: defaultTicksPerQuarter * 4
						})
					},
					{ historyGroup }
				)
				projectSession.dispatch(
					{
						type: 'drum.pattern.set',
						baseRevision: snapshot.revision,
						layerId: id,
						clipId: drumClipId,
						character: 'straight'
					},
					{ historyGroup }
				)
			}
			projectSession.endHistoryGroup(historyGroup)
			projectSession.selectLayer(id)
			execute(commandForView(choice === 'drums' ? 'drums' : 'sound-chooser'))
		},
		[execute, projectSession, t]
	)
	return { chooseLayer }
}
