import {
	type ApplicationError,
	type ApplicationRuntime,
	type AudioHealthSnapshot
} from '../../../contracts/src/index.js'
import { type ProjectSession } from '../../../project-core/src/index.js'

export interface ApplicationControllerSnapshot {
	readonly acknowledgedProjectRevision: number | null
	readonly available: boolean
	readonly diagnostic: ApplicationError | null
	readonly health: AudioHealthSnapshot | null
	readonly playing: boolean
	readonly tick: number
}

export interface ApplicationController {
	readonly getSnapshot: () => ApplicationControllerSnapshot
	readonly subscribe: (listener: () => void) => () => void
	bindProjectSession(session: ProjectSession): void
	seek(tick: number): void
	setAuditionEnabled(enabled: boolean): void
	setLoop(loop: {
		readonly enabled: boolean
		readonly startTick: number
		readonly endTick: number
	}): void
	start(): Promise<void>
	stop(): void
	togglePlayback(): void
}

const unavailableSnapshot = Object.freeze<ApplicationControllerSnapshot>({
	acknowledgedProjectRevision: null,
	available: false,
	diagnostic: null,
	health: null,
	playing: false,
	tick: 0
})

export function createUnavailableApplicationController(
	runtime: ApplicationRuntime
): ApplicationController {
	return Object.freeze({
		getSnapshot: () => unavailableSnapshot,
		subscribe: () => () => undefined,
		bindProjectSession: () => undefined,
		seek: () => undefined,
		setAuditionEnabled: () => undefined,
		setLoop: () => undefined,
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
