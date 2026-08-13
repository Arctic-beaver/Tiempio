import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import {
	createUnavailableRuntime,
	engineProtocolLimits,
	engineProtocolVersion,
	nativeHostCapabilityCodes,
	validateEngineCommandEnvelope,
	type AnyEngineCommandEnvelope,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type EngineRuntime
} from '../../../../packages/contracts/src/index.js'
import { performanceMapping } from '../../../../packages/music-theory/src/index.js'
import { ProjectSession } from '../../../../packages/project-core/src/index.js'
import {
	performanceKeyDown,
	performanceKeyUp,
	performancePointerDown,
	performancePointerEnd,
	type PerformanceKeyboardEvent,
	type PerformancePointerCaptureTarget,
	type PerformancePointerEvent
} from '../../../../packages/application/src/performance/performance-input-events.js'
import { createSeedProject } from '../../../../packages/application/src/project/seed-project.js'
import { ApplicationRuntimeController } from '../../../../packages/application/src/runtime/ApplicationRuntimeController.js'
import {
	nativeHostBootstrapVersion,
	nativeHostTokenEnvironmentKey
} from '../../host/native-host-contract.js'
import {
	EngineHostSupervisor,
	type NativeHostChild,
	type NativeHostSpawn
} from './engine-host-supervisor.js'
import { encodeNativeHostFrame, NativeHostFrameDecoder } from './framed-json-transport.js'

const readyHealth: AudioHealthSnapshot = Object.freeze({
	activeDeviceId: 'device.integration',
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
}

function installBrowserSurfaces(): () => void {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: new EventSurface()
	})
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: Object.assign(new EventSurface(), { visibilityState: 'visible' })
	})
	return () => {
		if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
		else Object.defineProperty(globalThis, 'window', originalWindow)
		if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document
		else Object.defineProperty(globalThis, 'document', originalDocument)
	}
}

class IntegratedNativeHost extends EventEmitter {
	readonly commands: AnyEngineCommandEnvelope[] = []
	readonly pid = 8_101
	readonly stderr = new PassThrough()
	readonly stdout = new PassThrough()
	readonly stdin: Writable
	exitCode: number | null = null
	killCount = 0
	shutdownCount = 0
	#eventSequence = 0
	#token = ''

	public constructor() {
		super()
		const decoder = new NativeHostFrameDecoder((input) => this.#acceptCommand(input))
		this.stdin = new Writable({
			write: (chunk: Buffer, _encoding, complete) => {
				try {
					decoder.push(chunk)
					complete()
				} catch (error) {
					complete(
						error instanceof Error ? error : new Error('Native host decode failed.')
					)
				}
			}
		})
	}

	public start(options: Parameters<NativeHostSpawn>[1]): void {
		this.#token = options.env[nativeHostTokenEnvironmentKey] ?? ''
		queueMicrotask(() => {
			const digest = createHash('sha256')
				.update(this.#token, 'ascii')
				.digest('hex')
				.toUpperCase()
			this.stdout.write(
				encodeNativeHostFrame({
					bootstrapVersion: nativeHostBootstrapVersion,
					engineProtocolVersion,
					tokenDigest: `sha256:${digest}`
				})
			)
		})
	}

	public kill(): boolean {
		this.killCount += 1
		this.exit(137)
		return true
	}

	public exit(code: number): void {
		if (this.exitCode !== null) return
		this.exitCode = code
		this.stdout.end()
		this.stderr.end()
		queueMicrotask(() => this.emit('exit', code, null))
	}

	#acceptCommand(input: unknown): void {
		const command = validateEngineCommandEnvelope(input)
		if (!command.ok) throw new Error(command.message)
		this.commands.push(command.value)
		switch (command.value.type) {
			case 'handshake':
				this.#emitEvent('ready', { protocolVersion: engineProtocolVersion })
				this.#emitEvent('capabilities', {
					capabilities: nativeHostCapabilityCodes,
					limits: engineProtocolLimits
				})
				break
			case 'load-render-plan':
				this.#emitEvent('render-plan-acknowledged', {
					planGeneration: 1,
					projectRevision: command.value.payload.plan.projectRevision
				})
				break
			case 'start-audio':
				this.#emitEvent('audio-health', readyHealth)
				break
			case 'ping':
				this.#emitEvent('pong', { heartbeatId: command.value.payload.heartbeatId })
				break
			case 'shutdown':
				this.shutdownCount += 1
				this.exit(0)
				break
			default:
				break
		}
	}

	#emitEvent(type: string, payload: unknown): void {
		this.stdout.write(
			encodeNativeHostFrame({
				protocolVersion: engineProtocolVersion,
				sequence: this.#eventSequence++,
				type,
				payload
			})
		)
	}
}

