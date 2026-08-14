import {
	useCallback,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type JSX,
	type ReactNode
} from 'react'
import type { ProjectHandle } from '../../../contracts/src/index.js'
import {
	createProjectFromCommand,
	layerId,
	ProjectSession,
	type LayerId,
	type ProjectCommand,
	type ProjectDocument,
	type ProjectDispatchOptions,
	type ProjectSessionSnapshot,
	type PreparedProjectTransaction
} from '../../../project-core/src/index.js'
import { createSeedProject } from './seed-project.js'
import { ProjectSessionContext, type ProjectSessionContextValue } from './ProjectSessionContext.js'
import { projectStudio } from './projectors.js'

export interface ProjectSessionProviderProperties {
	readonly children: ReactNode
	readonly initialSession?: ProjectSession
	readonly onSessionChange?: (session: ProjectSession, handle: ProjectHandle | null) => void
}

export function ProjectSessionProvider({
	children,
	initialSession,
	onSessionChange
}: ProjectSessionProviderProperties): JSX.Element {
	const [session, setSession] = useState(
		() => initialSession ?? new ProjectSession(createSeedProject())
	)
	const [selectedLayerId, setSelectedLayerId] = useState<LayerId | null>(() =>
		layerId('layer.melody')
	)
	const idCounter = useRef(0)
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.getSnapshot,
		session.getSnapshot
	)
	const dispatch = useCallback(
		(command: ProjectCommand, options?: ProjectDispatchOptions): ProjectSessionSnapshot =>
			session.dispatch(command, options),
		[session]
	)
	const endHistoryGroup = useCallback(
		(historyGroup: string): void => session.endHistoryGroup(historyGroup),
		[session]
	)
	const prepareTransaction = useCallback(
		(commands: readonly ProjectCommand[]): PreparedProjectTransaction =>
			session.prepareTransaction(commands),
		[session]
	)
	const commitTransaction = useCallback(
		(prepared: PreparedProjectTransaction): ProjectSessionSnapshot =>
			session.commitTransaction(prepared),
		[session]
	)
	const discardTransaction = useCallback(
		(prepared: PreparedProjectTransaction): boolean => session.discardTransaction(prepared),
		[session]
	)
	const undo = useCallback(
		(): ProjectSessionSnapshot => session.undo(session.getSnapshot().revision),
		[session]
	)
	const redo = useCallback(
		(): ProjectSessionSnapshot => session.redo(session.getSnapshot().revision),
		[session]
	)
	const createNewProject = useCallback(
		(title: string): void => {
			idCounter.current += 1
			const project = createProjectFromCommand({
				type: 'project.create',
				projectId: `project.ui:${String(idCounter.current)}`,
				title
			})
			const nextSession = new ProjectSession(project)
			setSelectedLayerId(null)
			setSession(nextSession)
			onSessionChange?.(nextSession, null)
		},
		[onSessionChange]
	)
	const replaceProject = useCallback(
		(project: ProjectDocument, handle: ProjectHandle): void => {
			const nextSession = new ProjectSession(project)
			setSelectedLayerId(null)
			setSession(nextSession)
			onSessionChange?.(nextSession, handle)
		},
		[onSessionChange]
	)
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
			endHistoryGroup,
			undo,
			redo,
			getSnapshot: session.getSnapshot,
			prepareTransaction,
			commitTransaction,
			discardTransaction,
			selectLayer: setSelectedLayerId,
			createNewProject,
			replaceProject,
			nextId
		}),
		[
			createNewProject,
			commitTransaction,
			discardTransaction,
			dispatch,
			endHistoryGroup,
			nextId,
			prepareTransaction,
			projections,
			redo,
			replaceProject,
			selectedLayerId,
			session.getSnapshot,
			snapshot,
			undo
		]
	)

	return <ProjectSessionContext.Provider value={value}>{children}</ProjectSessionContext.Provider>
}
