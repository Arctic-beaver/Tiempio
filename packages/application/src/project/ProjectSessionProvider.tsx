import {
	useCallback,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type JSX,
	type ReactNode
} from 'react'
import {
	createProjectFromCommand,
	layerId,
	ProjectSession,
	type LayerId,
	type ProjectCommand,
	type ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import { createSeedProject } from './seed-project.js'
import { ProjectSessionContext, type ProjectSessionContextValue } from './ProjectSessionContext.js'
import { projectStudio } from './projectors.js'

export interface ProjectSessionProviderProperties {
	readonly children: ReactNode
	readonly initialSession?: ProjectSession
}

export function ProjectSessionProvider({
	children,
	initialSession
}: ProjectSessionProviderProperties): JSX.Element {
	const [session, setSession] = useState(
		() => initialSession ?? new ProjectSession(createSeedProject())
	)
	const [selectedLayerId, setSelectedLayerId] = useState<LayerId | null>(() =>
		initialSession === undefined ? layerId('layer.melody') : null
	)
	const idCounter = useRef(0)
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
		session.getSnapshot
	)
	const dispatch = useCallback(
		(command: ProjectCommand): ProjectSessionSnapshot => session.dispatch(command),
		[session]
	)
	const createNewProject = useCallback((title: string): void => {
		idCounter.current += 1
		const project = createProjectFromCommand({
			type: 'project.create',
			projectId: `project.ui:${String(idCounter.current)}`,
			title
		})
		setSelectedLayerId(null)
		setSession(new ProjectSession(project))
	}, [])
	const nextId = useCallback((scope: string): string => {
		idCounter.current += 1
		return `${scope}:${String(idCounter.current)}`
	}, [])
	const projections = useMemo(
		() => projectStudio(snapshot, selectedLayerId),
		[snapshot, selectedLayerId]
	)
	const value = useMemo<ProjectSessionContextValue>(
		() => ({
			snapshot,
			selectedLayerId,
			projections,
			dispatch,
			getSnapshot: session.getSnapshot,
			selectLayer: setSelectedLayerId,
			createNewProject,
			nextId
		}),
		[
			createNewProject,
			dispatch,
			nextId,
			projections,
			selectedLayerId,
			session.getSnapshot,
			snapshot
		]
	)

	return <ProjectSessionContext.Provider value={value}>{children}</ProjectSessionContext.Provider>
}