interface IntegrationHarness {
	readonly controller: ApplicationRuntimeController
	readonly host: IntegratedNativeHost
	readonly spawnCount: () => number
	readonly supervisor: EngineHostSupervisor
	dispose(): Promise<void>
}

function createIntegrationHarness(): IntegrationHarness {
	const restoreBrowserSurfaces = installBrowserSurfaces()
	const host = new IntegratedNativeHost()
	let spawns = 0
	const spawnHost: NativeHostSpawn = (_executablePath, options) => {
		spawns += 1
		if (spawns > 1) throw new Error('Integration host must be spawned exactly once.')
		host.start(options)
		return host as unknown as NativeHostChild
	}
	const supervisor = new EngineHostSupervisor({
		approvedRoot: resolve('build', 'native'),
		createToken: () => '0123456789ABCDEF0123456789ABCDEF',
		executablePath: resolve('build', 'native', 'integration-host.exe'),
		limits: {
			forcedCleanupConfirmationMs: 50,
			gracefulShutdownMs: 50,
			heartbeatFailureMs: 500,
			heartbeatIntervalMs: 20,
			maxAutomaticRestartsPerEpisode: 0,
			startupTimeoutMs: 100
		},
		spawnHost
	})
	const base = createUnavailableRuntime('desktop')
	const engine: EngineRuntime = Object.freeze({
		connect: () => supervisor.connect(),
		disconnect: () => supervisor.disconnect(),
		getHealth: async () => supervisor.getHealth(),
		onEvent: (listener: Parameters<EngineRuntime['onEvent']>[0]) =>
			supervisor.onEvent(listener),
		onHealth: (listener: Parameters<EngineRuntime['onHealth']>[0]) =>
			supervisor.onHealth(listener),
		send: (command: AnyEngineCommandEnvelope) => supervisor.send(command)
	})
	const runtime: ApplicationRuntime = Object.freeze({
		...base,
		engine: Object.freeze({ availability: 'available' as const, api: engine })
	})
	const controller = new ApplicationRuntimeController(
		runtime,
		new ProjectSession(createSeedProject())
	)
	let disposed = false
	return {
		controller,
		host,
		spawnCount: () => spawns,
		supervisor,
		dispose: async () => {
			if (disposed) return
			disposed = true
			try {
				await controller.dispose()
				if (supervisor.resourceSnapshot.activeProcess) await supervisor.disconnect()
			} finally {
				restoreBrowserSurfaces()
			}
		}
	}
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error('Integration condition did not become true.')
		await delay(5)
	}
}

async function startReady(harness: IntegrationHarness): Promise<void> {
	await harness.controller.start()
	await waitFor(() => harness.controller.getSnapshot().available)
	harness.controller.performanceInput.activate(
		'sound-chooser',
		'layer.bass',
		performanceMapping(
			{ tonic: 9, mode: 'minor' },
			{ layout: 'compact', rotation: 0, tonicMidi: 45 }
		)
	)
}

function commandsOfType<Type extends AnyEngineCommandEnvelope['type']>(
	host: IntegratedNativeHost,
	type: Type
): Extract<AnyEngineCommandEnvelope, { readonly type: Type }>[] {
	return host.commands.filter(
		(command): command is Extract<AnyEngineCommandEnvelope, { readonly type: Type }> =>
			command.type === type
	)
}

function keyboardEvent(code: string, prevented: { count: number }): PerformanceKeyboardEvent {
	return {
		altKey: false,
		code,
		ctrlKey: false,
		isComposing: false,
		metaKey: false,
		preventDefault: () => {
			prevented.count += 1
		},
		repeat: false,
		shiftKey: false,
		target: null
	}
}

