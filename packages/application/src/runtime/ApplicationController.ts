import {
	type ApplicationError,
	type ApplicationRuntime,
	type AudioHealthSnapshot
} from '../../../contracts/src/index.js'
import { type ProjectSession } from '../../../project-core/src/index.js'
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

export const silentApplicationMeter = Object.freeze<ApplicationMeterSnapshot>({
	leftPeak: 0,
	rightPeak: 0
})

export interface ApplicationController {
	readonly performanceInput: PerformanceInputSession
	readonly previewCoordinator: AuditionPreviewCoordinator
	readonly getSnapshot: () => ApplicationControllerSnapshot
	readonly subscribe: (listener: () => void) => () => void
	bindProjectSession(session: ProjectSession): void
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
		bindProjectSession: () => undefined,
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
