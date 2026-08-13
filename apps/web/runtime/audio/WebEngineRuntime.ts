import {
	applicationError,
	engineProtocolVersion,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineRuntime
} from '../../../../packages/contracts/src/index.js'
import type { WebAudioWorkletAdapter } from './webAudioWorkletAdapter.js'

type ContextState = AudioContextState | 'interrupted'

export type WebAudioContext = Omit<AudioContext, 'state'> & {
	readonly state: ContextState
}

export interface WebEngineRuntimeDependencies {
	readonly createContext: () => WebAudioContext
	readonly hasTransientActivation: () => boolean
	readonly loadAdapter: () => Promise<{
		createWebAudioWorkletAdapter(
			context: AudioContext,
			generation: number
		): Promise<WebAudioWorkletAdapter>
	}>
	readonly documentTarget: Pick<
		Document,
		'addEventListener' | 'removeEventListener' | 'visibilityState'
	>
	readonly windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

export interface PreparedWebAudioActivation {
	readonly context: WebAudioContext
	readonly resume: Promise<void>
}

const stoppedHealth = Object.freeze<AudioHealthSnapshot>({
	activeDeviceId: null,
	activeVoices: 0,
	backendState: 'disconnected',
	blockFrames: null,
	deviceState: 'unavailable',
	mode: 'browser',
	outputMuted: true,
	outputSignalObserved: false,
	projectRevision: null,
	sampleRate: null,
	underruns: 0
})

function defaultDependencies(): WebEngineRuntimeDependencies {
	return Object.freeze({
		createContext: () => new AudioContext({ latencyHint: 'interactive' }) as WebAudioContext,
		hasTransientActivation: () => navigator.userActivation?.isActive === true,
		loadAdapter: () => import('./webAudioWorkletAdapter.js'),
		documentTarget: document,
		windowTarget: window
	})
}

function success<Value>(value: Value): ApplicationResult<Value> {
	return Object.freeze({ ok: true as const, value })
}

function activationError(): ApplicationError {
	return applicationError('PERMISSION_DENIED', 'Enable audio from an explicit browser action.', {
		retryable: true,
		details: { diagnostic: 'audio.suspended' }
	})
}

export class WebEngineRuntime implements EngineRuntime {
	readonly #dependencies: WebEngineRuntimeDependencies
	readonly #eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
	readonly #healthListeners = new Set<(health: AudioHealthSnapshot) => void>()
	#adapter: WebAudioWorkletAdapter | null = null
	#connecting: Promise<ApplicationResult<WebAudioWorkletAdapter['connection']>> | null = null
	#context: WebAudioContext | null = null
	#generation = 0
	#health = stoppedHealth
	#lastEventSequence = -1
	#lossListenersAttached = false
	#tearingDown: Promise<void> | null = null
	#unsubscribeAdapterEvent: (() => void) | null = null
	#unsubscribeAdapterFatal: (() => void) | null = null

	public constructor(dependencies: WebEngineRuntimeDependencies = defaultDependencies()) {
		this.#dependencies = dependencies
	}

