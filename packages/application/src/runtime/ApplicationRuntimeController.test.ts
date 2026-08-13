import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationRuntimeVersion,
	applicationError,
	createUnavailableRuntime,
	engineProtocolVersion,
	nativeHostCapabilityCodes,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type EngineRuntime,
	type LifecycleRuntime,
	type ProjectsRuntime,
	type ProjectHandle,
	type ProjectSnapshotEnvelope,
	type RecoveryHandle
} from '../../../contracts/src/index.js'
import { performanceMapping } from '../../../music-theory/src/index.js'
import { createSynthInstrument, ProjectSession } from '../../../project-core/src/index.js'
import { EngineClient } from '../../../engine-client/src/index.js'
import { createSeedProject } from '../project/seed-project.js'
import { performanceSourceId } from '../performance/performance-input-session.js'
import { ApplicationRuntimeController } from './ApplicationRuntimeController.js'

const capabilities = nativeHostCapabilityCodes

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

function recoveryProjectsRuntime(
	createdHandle: ProjectHandle,
	openedHandle: ProjectHandle,
	onCreate: () => void,
	onOpen: () => void,
	onRecovery: (handle: ProjectHandle, revision: number) => void
): ProjectsRuntime {
	const unavailable = Object.freeze({
		ok: false as const,
		error: applicationError('OPERATION_UNAVAILABLE', 'Unavailable in test.')
	})
	return Object.freeze({
		create: async () => {
			onCreate()
			return Object.freeze({ ok: true as const, value: createdHandle })
		},
		open: async () => {
			onOpen()
			return Object.freeze({ ok: true as const, value: openedHandle })
		},
		load: async (handle: ProjectHandle) =>
			handle === openedHandle
				? Object.freeze({
						ok: true as const,
						value: Object.freeze({
							compatibility: 'supported' as const,
							fingerprint: 'sha256:test',
							saveAllowed: true,
							snapshot: Object.freeze({
								revision: 3,
								bytes: new Uint8Array([9])
							})
						})
					})
				: unavailable,
		persist: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
		persistAs: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
		saveCopy: async (_handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) =>
			Object.freeze({ status: 'canceled' as const, revision: snapshot.revision }),
		writeRecovery: async (handle: ProjectHandle, snapshot: ProjectSnapshotEnvelope) => {
			onRecovery(handle, snapshot.revision)
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ revision: snapshot.revision })
			})
		},
		listRecoveries: async () => Object.freeze({ ok: true as const, value: Object.freeze([]) }),
		restoreRecovery: async () => unavailable,
		discardRecovery: async (_handle: RecoveryHandle, throughRevision: number) =>
			Object.freeze({
				ok: true as const,
				value: Object.freeze({ discardedThroughRevision: throughRevision })
			})
	})
}

