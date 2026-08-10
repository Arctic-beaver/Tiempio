import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationRuntimeVersion,
	applicationError,
	createUnavailableRuntime,
	engineProtocolVersion,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type EngineCapabilityCode,
	type EngineRuntime,
	type LifecycleRuntime,
	type ProjectsRuntime,
	type ProjectHandle,
	type ProjectSnapshotEnvelope,
	type RecoveryHandle
} from '../../../contracts/src/index.js'
import { ProjectSession } from '../../../project-core/src/index.js'
import { createSeedProject } from '../project/seed-project.js'
import { ApplicationRuntimeController } from './ApplicationRuntimeController.js'

const capabilities = Object.freeze<readonly EngineCapabilityCode[]>([
	'protocol.typed-json',
	'render-plan.full',
	'transport.basic',
	'transport.loop',
	'synth.bass.deep',
	'audition.notes',
	'diagnostics.health',
	'supervision.heartbeat',
	'audio.native.shared',
	'audio.devices'
])

const readyHealth: AudioHealthSnapshot = Object.freeze({
	activeDeviceId: 'default',
	activeVoices: 0,
	backendState: 'ready',
	blockFrames: 512,
	deviceState: 'available',
	mode: 'shared',
	outputMuted: false,
	outputSignalObserved: false,
	projectRevision: 0,
	sampleRate: 48_000,
	underruns: 0
})

class EventSurface {
	readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

	public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
		const listeners = this.listeners.get(type) ?? new Set()
		listeners.add(listener)
		this.listeners.set(type, listeners)
	}

	public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
		this.listeners.get(type)?.delete(listener)
	}

	public dispatch(type: string, event: Event): void {
		for (const listener of this.listeners.get(type) ?? []) {
			if (typeof listener === 'function') listener(event)
			else listener.handleEvent(event)
		}
	}
}

function installBrowserSurfaces(): {
	readonly restore: () => void
	readonly windowSurface: EventSurface
} {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
	const elementNames = [
		'HTMLElement',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement'
	] as const
	const originalElements = new Map(
		elementNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
	)
	const windowSurface = new EventSurface()
	const documentSurface = Object.assign(new EventSurface(), { visibilityState: 'visible' })
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: windowSurface
	})
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: documentSurface
	})
	for (const name of elementNames) {
		Object.defineProperty(globalThis, name, { configurable: true, value: class {} })
	}
	return {
		windowSurface,
		restore: () => {
			if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
			else Object.defineProperty(globalThis, 'window', originalWindow)
			if (originalDocument === undefined)
				delete (globalThis as { document?: unknown }).document
			else Object.defineProperty(globalThis, 'document', originalDocument)
			for (const name of elementNames) {
				const descriptor = originalElements.get(name)
				if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name]
				else Object.defineProperty(globalThis, name, descriptor)
			}
		}
	}
}

function flush(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve))
}