	public connect(): Promise<ApplicationResult<WebAudioWorkletAdapter['connection']>> {
		if (this.#adapter !== null) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'INVALID_REQUEST',
						'The Web audio engine is already connected.'
					)
				})
			)
		}
		if (this.#connecting !== null) return this.#connecting
		if (this.#tearingDown !== null) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'ENGINE_UNAVAILABLE',
						'The previous Web audio generation is still closing.',
						{ retryable: true, details: { diagnostic: 'audio.suspended' } }
					)
				})
			)
		}
		if (!this.#dependencies.hasTransientActivation()) {
			return Promise.resolve(Object.freeze({ ok: false as const, error: activationError() }))
		}
		this.#connecting = this.#activate().finally(() => {
			this.#connecting = null
		})
		return this.#connecting
	}

	public connectPrepared(
		activation: PreparedWebAudioActivation
	): Promise<ApplicationResult<WebAudioWorkletAdapter['connection']>> {
		if (this.#adapter !== null || this.#connecting !== null || this.#tearingDown !== null) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'INVALID_REQUEST',
						'The Web audio engine cannot accept a prepared activation.'
					)
				})
			)
		}
		this.#connecting = this.#activate(activation).finally(() => {
			this.#connecting = null
		})
		return this.#connecting
	}

	public prepareForReplacement(): void {
		if (this.#context === null) return
		this.#generation += 1
		void this.#teardown(false)
	}

	async #activate(
		prepared: PreparedWebAudioActivation | null = null
	): Promise<ApplicationResult<WebAudioWorkletAdapter['connection']>> {
		this.#generation += 1
		const generation = this.#generation
		this.#publishHealth({
			...stoppedHealth,
			backendState: 'starting',
			sampleRate: null
		})
		let context: WebAudioContext
		if (prepared === null) {
			try {
				context = this.#dependencies.createContext()
			} catch {
				return this.#activationFailed(
					applicationError(
						'ENGINE_UNAVAILABLE',
						'This browser cannot create an audio context.',
						{
							retryable: true,
							details: { diagnostic: 'audio.start-failed' }
						}
					)
				)
			}
		} else context = prepared.context
		this.#context = context
		context.addEventListener('statechange', this.#contextStateChanged)
		let resume: Promise<void>
		if (prepared === null) {
			try {
				resume = context.resume()
			} catch {
				return await this.#activationFailed(
					applicationError(
						'ENGINE_UNAVAILABLE',
						'The browser rejected audio activation.',
						{
							retryable: true,
							details: { diagnostic: 'audio.start-failed' }
						}
					)
				)
			}
		} else resume = prepared.resume
		try {
			const [adapterModule] = await Promise.all([this.#dependencies.loadAdapter(), resume])
			if (generation !== this.#generation || context !== this.#context) {
				await context.close()
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'ENGINE_UNAVAILABLE',
						'A newer Web audio generation replaced startup.',
						{
							retryable: true
						}
					)
				})
			}
			if (context.state !== 'running') {
				return await this.#activationFailed(activationError())
			}
			const adapter = await adapterModule.createWebAudioWorkletAdapter(
				context as AudioContext,
				generation
			)
			if (generation !== this.#generation || context !== this.#context) {
				adapter.dispose()
				await context.close()
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'ENGINE_UNAVAILABLE',
						'A stale Web audio graph was discarded.',
						{
							retryable: true
						}
					)
				})
			}
			this.#adapter = adapter
			this.#lastEventSequence = -1
			this.#unsubscribeAdapterEvent = adapter.onEvent((event) => {
				if (generation === this.#generation) this.#acceptEvent(event)
			})
			this.#unsubscribeAdapterFatal = adapter.onFatal((error) => {
				if (generation === this.#generation) this.#fatal(error)
			})
			this.#attachLossListeners()
			return success(adapter.connection)
		} catch {
			return await this.#activationFailed(
				applicationError('ENGINE_UNAVAILABLE', 'The Web audio worklet could not start.', {
					retryable: true,
					details: { diagnostic: 'audio.start-failed' }
				})
			)
		}
	}

	async #activationFailed(error: ApplicationError): Promise<ApplicationResult<never>> {
		await this.#teardown(false)
		this.#publishHealth(stoppedHealth)
		return Object.freeze({ ok: false as const, error })
	}

	public async disconnect(): Promise<ApplicationResult<null>> {
		this.#generation += 1
		await this.#teardown(false)
		this.#publishHealth(stoppedHealth)
		return success(null)
	}

	public async send(
		command: AnyEngineCommandEnvelope
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		const adapter = this.#adapter
		if (adapter === null) {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'ENGINE_UNAVAILABLE',
					'Enable Web audio before sending commands.',
					{
						retryable: true,
						details: { diagnostic: 'audio.suspended' }
					}
				)
			})
		}
		return await adapter.send(command)
	}

	public onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void {
		this.#eventListeners.add(listener)
		return () => this.#eventListeners.delete(listener)
	}

	public getHealth(): Promise<ApplicationResult<AudioHealthSnapshot>> {
		return Promise.resolve(success(this.#health))
	}

	public onHealth(listener: (health: AudioHealthSnapshot) => void): () => void {
		this.#healthListeners.add(listener)
		return () => this.#healthListeners.delete(listener)
	}

	#acceptEvent(event: AnyEngineEventEnvelope): void {
		this.#lastEventSequence = Math.max(this.#lastEventSequence, event.sequence)
		if (event.type === 'audio-health') {
			this.#publishHealth({
				...event.payload,
				activeDeviceId: null,
				mode: 'browser'
			})
		}
		for (const listener of this.#eventListeners) listener(event)
	}

	#fatal(error: ApplicationError): void {
		this.#publishSyntheticEvent('fatal-error', {
			code: 'audio.start-failed',
			message: error.message
		})
		void this.#teardown(true)
	}

	#contextStateChanged = (): void => {
		const state = this.#context?.state
		if (state === 'running' || state === null || state === undefined) return
		this.#publishSyntheticEvent('diagnostic', {
			code: state === 'closed' ? 'audio.device-lost' : 'audio.suspended',
			message:
				state === 'closed'
					? 'The browser audio context closed.'
					: 'The browser suspended audio output.',
			projectRevision: this.#health.projectRevision
		})
		void this.#teardown(true)
	}

	#visibilityChanged = (): void => {
		if (this.#dependencies.documentTarget.visibilityState === 'visible') return
		this.#interrupt()
	}

	#interrupt = (): void => {
		if (this.#context === null) return
		this.#publishSyntheticEvent('diagnostic', {
			code: 'audio.suspended',
			message: 'Browser audio was released when the page lost activation.',
			projectRevision: this.#health.projectRevision
		})
		void this.#teardown(true)
	}

	#publishSyntheticEvent<Type extends 'diagnostic' | 'fatal-error'>(
		type: Type,
		payload: Type extends 'diagnostic'
			? {
					readonly code: 'audio.suspended' | 'audio.device-lost'
					readonly message: string
					readonly projectRevision: number | null
				}
			: { readonly code: 'audio.start-failed'; readonly message: string }
	): void {
		this.#lastEventSequence += 1
		const event = Object.freeze({
			protocolVersion: engineProtocolVersion,
			sequence: this.#lastEventSequence,
			type,
			payload
		}) as AnyEngineEventEnvelope
		for (const listener of this.#eventListeners) listener(event)
	}

	#publishHealth(health: AudioHealthSnapshot): void {
		this.#health = Object.freeze({ ...health, activeDeviceId: null, mode: 'browser' })
		for (const listener of this.#healthListeners) listener(this.#health)
	}

	#attachLossListeners(): void {
		if (this.#lossListenersAttached) return
		this.#lossListenersAttached = true
		this.#dependencies.windowTarget.addEventListener('blur', this.#interrupt)
		this.#dependencies.windowTarget.addEventListener('pagehide', this.#interrupt)
		this.#dependencies.documentTarget.addEventListener(
			'visibilitychange',
			this.#visibilityChanged
		)
	}

	#detachLossListeners(): void {
		if (!this.#lossListenersAttached) return
		this.#lossListenersAttached = false
		this.#dependencies.windowTarget.removeEventListener('blur', this.#interrupt)
		this.#dependencies.windowTarget.removeEventListener('pagehide', this.#interrupt)
		this.#dependencies.documentTarget.removeEventListener(
			'visibilitychange',
			this.#visibilityChanged
		)
	}

	async #teardown(interrupted: boolean): Promise<void> {
		if (this.#tearingDown !== null) return await this.#tearingDown
		this.#tearingDown = this.#performTeardown(interrupted).finally(() => {
			this.#tearingDown = null
		})
		return await this.#tearingDown
	}

	async #performTeardown(interrupted: boolean): Promise<void> {
		this.#detachLossListeners()
		this.#unsubscribeAdapterEvent?.()
		this.#unsubscribeAdapterEvent = null
		this.#unsubscribeAdapterFatal?.()
		this.#unsubscribeAdapterFatal = null
		this.#adapter?.dispose()
		this.#adapter = null
		const context = this.#context
		this.#context = null
		context?.removeEventListener('statechange', this.#contextStateChanged)
		if (context !== null && context.state !== 'closed') {
			try {
				await context.close()
			} catch {
				// Browser context cleanup is best-effort after the owned graph is disconnected.
			}
		}
		this.#publishHealth({
			...stoppedHealth,
			backendState: interrupted ? 'stopped' : 'disconnected',
			deviceState: interrupted ? 'lost' : 'unavailable',
			blockFrames: this.#health.blockFrames,
			sampleRate: this.#health.sampleRate,
			projectRevision: this.#health.projectRevision,
			underruns: this.#health.underruns
		})
	}
}

export function createWebEngineRuntime(): EngineRuntime {
	return new WebEngineRuntime()
}
