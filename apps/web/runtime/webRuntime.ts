import {
	applicationError,
	type ApplicationError,
	createUnavailableRuntime,
	type ApplicationResult,
	type ApplicationRuntime,
	type EngineRuntime,
	type PersistenceOutcome,
	type ProjectHandle,
	type ProjectLoadEnvelope,
	type ProjectSnapshotEnvelope,
	type ProjectsRuntime,
	type RecoveryCandidate,
	type RecoveryHandle,
	type SettingsRuntime,
	type SettingsSnapshot
} from '../../../packages/contracts/src/index.js'
import { DeferredWebEngineRuntime } from './audio/DeferredWebEngineRuntime.js'
import {
	BrowserProjectFilePort,
	type WebProjectOpenSelection,
	type WebProjectPickerPort,
	type WebProjectSaveSelection
} from './persistence/browserProjectFiles.js'

type PreparedProjectsRuntime = ProjectsRuntime & {
	openSelection(
		selection: Promise<WebProjectOpenSelection | null>
	): Promise<ApplicationResult<ProjectHandle>>
	persistAsSelection(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope,
		selection: Promise<WebProjectSaveSelection>
	): Promise<PersistenceOutcome>
}

export interface WebPersistenceRuntime {
	readonly projects: PreparedProjectsRuntime
	readonly settings: SettingsRuntime
}

export interface WebRuntimeDependencies {
	readonly engine?: EngineRuntime
	readonly files?: WebProjectPickerPort
	readonly loadPersistence?: (files: WebProjectPickerPort) => Promise<WebPersistenceRuntime>
}

function persistenceError(): ApplicationError {
	return applicationError('STORAGE_UNAVAILABLE', 'Web storage could not load.', {
		retryable: true
	})
}

function failedPersistence(revision: number): PersistenceOutcome {
	return Object.freeze({ status: 'failed' as const, revision, error: persistenceError() })
}

function createDeferredPersistence(
	files: WebProjectPickerPort,
	loadRuntime: () => Promise<WebPersistenceRuntime>
): Readonly<{ readonly projects: ProjectsRuntime; readonly settings: SettingsRuntime }> {
	const unavailable = <Value>(): ApplicationResult<Value> =>
		Object.freeze({ ok: false as const, error: persistenceError() })
	const capture = <Value>(operation: () => Promise<Value>): Promise<Value> => {
		let pending: Promise<Value>
		try {
			pending = operation()
		} catch (error) {
			pending = Promise.reject(error)
		}
		void pending.catch(() => undefined)
		return pending
	}
	const invokeProject = async <Value>(
		method: keyof ProjectsRuntime,
		arguments_: readonly unknown[],
		failure: Value
	): Promise<Value> => {
		try {
			const api = (await loadRuntime()).projects
			return (await Reflect.apply(api[method], api, arguments_)) as Value
		} catch {
			return failure
		}
	}
	const invokeSetting = async <Value>(
		method: keyof SettingsRuntime,
		arguments_: readonly unknown[],
		failure: Value
	): Promise<Value> => {
		try {
			const api = (await loadRuntime()).settings
			return (await Reflect.apply(api[method], api, arguments_)) as Value
		} catch {
			return failure
		}
	}
	const projects = Object.freeze<ProjectsRuntime>({
		create: () => invokeProject('create', [], unavailable()),
		open: () => {
			const selection = capture(() => files.open())
			return loadRuntime()
				.then((runtime) => runtime.projects.openSelection(selection))
				.catch(() => unavailable())
		},
		load: (handle: ProjectHandle): Promise<ApplicationResult<ProjectLoadEnvelope>> =>
			invokeProject('load', [handle], unavailable()),
		persist: (handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			invokeProject('persist', [handle, snapshot], failedPersistence(snapshot.revision)),
		persistAs: (handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) => {
			const selection = capture(() => files.save('project.tiempio'))
			return loadRuntime()
				.then((runtime) => runtime.projects.persistAsSelection(handle, snapshot, selection))
				.catch(() => failedPersistence(snapshot.revision))
		},
		saveCopy: (handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			invokeProject('saveCopy', [handle, snapshot], failedPersistence(snapshot.revision)),
		writeRecovery: (handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			invokeProject('writeRecovery', [handle, snapshot], unavailable()),
		listRecoveries: (): Promise<ApplicationResult<readonly RecoveryCandidate[]>> =>
			invokeProject('listRecoveries', [], unavailable()),
		restoreRecovery: (handle: RecoveryHandle) =>
			invokeProject('restoreRecovery', [handle], unavailable()),
		discardRecovery: (handle: RecoveryHandle, throughRevision: number) =>
			invokeProject('discardRecovery', [handle, throughRevision], unavailable())
	})
	const settings = Object.freeze<SettingsRuntime>({
		get: () => invokeSetting('get', [], unavailable()),
		set: (snapshot: SettingsSnapshot) => invokeSetting('set', [snapshot], unavailable())
	})
	return Object.freeze({ projects, settings })
}

export function createWebRuntime(dependencies: WebRuntimeDependencies = {}): ApplicationRuntime {
	const files = dependencies.files ?? new BrowserProjectFilePort()
	const loadPersistence =
		dependencies.loadPersistence ??
		(async (filePort: WebProjectPickerPort): Promise<WebPersistenceRuntime> => {
			const { createWebPersistenceRuntime } =
				await import('./persistence/WebProjectsRuntime.js')
			return createWebPersistenceRuntime(filePort)
		})
	let persistence: Promise<WebPersistenceRuntime> | null = null
	const deferred = createDeferredPersistence(files, () => {
		persistence ??= Promise.resolve().then(() => loadPersistence(files))
		return persistence
	})
	const unavailable = createUnavailableRuntime('web')
	return Object.freeze({
		...unavailable,
		projects: Object.freeze({ availability: 'available' as const, api: deferred.projects }),
		engine: Object.freeze({
			availability: 'available' as const,
			api: dependencies.engine ?? new DeferredWebEngineRuntime()
		}),
		settings: Object.freeze({ availability: 'available' as const, api: deferred.settings })
	})
}
