import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	applicationError,
	engineProtocolVersion,
	webWorkletCapabilityCodes,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineConnection
} from '../../../../packages/contracts/src/index.js'
import {
	WebEngineRuntime,
	type WebAudioContext,
	type WebEngineRuntimeDependencies
} from './WebEngineRuntime.js'
import type { WebAudioWorkletAdapter } from './webAudioWorkletAdapter.js'

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

class FakeTarget extends EventTarget {
	public visibilityState: DocumentVisibilityState = 'visible'
}

class FakeContext extends EventTarget {
	public closes = 0
	public resumes = 0
	public state: AudioContextState | 'interrupted' = 'suspended'

	public async resume(): Promise<void> {
		this.resumes += 1
		this.state = 'running'
		this.dispatchEvent(new Event('statechange'))
	}

	public async close(): Promise<void> {
		this.closes += 1
		this.state = 'closed'
	}

	public suspendWith(state: 'suspended' | 'interrupted' | 'closed'): void {
		this.state = state
		this.dispatchEvent(new Event('statechange'))
	}
}

class FakeAdapter implements WebAudioWorkletAdapter {
	readonly #eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
	readonly #fatalListeners = new Set<(error: ApplicationError) => void>()
	public disposed = 0
	public readonly commands: AnyEngineCommandEnvelope[] = []
	public readonly connection: EngineConnection = Object.freeze({
		protocolVersion: engineProtocolVersion,
		capabilities: Object.freeze([...webWorkletCapabilityCodes]),
		audioConfiguration: Object.freeze({ sampleRate: 44_100, blockFrames: 128, channels: 2 })
	})

	public dispose(): void {
		this.disposed += 1
		this.#eventListeners.clear()
		this.#fatalListeners.clear()
	}

	public onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void {
		this.#eventListeners.add(listener)
		return () => this.#eventListeners.delete(listener)
	}

	public onFatal(listener: (error: ApplicationError) => void): () => void {
		this.#fatalListeners.add(listener)
		return () => this.#fatalListeners.delete(listener)
	}

