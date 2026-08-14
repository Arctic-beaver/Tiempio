import {
	type ApplicationError,
	type ApplicationResult,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type ProjectHandle
} from '../../../contracts/src/index.js'
import {
	type DrumInstrument,
	type ProjectDocument,
	type PreparedProjectTransaction,
	type ProjectSession,
	type SynthInstrumentState
} from '../../../project-core/src/index.js'
import { PerformanceInputSession } from '../performance/performance-input-session.js'
import { AuditionPreviewCoordinator } from '../preview/audition-preview-coordinator.js'

export interface ApplicationControllerSnapshot {
	readonly acknowledgedProjectRevision: number | null
	readonly available: boolean
	readonly diagnostic: ApplicationError | null
	readonly health: AudioHealthSnapshot | null
	readonly meter: ApplicationMeterSnapshot
	readonly playing: boolean
	readonly tick: number
}

export interface ApplicationMeterSnapshot {
	readonly leftPeak: number
	readonly rightPeak: number
}

export interface OpenedApplicationProject {
	readonly handle: ProjectHandle
	readonly project: ProjectDocument
}

export interface DraftAuditionLayer {
	readonly draftId: string
	readonly instrument: SynthInstrumentState
}

export interface AuditionInstrumentPreview {
	readonly instrument: SynthInstrumentState
	readonly layerId: string
}

export const silentApplicationMeter = Object.freeze<ApplicationMeterSnapshot>({
	leftPeak: 0,
	rightPeak: 0
})

export interface ApplicationController {
	readonly performanceInput: PerformanceInputSession
	readonly previewCoordinator: AuditionPreviewCoordinator
	readonly getSnapshot: () => ApplicationControllerSnapshot
	readonly subscribe: (listener: () => void) => () => void
	auditionDrum(layerId: string, instrument: DrumInstrument): void
	bindProjectSession(session: ProjectSession, handle?: ProjectHandle | null): void
	preactivateProject(prepared: PreparedProjectTransaction): Promise<boolean>
	restoreProjectPlan(): Promise<void>
	setAuditionInstrumentPreview(preview: AuditionInstrumentPreview | null): Promise<boolean>
	setDraftAuditionLayer(layer: DraftAuditionLayer | null): Promise<boolean>
	openProject?(): Promise<ApplicationResult<OpenedApplicationProject>>
	retryAudio(): Promise<void>
	seek(tick: number): void
	setLoop(loop: {
		readonly enabled: boolean
		readonly startTick: number
		readonly endTick: number
	}): void
	setMetronomeEnabled(enabled: boolean): void
	setMetronomeVolume(volume: number): void
	start(): Promise<void>
	stop(): void
	togglePlayback(): void
}

const unavailableSnapshot = Object.freeze<ApplicationControllerSnapshot>({
	acknowledgedProjectRevision: null,
	available: false,
	diagnostic: null,
	health: null,
	meter: silentApplicationMeter,
	playing: false,
	tick: 0
})

export function createUnavailableApplicationController(
	runtime: ApplicationRuntime
): ApplicationController {
	const performanceInput = new PerformanceInputSession({
		noteOn: () => undefined,
		noteOff: () => undefined
	})
	const previewCoordinator = new AuditionPreviewCoordinator({
		cancel: () => undefined,
		start: () => false
	})
	return Object.freeze({
		performanceInput,
		previewCoordinator,
		getSnapshot: () => unavailableSnapshot,
		subscribe: () => () => undefined,
		auditionDrum: () => undefined,
		bindProjectSession: () => undefined,
		preactivateProject: async () => false,
		restoreProjectPlan: async () => undefined,
		setAuditionInstrumentPreview: async () => false,
		setDraftAuditionLayer: async () => false,
		retryAudio: async () => undefined,
		seek: () => undefined,
		setLoop: () => undefined,
		setMetronomeEnabled: () => undefined,
		setMetronomeVolume: () => undefined,
		start: async () => {
			if (runtime.lifecycle.availability === 'available') {
				await runtime.lifecycle.api.ready()
			}
		},
		stop: () => undefined,
		togglePlayback: () => undefined
	})
}

export interface ApplicationMountOptions {
	readonly createController?: (
		runtime: ApplicationRuntime,
		initialSession: ProjectSession
	) => ApplicationController
}
