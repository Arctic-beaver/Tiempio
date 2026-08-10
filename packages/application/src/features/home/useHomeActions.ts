import { useCallback } from 'react'
import { useLocalization } from '../../../../localization/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useHomeActions(): { readonly createProject: () => void } {
	const { t } = useLocalization()
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const createProject = useCallback((): void => {
		projectSession.createNewProject(t('home.untitledProject'))
		execute(commandForView('first-layer'))
	}, [execute, projectSession, t])
	return { createProject }
}
