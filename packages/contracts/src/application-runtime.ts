import type {
	AnyEngineCommandEnvelope,
	AnyEngineEventEnvelope,
	EngineCapabilityCode
} from './engine-protocol.js'

export const applicationRuntimeVersion = 2 as const
export type ApplicationRuntimeVersion = typeof applicationRuntimeVersion
export type ApplicationTarget = 'desktop' | 'web'
export type WindowChromeStyle = 'custom' | 'native' | 'none'
export type DesktopPlatform = 'windows' | 'macos' | 'linux'

export const desktopRuntimeLimits = Object.freeze({
	maxProjectManifestBytes: 4 * 1024 * 1024,
	maxSettingsBytes: 16 * 1024,
	maxErrorMessageBytes: 2 * 1024,
	maxErrorDetailEntries: 16,
	maxOpaqueHandleBytes: 128,
	maxRecoveryCandidates: 32,
	maxRetainedEngineStderrBytes: 64 * 1024,
	maxRendererEventsPerSecond: 30
})

export const applicationErrorCodes = Object.freeze([
	'INTERNAL_ERROR',
	'INVALID_REQUEST',
	'RUNTIME_VERSION_MISMATCH',
	'ENGINE_PROTOCOL_VERSION_MISMATCH',
	'OPERATION_UNAVAILABLE',
	'PERMISSION_DENIED',
	'STORAGE_UNAVAILABLE',
	'STORAGE_QUOTA_EXCEEDED',
	'PROJECT_CHANGED',
	'PROJECT_DESTINATION_CONFLICT',
	'PROJECT_INVALID',
	'PROJECT_MISSING',
	'PROJECT_READ_ONLY',
	'PROJECT_TOO_LARGE',
	'RESOURCE_INVALID',
	'RESOURCE_TOO_LARGE',
	'ENGINE_UNAVAILABLE',
	'LIMIT_EXCEEDED',
	'OPERATION_CANCELED'
] as const)

export type ApplicationErrorCode = (typeof applicationErrorCodes)[number]
export type ApplicationErrorDetails = Readonly<Record<string, string | number | boolean | null>>

export interface ApplicationError {
	readonly code: ApplicationErrorCode
	readonly message: string
	readonly retryable: boolean
	readonly details: ApplicationErrorDetails | null
}

export type ApplicationResult<Value> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false; readonly error: ApplicationError }

export function applicationError(
	code: ApplicationErrorCode,
	message: string,
	options: {
		readonly retryable?: boolean
		readonly details?: ApplicationErrorDetails | null
	} = {}
): ApplicationError {
	return Object.freeze({
		code,
		message,
		retryable: options.retryable ?? false,
		details:
			options.details === undefined || options.details === null
				? null
				: Object.freeze({ ...options.details })
	})
}

export type CapabilityUnavailableReason =
	'not-implemented' | 'platform-unsupported' | 'permission-required' | 'temporarily-unavailable'

export type RuntimeCapability<Api> =
	| { readonly availability: 'available'; readonly api: Api }
	| {
			readonly availability: 'unavailable'
			readonly reason: CapabilityUnavailableReason
			readonly error: ApplicationError
	  }

export function unavailableCapability<Api>(
	reason: CapabilityUnavailableReason,
	message: string
): RuntimeCapability<Api> {
	return Object.freeze({
		availability: 'unavailable' as const,
		reason,
		error: applicationError('OPERATION_UNAVAILABLE', message)
	})
}

declare const projectHandleBrand: unique symbol
export type ProjectHandle = string & { readonly [projectHandleBrand]: 'ProjectHandle' }

declare const resourceHandleBrand: unique symbol
export type ResourceHandle = string & { readonly [resourceHandleBrand]: 'ResourceHandle' }

declare const recoveryHandleBrand: unique symbol
export type RecoveryHandle = string & { readonly [recoveryHandleBrand]: 'RecoveryHandle' }

export interface ProjectSnapshotEnvelope {
	readonly revision: number
	readonly bytes: Uint8Array
}

export interface ProjectLoadEnvelope {
	readonly compatibility: 'supported' | 'unsupported'
	readonly fingerprint: string | null
	readonly saveAllowed: boolean
	readonly snapshot: ProjectSnapshotEnvelope
}

