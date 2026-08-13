import { createContext, useContext } from 'react'
import type { ProjectHandle } from '../../../contracts/src/index.js'
import type {
	LayerId,
	ProjectDocument,
	ProjectCommand,
	ProjectDispatchOptions,
	ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import type { StudioProjectProjections } from './projectors.js'

export interface ProjectSessionContextValue {
	readonly createNewProject: (title: string) => void
	readonly dispatch: (
		command: ProjectCommand,
		options?: ProjectDispatchOptions
	) => ProjectSessionSnapshot
	readonly endHistoryGroup: (historyGroup: string) => void
	readonly getSnapshot: () => ProjectSessionSnapshot
	readonly nextId: (scope: string) => string
	readonly projections: StudioProjectProjections
	readonly redo: () => ProjectSessionSnapshot
	readonly replaceProject: (project: ProjectDocument, handle: ProjectHandle) => void
	readonly selectLayer: (layerId: LayerId | null) => void
	readonly selectedLayerId: LayerId | null
	readonly snapshot: ProjectSessionSnapshot
	readonly undo: () => ProjectSessionSnapshot
}

export const ProjectSessionContext = createContext<ProjectSessionContextValue | null>(null)

export function useProjectSession(): ProjectSessionContextValue {
	const context = useContext(ProjectSessionContext)
	if (context === null) {
		throw new Error('useProjectSession must be used within ProjectSessionProvider.')
	}
	return context
}