	public async send(
		command: AnyEngineCommandEnvelope
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		this.commands.push(command)
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({ accepted: true as const })
		})
	}

	public emit(event: AnyEngineEventEnvelope): void {
		for (const listener of this.#eventListeners) listener(event)
	}

	public fail(): void {
		const error = applicationError('ENGINE_UNAVAILABLE', 'processor failed', {
			retryable: true
		})
		for (const listener of this.#fatalListeners) listener(error)
	}
}

interface WebEngineRuntimeHarness {
	readonly activate: () => void
	readonly adapters: FakeAdapter[]
	readonly contexts: FakeContext[]
	readonly documentTarget: FakeTarget
	readonly generations: number[]
	readonly runtime: WebEngineRuntime
	readonly windowTarget: FakeTarget
}

function harness(
	options: { readonly active?: boolean; readonly adapterFailure?: boolean } = {}
): WebEngineRuntimeHarness {
	let active = options.active ?? false
	const contexts: FakeContext[] = []
	const adapters: FakeAdapter[] = []
	const generations: number[] = []
	const documentTarget = new FakeTarget()
	const windowTarget = new FakeTarget()
	const dependencies: WebEngineRuntimeDependencies = {
		createContext: () => {
			const context = new FakeContext()
			contexts.push(context)
			return context as unknown as WebAudioContext
		},
		hasTransientActivation: () => active,
		loadAdapter: async () => ({
			createWebAudioWorkletAdapter: async (_context, generation) => {
				generations.push(generation)
				if (options.adapterFailure === true) throw new Error('worklet load failed')
				const adapter = new FakeAdapter()
				adapters.push(adapter)
				return adapter
			}
		}),
		documentTarget: documentTarget as unknown as WebEngineRuntimeDependencies['documentTarget'],
		windowTarget: windowTarget as unknown as WebEngineRuntimeDependencies['windowTarget']
	}
	return {
		runtime: new WebEngineRuntime(dependencies),
		contexts,
		adapters,
		generations,
		documentTarget,
		windowTarget,
		activate: () => {
			active = true
		}
	}
}

describe('WebEngineRuntime', () => {
	it('mounts without consuming activation or creating an audio graph', async () => {
		const test = harness()
		const health: AudioHealthSnapshot[] = []
		test.runtime.onHealth((snapshot) => health.push(snapshot))
		const connected = await test.runtime.connect()
		assert.equal(connected.ok, false)
		if (!connected.ok) {
			assert.equal(connected.error.code, 'PERMISSION_DENIED')
			assert.equal(connected.error.retryable, true)
		}
		assert.equal(test.contexts.length, 0)
		assert.equal(test.adapters.length, 0)
		assert.deepEqual(health, [])
	})

	it('coalesces activation, reports the actual context configuration and fences loss', async () => {
		const test = harness({ active: true })
		const events: AnyEngineEventEnvelope[] = []
		const health: AudioHealthSnapshot[] = []
		test.runtime.onEvent((event) => events.push(event))
		test.runtime.onHealth((snapshot) => health.push(snapshot))
		const first = test.runtime.connect()
		assert.equal(test.contexts.length, 1)
		assert.equal(test.contexts[0]?.resumes, 1)
		const duplicate = test.runtime.connect()
		assert.equal(first, duplicate)
		const connected = await first
		assert.equal(connected.ok, true)
		assert.equal(test.contexts.length, 1)
		assert.deepEqual(test.generations, [1])
		assert.equal(connected.ok ? connected.value.audioConfiguration?.sampleRate : null, 44_100)

		const adapter = test.adapters[0]
		assert.notEqual(adapter, undefined)
		adapter?.emit({
			protocolVersion: engineProtocolVersion,
			sequence: 0,
			type: 'audio-health',
			payload: {
				activeDeviceId: 'private-device',
				activeVoices: 2,
				backendState: 'ready',
				blockFrames: 128,
				deviceState: 'available',
				mode: 'browser',
				outputMuted: false,
				outputSignalObserved: true,
				projectRevision: 7,
				sampleRate: 44_100,
				underruns: 0
			}
		})
		const observed = await test.runtime.getHealth()
		assert.equal(observed.ok ? observed.value.activeDeviceId : 'failed', null)
		assert.equal(observed.ok ? observed.value.mode : null, 'browser')

		test.contexts[0]?.suspendWith('suspended')
		await flush()
		assert.equal(adapter?.disposed, 1)
		assert.equal(test.contexts[0]?.closes, 1)
		assert.equal(events.filter((event) => event.type === 'diagnostic').length, 1)
		assert.equal(health.at(-1)?.deviceState, 'lost')
		adapter?.emit({
			protocolVersion: engineProtocolVersion,
			sequence: 99,
			type: 'meter-snapshot',
			payload: { leftPeak: 1, rightPeak: 1 }
		})
		assert.equal(
			events.some((event) => event.sequence === 99),
			false
		)

		const retried = await test.runtime.connect()
		assert.equal(retried.ok, true)
		assert.deepEqual(test.generations, [1, 2])
		assert.equal(test.contexts.length, 2)
	})

	it('tears down partial graphs after module failure and releases on page loss once', async () => {
		const failed = harness({ active: true, adapterFailure: true })
		const result = await failed.runtime.connect()
		assert.equal(result.ok, false)
		assert.equal(failed.contexts[0]?.closes, 1)

		const test = harness({ active: true })
		const events: AnyEngineEventEnvelope[] = []
		test.runtime.onEvent((event) => events.push(event))
		assert.equal((await test.runtime.connect()).ok, true)
		test.windowTarget.dispatchEvent(new Event('blur'))
		test.windowTarget.dispatchEvent(new Event('pagehide'))
		await flush()
		assert.equal(test.adapters[0]?.disposed, 1)
		assert.equal(test.contexts[0]?.closes, 1)
		assert.equal(events.filter((event) => event.type === 'diagnostic').length, 1)
	})

	it('turns processor failure into one bounded fatal event and a retryable graph', async () => {
		const test = harness({ active: true })
		const events: AnyEngineEventEnvelope[] = []
		test.runtime.onEvent((event) => events.push(event))
		assert.equal((await test.runtime.connect()).ok, true)
		test.adapters[0]?.fail()
		await flush()
		assert.equal(events.filter((event) => event.type === 'fatal-error').length, 1)
		assert.equal(test.adapters[0]?.disposed, 1)
		assert.equal((await test.runtime.connect()).ok, true)
	})
})