describe('Desktop audio and performance input integration', () => {
	it('connects one native host for the controller lifetime and shuts it down exactly once', async () => {
		const harness = createIntegrationHarness()
		try {
			assert.equal(harness.spawnCount(), 0)
			assert.equal(harness.supervisor.resourceSnapshot.activeProcess, false)
			await Promise.all([harness.controller.start(), harness.controller.start()])
			await waitFor(() => harness.controller.getSnapshot().available)
			assert.equal(harness.spawnCount(), 1)
			assert.equal(harness.host.exitCode, null)
			assert.equal(harness.supervisor.state, 'ready')
			assert.equal(harness.supervisor.resourceSnapshot.activeProcess, true)
			assert.deepEqual(
				harness.host.commands
					.filter((command) => command.type !== 'ping')
					.slice(0, 6)
					.map((command) => command.type),
				[
					'handshake',
					'configure-audio',
					'load-render-plan',
					'set-metronome-enabled',
					'set-metronome-volume',
					'start-audio'
				]
			)
			await delay(35)
			assert.equal(harness.host.exitCode, null)
			await harness.controller.dispose()
			assert.equal(harness.host.shutdownCount, 1)
			assert.equal(harness.host.killCount, 0)
			assert.equal(harness.host.exitCode, 0)
			assert.equal(harness.supervisor.state, 'disconnected')
			assert.deepEqual(harness.supervisor.resourceSnapshot, {
				activeProcess: false,
				coalesceTimer: false,
				eventListeners: 0,
				healthListeners: 0,
				heartbeatTimer: false,
				pendingWrites: 0,
				retainedStderrBytes: 0
			})
			await harness.controller.dispose()
			assert.equal(harness.spawnCount(), 1)
			assert.equal(harness.host.shutdownCount, 1)
		} finally {
			await harness.dispose()
		}
	})

	it('routes a physical keyboard key through the controller into native note-on and note-off', async () => {
		const harness = createIntegrationHarness()
		try {
			await startReady(harness)
			const prevented = { count: 0 }
			assert.equal(
				performanceKeyDown(
					harness.controller.performanceInput,
					'sound-chooser',
					keyboardEvent('KeyA', prevented)
				),
				true
			)
			await waitFor(() => commandsOfType(harness.host, 'note-on').length === 1)
			const noteOn = commandsOfType(harness.host, 'note-on')[0]
			assert.deepEqual(noteOn?.payload, {
				auditionId: 'performance-1',
				layerId: 'layer.bass',
				pitch: 45,
				velocity: 102
			})
			assert.equal(
				performanceKeyUp(
					harness.controller.performanceInput,
					keyboardEvent('KeyA', prevented)
				),
				true
			)
			await waitFor(() => commandsOfType(harness.host, 'note-off').length === 1)
			assert.deepEqual(commandsOfType(harness.host, 'note-off')[0]?.payload, {
				auditionId: noteOn?.payload.auditionId
			})
			assert.equal(prevented.count, 2)
			assert.deepEqual(harness.controller.performanceInput.getSnapshot().heldKeys, [])
			assert.equal(harness.host.exitCode, null)
		} finally {
			await harness.dispose()
		}
	})

	it('routes an on-screen key pointer gesture into native note-on and note-off', async () => {
		const harness = createIntegrationHarness()
		try {
			await startReady(harness)
			const captures = new Set<number>()
			let prevented = 0
			const target: PerformancePointerCaptureTarget = {
				hasPointerCapture: (pointerId) => captures.has(pointerId),
				releasePointerCapture: (pointerId) => captures.delete(pointerId),
				setPointerCapture: (pointerId) => captures.add(pointerId)
			}
			const pointer: PerformancePointerEvent = {
				button: 0,
				currentTarget: target,
				isPrimary: true,
				pointerId: 17,
				pointerType: 'mouse',
				preventDefault: () => {
					prevented += 1
				}
			}
			assert.equal(
				performancePointerDown(
					harness.controller.performanceInput,
					'sound-chooser',
					'KeyS',
					pointer
				),
				true
			)
			assert.deepEqual([...captures], [17])
			await waitFor(() => commandsOfType(harness.host, 'note-on').length === 1)
			const noteOn = commandsOfType(harness.host, 'note-on')[0]
			assert.deepEqual(noteOn?.payload, {
				auditionId: 'performance-1',
				layerId: 'layer.bass',
				pitch: 47,
				velocity: 102
			})
			assert.equal(performancePointerEnd(harness.controller.performanceInput, pointer), true)
			await waitFor(() => commandsOfType(harness.host, 'note-off').length === 1)
			assert.deepEqual(commandsOfType(harness.host, 'note-off')[0]?.payload, {
				auditionId: noteOn?.payload.auditionId
			})
			assert.deepEqual([...captures], [])
			assert.equal(prevented, 2)
			assert.deepEqual(harness.controller.performanceInput.getSnapshot().heldKeys, [])
			assert.equal(harness.host.exitCode, null)
		} finally {
			await harness.dispose()
		}
	})
})
