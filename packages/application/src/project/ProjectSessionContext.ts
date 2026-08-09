import { createContext, useContext } from 'react'
import type {
	LayerId,
	ProjectCommand,
	ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import type { StudioProjectProjections } from './projectors.js'

export interface ProjectSessionContextValue {
	readonly createNewProject: (title: string) => void
	readonly dispatch: (command: ProjectCommand) => ProjectSessionSnapshot
	readonly getSnapshot: () => ProjectSessionSnapshot
	readonly nextId: (scope: string) => string
	readonly projections: StudioProjectProjections
	readonly selectLayer: (layerId: LayerId | null) => void
	readonly selectedLayerId: LayerId | null
	readonly snapshot: ProjectSessionSnapshot
}

export const ProjectSessionContext = createContext<ProjectSessionContextValue | null>(null)

export function useProjectSession(): ProjectSessionContextValue {
	const context = useContext(ProjectSessionContext)
	if (context === null) {
		throw new Error('useProjectSession must be used within ProjectSessionProvider.')
	}
	return context
}