export interface RecoveryCandidate {
	readonly handle: RecoveryHandle
	readonly revision: number
}

export type PersistenceOutcome =
	| {
			readonly status: 'persisted'
			readonly revision: number
			readonly fingerprint: string
	  }
	| {
			readonly status: 'download-requested'
			readonly revision: number
			readonly suggestedName: string
	  }
	| { readonly status: 'copy-written'; readonly revision: number }
	| { readonly status: 'canceled'; readonly revision: number }
	| { readonly status: 'failed'; readonly revision: number; readonly error: ApplicationError }

export function acknowledgesPersistedRevision(outcome: PersistenceOutcome): boolean {
	return outcome.status === 'persisted'
}

export interface ProjectsRuntime {
	create(): Promise<ApplicationResult<ProjectHandle>>
	open(): Promise<ApplicationResult<ProjectHandle>>
	load(handle: ProjectHandle): Promise<ApplicationResult<ProjectLoadEnvelope>>
	persist(handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope): Promise<PersistenceOutcome>
	persistAs(handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope): Promise<PersistenceOutcome>
	saveCopy(handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope): Promise<PersistenceOutcome>
	writeRecovery(
		handle: ProjectHandle,
		snapshot: ProjectSnapshotEnvelope
	): Promise<ApplicationResult<{ readonly revision: number }>>
	listRecoveries(): Promise<ApplicationResult<readonly RecoveryCandidate[]>>
	restoreRecovery(handle: RecoveryHandle): Promise<ApplicationResult<ProjectHandle>>
	discardRecovery(
		handle: RecoveryHandle,
		throughRevision: number
	): Promise<ApplicationResult<{ readonly discardedThroughRevision: number }>>
}

export interface ResourcesRuntime {
	import(): Promise<ApplicationResult<readonly ResourceHandle[]>>
	read(handle: ResourceHandle): Promise<ApplicationResult<Uint8Array>>
}

export type AudioBackendState =
	'disconnected' | 'starting' | 'ready' | 'stopped' | 'restarting' | 'failed'

export type AudioDeviceState = 'available' | 'unavailable' | 'lost'

export interface AudioHealthSnapshot {
	readonly activeDeviceId: string | null
	readonly activeVoices: number
	readonly backendState: AudioBackendState
	readonly blockFrames: number | null
	readonly deviceState: AudioDeviceState
	readonly mode: 'shared' | null
	readonly outputMuted: boolean
	readonly outputSignalObserved: boolean
	readonly projectRevision: number | null
	readonly sampleRate: number | null
	readonly underruns: number
}

export interface EngineConnection {
	readonly capabilities: readonly EngineCapabilityCode[]
	readonly protocolVersion: number
}

export interface EngineRuntime {
	connect(): Promise<ApplicationResult<EngineConnection>>
	disconnect(): Promise<ApplicationResult<null>>
	send(command: AnyEngineCommandEnvelope): Promise<ApplicationResult<{ readonly accepted: true }>>
	onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void
	getHealth(): Promise<ApplicationResult<AudioHealthSnapshot>>
	onHealth(listener: (health: AudioHealthSnapshot) => void): () => void
}

export interface ShortcutBindingSnapshot {
	readonly alt: boolean
	readonly code: string
	readonly platform: 'all' | 'macos' | 'other'
	readonly primary: boolean
	readonly shift: boolean
}

export interface ShortcutOverrideSnapshot {
	readonly bindings: readonly ShortcutBindingSnapshot[]
	readonly commandId: string
}

export interface SettingsSnapshot {
	readonly version: 3
	readonly colorScheme: 'system' | 'light' | 'dark'
	readonly metronome: {
		readonly enabled: boolean
		readonly volume: number
	}
	readonly shortcutOverrides: readonly ShortcutOverrideSnapshot[]
}

export interface SettingsRuntime {
	get(): Promise<ApplicationResult<SettingsSnapshot>>
	set(snapshot: SettingsSnapshot): Promise<ApplicationResult<SettingsSnapshot>>
}