describe('ApplicationRuntimeController', () => {
	it('publishes only supported layers, follows newest revisions and routes transport', async () => {
		const browser = installBrowserSurfaces()
		const commands: AnyEngineCommandEnvelope[] = []
		const recoveries: ProjectSnapshotEnvelope[] = []
		const eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
		const healthListeners = new Set<(health: AudioHealthSnapshot) => void>()
		const closeListeners = new Set<() => void>()
		const unavailableError = applicationError('OPERATION_UNAVAILABLE', 'Unavailable in test.')
		let disconnects = 0
		const engine: EngineRuntime = Object.freeze({
			connect: async () =>
				Object.freeze({
					ok: true as const,
					value: Object.freeze({ protocolVersion: engineProtocolVersion, capabilities })
				}),
			disconnect: async () => {
				disconnects += 1
				return Object.freeze({ ok: true as const, value: null })
			},
			send: async (command: AnyEngineCommandEnvelope) => {
				commands.push(command)
				return Object.freeze({
					ok: true as const,
					value: Object.freeze({ accepted: true as const })
				})
			},
			onEvent: (listener: (event: AnyEngineEventEnvelope) => void) => {
				eventListeners.add(listener)
				return () => eventListeners.delete(listener)
			},
			getHealth: async () => Object.freeze({ ok: true as const, value: readyHealth }),
			onHealth: (listener: (health: AudioHealthSnapshot) => void) => {
				healthListeners.add(listener)
				return () => healthListeners.delete(listener)
			}
		})
		const projects: ProjectsRuntime = Object.freeze({
			create: async () =>
				Object.freeze({
					ok: true as const,
					value: `project:${'A'.repeat(64)}` as ProjectHandle
				}),
			open: async () =>
				Object.freeze({
					ok: false as const,
					error: unavailableError
				}),
			load: async () =>
				Object.freeze({
					ok: false as const,
					error: unavailableError
				}),
			persist: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			persistAs: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			saveCopy: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
				Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
			writeRecovery: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) => {
				recoveries.push(snapshot)
				return Object.freeze({
					ok: true as const,
					value: Object.freeze({ revision: snapshot.revision })
				})
			},
			listRecoveries: async () =>
				Object.freeze({ ok: true as const, value: Object.freeze([]) }),
			restoreRecovery: async () =>
				Object.freeze({
					ok: false as const,
					error: unavailableError
				}),
			discardRecovery: async (_handle: RecoveryHandle, revision: number) =>
				Object.freeze({
					ok: true as const,
					value: Object.freeze({ discardedThroughRevision: revision })
				})
		})
		const lifecycle: LifecycleRuntime = Object.freeze({
			ready: async () => Object.freeze({ ok: true as const, value: null }),
			requestClose: async () =>
				Object.freeze({ ok: true as const, value: 'closed' as const }),
			onCloseRequested: (listener: () => void) => {
				closeListeners.add(listener)
				return () => closeListeners.delete(listener)
			}
		})
		const base = createUnavailableRuntime('desktop')
		const runtime: ApplicationRuntime = Object.freeze({
			...base,
			version: applicationRuntimeVersion,
			projects: Object.freeze({ availability: 'available' as const, api: projects }),
			engine: Object.freeze({ availability: 'available' as const, api: engine }),
			lifecycle: Object.freeze({ availability: 'available' as const, api: lifecycle })
		})
		const session = new ProjectSession(createSeedProject())
		const controller = new ApplicationRuntimeController(runtime, session, {
			projectCodec: Object.freeze({ encode: () => new Uint8Array([1, 2, 3]) })
		})
		try {
			await controller.start()
			await flush()
			assert.equal(controller.getSnapshot().available, true)
			assert.deepEqual(
				commands.slice(0, 4).map((command) => command.type),
				['handshake', 'configure-audio', 'load-render-plan', 'start-audio']
			)
			const initialPlan = commands.find((command) => command.type === 'load-render-plan')
			assert.ok(initialPlan !== undefined && initialPlan.type === 'load-render-plan')
			assert.ok(initialPlan.payload.plan.layers.length > 0)
			assert.ok(
				initialPlan.payload.plan.layers.every(
					(layer) => layer.source.type === 'subtractive-bass'
				)
			)
			assert.deepEqual(
				recoveries.map((snapshot) => snapshot.revision),
				[0]
			)

			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 0,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 1, projectRevision: 0 }
				})
			}
			session.dispatch({ type: 'transport.tempo.set', baseRevision: 0, bpm: 124 })
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 1,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 1, projectRevision: 0 }
				})
			}
			await flush()
			await flush()
			assert.equal(controller.getSnapshot().acknowledgedProjectRevision, 0)
			assert.ok(
				commands.some(
					(command) =>
						command.type === 'load-render-plan' &&
						command.payload.plan.projectRevision === 1
				)
			)
			assert.deepEqual(
				recoveries.map((snapshot) => snapshot.revision),
				[0, 1]
			)
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 2,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 2, projectRevision: 1 }
				})
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 3,
					type: 'transport-snapshot',
					payload: {
						playing: true,
						projectRevision: 1,
						samplePosition: 512,
						tick: 32
					}
				})
			}
			assert.equal(controller.getSnapshot().acknowledgedProjectRevision, 1)
			assert.equal(controller.getSnapshot().playing, true)
			controller.togglePlayback()
			await flush()
			assert.equal(commands.at(-1)?.type, 'stop')

			controller.setAuditionEnabled(true)
			browser.windowSurface.dispatch('keydown', {
				key: 'a',
				repeat: false,
				ctrlKey: false,
				metaKey: false,
				altKey: false,
				target: null
			} as unknown as KeyboardEvent)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-on')
			browser.windowSurface.dispatch('keyup', { key: 'a' } as unknown as KeyboardEvent)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-off')
			browser.windowSurface.dispatch('keydown', {
				key: 's',
				repeat: false,
				ctrlKey: false,
				metaKey: false,
				altKey: false,
				target: null
			} as unknown as KeyboardEvent)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-on')
			for (const listener of closeListeners) listener()
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-off')
		} finally {
			await controller.dispose()
			browser.restore()
		}
		assert.equal(disconnects, 1)
	})
})