describe('ApplicationRuntimeController', () => {
	it('defers the engine client until an activated retry has connected the runtime', async () => {
		const browser = installBrowserSurfaces()
		const callOrder: string[] = []
		let connectCount = 0
		const engine: EngineRuntime = Object.freeze({
			connect: () => {
				connectCount += 1
				callOrder.push(`connect:${String(connectCount)}`)
				if (connectCount === 1) {
					return Promise.resolve(
						Object.freeze({
							ok: false as const,
							error: applicationError(
								'PERMISSION_DENIED',
								'Enable audio from an explicit browser action.',
								{ retryable: true }
							)
						})
					)
				}
				return Promise.resolve(
					Object.freeze({
						ok: true as const,
						value: Object.freeze({
							audioConfiguration: Object.freeze({
								blockFrames: 128,
								channels: 2 as const,
								sampleRate: 44_100
							}),
							protocolVersion: engineProtocolVersion,
							capabilities
						})
					})
				)
			},
			disconnect: async () => {
				callOrder.push('disconnect')
				return Object.freeze({ ok: true as const, value: null })
			},
			send: async () =>
				Object.freeze({
					ok: true as const,
					value: Object.freeze({ accepted: true as const })
				}),
			onEvent: () => () => undefined,
			getHealth: async () => Object.freeze({ ok: true as const, value: readyHealth }),
			onHealth: () => () => undefined
		})
		const unavailable = createUnavailableRuntime('web')
		const runtime: ApplicationRuntime = Object.freeze({
			...unavailable,
			engine: Object.freeze({ availability: 'available' as const, api: engine })
		})
		const controller = new ApplicationRuntimeController(
			runtime,
			new ProjectSession(createSeedProject()),
			{
				loadEngineClient: async (connectedRuntime) => {
					callOrder.push('load-client')
					return new EngineClient(connectedRuntime, { capabilities })
				},
				prepareEngineActivation: () => {
					callOrder.push('prepare-activation')
					let consumed = false
					return Object.freeze({
						connect: () => {
							consumed = true
							callOrder.push('connect-prepared')
							return engine.connect()
						},
						cancel: async () => {
							if (!consumed) callOrder.push('cancel-activation')
						}
					})
				}
			}
		)
		try {
			await controller.start()
			assert.deepEqual(callOrder, ['connect:1'])
			assert.equal(controller.getSnapshot().available, false)

			await controller.retryAudio()
			assert.deepEqual(callOrder, [
				'connect:1',
				'prepare-activation',
				'connect-prepared',
				'connect:2',
				'load-client'
			])
			assert.equal(controller.getSnapshot().available, true)

			await controller.retryAudio()
			assert.deepEqual(callOrder.slice(-4), [
				'prepare-activation',
				'disconnect',
				'connect-prepared',
				'connect:3'
			])
		} finally {
			await controller.dispose()
			browser.restore()
		}
	})

	it('adopts an opened project handle without replacing it with a new runtime handle', async () => {
		const browser = installBrowserSurfaces()
		const createdHandle = `project:${'A'.repeat(64)}` as ProjectHandle
		const openedHandle = `project:${'B'.repeat(64)}` as ProjectHandle
		let creates = 0
		let opens = 0
		const recoveries: Array<{ readonly handle: ProjectHandle; readonly revision: number }> = []
		const projects = recoveryProjectsRuntime(
			createdHandle,
			openedHandle,
			() => {
				creates += 1
			},
			() => {
				opens += 1
			},
			(handle, revision) => recoveries.push({ handle, revision })
		)
		const unavailableRuntime = createUnavailableRuntime('web')
		const runtime: ApplicationRuntime = Object.freeze({
			...unavailableRuntime,
			projects: Object.freeze({ availability: 'available' as const, api: projects })
		})
		const controller = new ApplicationRuntimeController(
			runtime,
			new ProjectSession(createSeedProject()),
			{
				projectCodec: Object.freeze({
					decode: (bytes: Uint8Array) =>
						bytes[0] === 9
							? Object.freeze({
									status: 'loaded' as const,
									project: createSeedProject()
								})
							: Object.freeze({
									status: 'invalid' as const,
									error: Object.freeze({ message: 'Invalid test project.' })
								}),
					encode: () => new Uint8Array([1, 2, 3])
				})
			}
		)
		try {
			await controller.start()
			await flush()
			assert.equal(creates, 1)
			assert.equal(recoveries.at(-1)?.handle, createdHandle)

			const opening = controller.openProject()
			assert.equal(opens, 1)
			const opened = await opening
			assert.equal(opened.ok, true)
			if (!opened.ok) return
			assert.equal(opened.value.handle, openedHandle)
			controller.bindProjectSession(
				new ProjectSession(opened.value.project),
				opened.value.handle
			)
			await flush()
			assert.equal(creates, 1)
			assert.equal(recoveries.at(-1)?.handle, openedHandle)
			assert.equal(recoveries.at(-1)?.revision, 0)
		} finally {
			await controller.dispose()
			browser.restore()
		}
	})

	it('publishes synth and drum layers, follows newest revisions and routes transport', async () => {
		const browser = installBrowserSurfaces()
		const commands: AnyEngineCommandEnvelope[] = []
		const recoveries: ProjectSnapshotEnvelope[] = []
		const eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
		const healthListeners = new Set<(health: AudioHealthSnapshot) => void>()
		const closeListeners = new Set<() => void>()
		const unavailableError = applicationError('OPERATION_UNAVAILABLE', 'Unavailable in test.')
		let connects = 0
		let disconnects = 0
		const engine: EngineRuntime = Object.freeze({
			connect: async () => {
				connects += 1
				return Object.freeze({
					ok: true as const,
					value: Object.freeze({
						audioConfiguration: null,
						protocolVersion: engineProtocolVersion,
						capabilities
					})
				})
			},
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
			assert.equal(connects, 1)
			assert.deepEqual(
				commands.slice(0, 6).map((command) => command.type),
				[
					'handshake',
					'configure-audio',
					'load-render-plan',
					'set-metronome-enabled',
					'set-metronome-volume',
					'start-audio'
				]
			)
			const initialPlan = commands.find((command) => command.type === 'load-render-plan')
			assert.ok(initialPlan !== undefined && initialPlan.type === 'load-render-plan')
			assert.ok(initialPlan.payload.plan.layers.length > 0)
			assert.ok(
				initialPlan.payload.plan.layers.every((layer) =>
					['subtractive-synth', 'procedural-drums'].includes(layer.source.type)
				)
			)
			assert.ok(
				initialPlan.payload.plan.layers.some(
					(layer) => layer.source.type === 'procedural-drums'
				)
			)
			assert.deepEqual(
				recoveries.map((snapshot) => snapshot.revision),
				[0]
			)
			const beforePreview = session.getSnapshot()
			const previewId = controller.previewCoordinator.start('sound', 'layer.bass', [
				{ durationMs: 160, offsetMs: 0, pitches: [57], velocity: 100 },
				{ durationMs: 160, offsetMs: 160, pitches: [60], velocity: 100 }
			])
			assert.equal(previewId, 'preview-sound-1')
			await flush()
			assert.equal(commands.at(-1)?.type, 'start-preview')
			if (previewId === null) throw new Error('preview should be accepted')
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 0,
					type: 'preview-started',
					payload: { durationFrames: 15_360, previewId }
				})
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 1,
					type: 'preview-state',
					payload: { active: true, pitches: [57], previewId, samplePosition: 0 }
				})
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 2,
					type: 'meter-snapshot',
					payload: { leftPeak: 0.25, rightPeak: 0.5 }
				})
			}
			assert.deepEqual(controller.previewCoordinator.getSnapshot().pitches, [57])
			assert.deepEqual(controller.getSnapshot().meter, { leftPeak: 0.25, rightPeak: 0.5 })
			assert.equal(session.getSnapshot().revision, beforePreview.revision)
			assert.equal(session.getSnapshot().canUndo, beforePreview.canUndo)
			assert.equal(session.getSnapshot().project, beforePreview.project)
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 3,
					type: 'preview-ended',
					payload: { previewId, reason: 'completed' }
				})
			}
			assert.equal(controller.previewCoordinator.getSnapshot().active, false)

			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 4,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 1, projectRevision: 0 }
				})
			}
			session.dispatch({ type: 'transport.tempo.set', baseRevision: 0, bpm: 124 })
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 5,
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
					sequence: 6,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 2, projectRevision: 1 }
				})
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 7,
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

			controller.performanceInput.activate(
				'sound-chooser',
				'layer.bass',
				performanceMapping(
					{ tonic: 9, mode: 'minor' },
					{ layout: 'compact', rotation: 0, tonicMidi: 45 }
				)
			)
			for (const [code, pitch] of [
				['KeyA', 45],
				['KeyS', 47],
				['KeyD', 48],
				['KeyF', 50],
				['KeyG', 52],
				['KeyH', 53],
				['KeyJ', 55]
			] as const) {
				const source = performanceSourceId('keyboard', code)
				assert.equal(
					controller.performanceInput.pressCode('sound-chooser', source, code),
					true
				)
				await flush()
				const note = commands.at(-1)
				assert.equal(note?.type, 'note-on')
				assert.equal(note?.type === 'note-on' ? note.payload.pitch : null, pitch)
				assert.equal(controller.performanceInput.releaseSource(source), true)
				await flush()
				assert.equal(commands.at(-1)?.type, 'note-off')
			}

			controller.performanceInput.pressCode(
				'sound-chooser',
				performanceSourceId('keyboard', 'KeyS'),
				'KeyS'
			)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-on')
			browser.windowSurface.dispatch('blur', {} as Event)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-off')
			assert.deepEqual(controller.performanceInput.getSnapshot().heldKeys, [])

			controller.performanceInput.pressCode(
				'sound-chooser',
				performanceSourceId('keyboard', 'KeyD'),
				'KeyD'
			)
			await flush()
			for (const listener of healthListeners) {
				listener({ ...readyHealth, deviceState: 'lost' })
			}
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-off')
			assert.equal(controller.getSnapshot().available, false)
			assert.deepEqual(controller.getSnapshot().meter, { leftPeak: 0, rightPeak: 0 })
			assert.deepEqual(controller.performanceInput.getSnapshot().heldKeys, [])
			for (const listener of healthListeners) listener(readyHealth)

			const firstRetry = controller.retryAudio()
			const coalescedRetry = controller.retryAudio()
			assert.equal(firstRetry, coalescedRetry)
			await firstRetry
			assert.equal(connects, 2)
			assert.equal(disconnects, 1)
			assert.equal(eventListeners.size, 1)
			assert.equal(healthListeners.size, 1)
			assert.deepEqual(
				commands.slice(-6).map((command) => command.type),
				[
					'handshake',
					'configure-audio',
					'load-render-plan',
					'set-metronome-enabled',
					'set-metronome-volume',
					'start-audio'
				]
			)
			const retriedPlan = commands.at(-4)
			assert.equal(retriedPlan?.type, 'load-render-plan')
			if (retriedPlan?.type === 'load-render-plan') {
				assert.equal(retriedPlan.payload.plan.projectRevision, 1)
			}
			const draftPlanAccepted = await controller.setDraftAuditionLayer({
				draftId: 'draft.layer:test',
				instrument: createSynthInstrument('lead.glass', {
					brightness: 0.8,
					hardness: 0.4,
					dirt: 0.1,
					length: 0.6,
					width: 0.7
				})
			})
			assert.equal(draftPlanAccepted, true)
			const draftPlan = commands.at(-1)
			assert.equal(draftPlan?.type, 'load-render-plan')
			if (draftPlan?.type === 'load-render-plan') {
				const draftLayer = draftPlan.payload.plan.layers.find(
					(layer) => layer.id === 'draft.layer:test'
				)
				assert.equal(draftPlan.payload.plan.projectRevision, 1)
				assert.equal(draftLayer?.source.type, 'subtractive-synth')
				assert.deepEqual(draftLayer?.events, [])
			}
			assert.equal(session.getSnapshot().revision, 1)
			assert.equal(session.getSnapshot().dirty, true)

			const prepared = session.prepareTransaction([
				{
					type: 'layer.add',
					baseRevision: 1,
					id: 'layer.created',
					name: 'Created',
					role: 'melody',
					synth: {
						presetId: 'lead.glass',
						macros: createSynthInstrument('lead.glass').macros,
						performance: { key: { tonic: 9, mode: 'minor' }, octave: 3 }
					}
				}
			])
			const preactivation = controller.preactivateProject(prepared)
			await flush()
			const candidatePlan = commands.at(-1)
			assert.equal(candidatePlan?.type, 'load-render-plan')
			if (candidatePlan?.type === 'load-render-plan') {
				assert.equal(candidatePlan.payload.plan.projectRevision, 2)
				assert.equal(
					candidatePlan.payload.plan.layers.some(
						(layer) => layer.id === 'draft.layer:test'
					),
					false
				)
				assert.equal(
					candidatePlan.payload.plan.layers.some((layer) => layer.id === 'layer.created'),
					true
				)
			}
			for (const listener of eventListeners) {
				listener({
					protocolVersion: engineProtocolVersion,
					sequence: 50,
					type: 'render-plan-acknowledged',
					payload: { planGeneration: 3, projectRevision: 2 }
				})
			}
			assert.equal(await preactivation, true)
			assert.equal(session.getSnapshot().revision, 1)
			const plansBeforeCommit = commands.filter(
				(command) => command.type === 'load-render-plan'
			).length
			session.commitTransaction(prepared)
			await flush()
			assert.equal(session.getSnapshot().revision, 2)
			assert.equal(session.getSnapshot().project.layers.at(-1)?.id, 'layer.created')
			assert.equal(controller.getSnapshot().acknowledgedProjectRevision, 2)
			assert.equal(
				commands.filter((command) => command.type === 'load-render-plan').length,
				plansBeforeCommit
			)

			controller.auditionDrum('layer.drums', 'openHat')
			await flush()
			await flush()
			assert.equal(
				commands.filter((command) => command.type === 'load-render-plan').length,
				plansBeforeCommit
			)
			const drumAudition = commands.at(-1)
			assert.equal(drumAudition?.type, 'note-on')
			if (drumAudition?.type === 'note-on') {
				assert.equal(drumAudition.payload.layerId, 'layer.drums')
				assert.equal(drumAudition.payload.pitch, 46)
				assert.equal(drumAudition.payload.velocity, 112)
			}

			controller.performanceInput.activate(
				'sound-chooser',
				'layer.created',
				performanceMapping(
					{ tonic: 9, mode: 'minor' },
					{ layout: 'compact', rotation: 0, tonicMidi: 45 }
				)
			)
			controller.performanceInput.pressCode(
				'sound-chooser',
				performanceSourceId('keyboard', 'KeyF'),
				'KeyF'
			)
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-on')
			for (const listener of closeListeners) listener()
			await flush()
			assert.equal(commands.at(-1)?.type, 'note-off')
		} finally {
			await controller.dispose()
			browser.restore()
		}
		assert.equal(disconnects, 2)
	})
})