export interface CommandsRuntime {
	execute(commandId: string, payload?: unknown): Promise<ApplicationResult<null>>
	onRequested(listener: (commandId: string) => void): () => void
}

export interface LifecycleRuntime {
	ready(): Promise<ApplicationResult<null>>
	requestClose(): Promise<ApplicationResult<'closed' | 'close-deferred'>>
	onCloseRequested(listener: () => void): () => void
}

export interface NativeWindowRuntime {
	minimize(): Promise<ApplicationResult<null>>
	toggleMaximize(): Promise<ApplicationResult<{ readonly maximized: boolean }>>
}

export interface ApplicationRuntimeHandshake {
	readonly version: number
	readonly target: ApplicationTarget
}

export interface DesktopRuntimeBridge extends ApplicationRuntimeHandshake {
	readonly target: 'desktop'
	readonly platform: DesktopPlatform
	readonly capabilities: {
		readonly projects: RuntimeCapability<ProjectsRuntime>
		readonly engine: RuntimeCapability<EngineRuntime>
		readonly settings: RuntimeCapability<SettingsRuntime>
		readonly commands: RuntimeCapability<CommandsRuntime>
		readonly lifecycle: RuntimeCapability<LifecycleRuntime>
	}
	readonly window: {
		minimize(): Promise<ApplicationResult<null>>
		toggleMaximize(): Promise<ApplicationResult<{ readonly maximized: boolean }>>
		requestClose(): Promise<ApplicationResult<'closed' | 'close-deferred'>>
	}
}

export interface ApplicationRuntime {
	readonly version: ApplicationRuntimeVersion
	readonly target: ApplicationTarget
	readonly windowChrome: WindowChromeStyle
	readonly projects: RuntimeCapability<ProjectsRuntime>
	readonly resources: RuntimeCapability<ResourcesRuntime>
	readonly engine: RuntimeCapability<EngineRuntime>
	readonly settings: RuntimeCapability<SettingsRuntime>
	readonly commands: RuntimeCapability<CommandsRuntime>
	readonly lifecycle: RuntimeCapability<LifecycleRuntime>
	readonly nativeWindow: RuntimeCapability<NativeWindowRuntime>
}

export function validateApplicationRuntime(
	runtime: ApplicationRuntime
): ApplicationResult<ApplicationRuntime> {
	if (runtime.version !== applicationRuntimeVersion) {
		return Object.freeze({
			ok: false as const,
			error: applicationError(
				'RUNTIME_VERSION_MISMATCH',
				`Runtime version ${String(runtime.version)} does not match ${String(applicationRuntimeVersion)}.`,
				{
					details: {
						expectedVersion: applicationRuntimeVersion,
						actualVersion: runtime.version
					}
				}
			)
		})
	}
	return Object.freeze({ ok: true as const, value: runtime })
}

export function createUnavailableRuntime(target: ApplicationTarget): ApplicationRuntime {
	return Object.freeze({
		version: applicationRuntimeVersion,
		target,
		windowChrome: target === 'desktop' ? 'custom' : 'none',
		projects: unavailableCapability<ProjectsRuntime>(
			'not-implemented',
			'Project persistence is not connected yet.'
		),
		resources: unavailableCapability<ResourcesRuntime>(
			'not-implemented',
			'Resource import is not connected yet.'
		),
		engine: unavailableCapability<EngineRuntime>(
			'not-implemented',
			'The audio engine is not connected yet.'
		),
		settings: unavailableCapability<SettingsRuntime>(
			'not-implemented',
			'Settings storage is not connected yet.'
		),
		commands: unavailableCapability<CommandsRuntime>(
			'not-implemented',
			'Application commands are not connected yet.'
		),
		lifecycle: unavailableCapability<LifecycleRuntime>(
			'not-implemented',
			'Application lifecycle is not connected yet.'
		),
		nativeWindow: unavailableCapability<NativeWindowRuntime>(
			target === 'desktop' ? 'not-implemented' : 'platform-unsupported',
			target === 'desktop'
				? 'Native window integration is not connected yet.'
				: 'Native window integration is unavailable on the Web.'
		)
	})
}
