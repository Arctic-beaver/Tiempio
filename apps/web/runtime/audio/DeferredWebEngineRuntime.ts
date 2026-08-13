import {
	applicationError,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineConnection,
	type EngineRuntime
} from '../../../../packages/contracts/src/index.js'
import type {
	PreparedWebAudioActivation,
	WebAudioContext,
	WebEngineRuntime
} from './WebEngineRuntime.js'

export interface DeferredWebEngineRuntimeDependencies {
	readonly createContext: () => WebAudioContext
	readonly hasTransientActivation: () => boolean
	readonly loadRuntime: () => Promise<WebEngineRuntime>
}

export interface PreparedWebEngineActivation {
	connect(): Promise<ApplicationResult<EngineConnection>>
	cancel(): Promise<void>
}

function defaultDependencies(): DeferredWebEngineRuntimeDependencies {
	return Object.freeze({
		createContext: () => new AudioContext({ latencyHint: 'interactive' }) as WebAudioContext,
		hasTransientActivation: () => navigator.userActivation?.isActive === true,
		loadRuntime: async () => {
			const { WebEngineRuntime: Runtime } = await import('./WebEngineRuntime.js')
			return new Runtime()
		}
	})
}

function success<Value>(value: Value): ApplicationResult<Value> {
	return Object.freeze({ ok: true as const, value })
}

function unavailable(message: string): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('ENGINE_UNAVAILABLE', message, {
			retryable: true,
			details: { diagnostic: 'audio.start-failed' }
		})
	})
}

function failedActivation(result: ApplicationResult<never>): PreparedWebEngineActivation {
	return Object.freeze({
		connect: () => Promise.resolve(result),
		cancel: () => Promise.resolve()
	})
}

export class DeferredWebEngineRuntime implements EngineRuntime {
	readonly #dependencies: DeferredWebEngineRuntimeDependencies
	readonly #eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
	readonly #healthListeners = new Set<(health: AudioHealthSnapshot) => void>()
	#connecting: Promise<ApplicationResult<EngineConnection>> | null = null
	#delegate: WebEngineRuntime | null = null

	public constructor(dependencies: DeferredWebEngineRuntimeDependencies = defaultDependencies()) {
		this.#dependencies = dependencies
	}

	public connect(): Promise<ApplicationResult<EngineConnection>> {
		if (this.#delegate !== null) return this.#delegate.connect()
		if (this.#connecting !== null) return this.#connecting
		return this.prepareActivation().connect()
	}

	public prepareActivation(): PreparedWebEngineActivation {
		if (!this.#dependencies.hasTransientActivation()) {
			const denied = Object.freeze({
				ok: false as const,
				error: applicationError(
					'PERMISSION_DENIED',
					'Use the audio control to enable audio.',
					{ retryable: true, details: { diagnostic: 'audio.suspended' } }
				)
			})
			return failedActivation(denied)
		}
		this.#delegate?.prepareForReplacement()
		let activation: PreparedWebAudioActivation
		try {
			const context = this.#dependencies.createContext()
			activation = Object.freeze({ context, resume: context.resume() })
			void activation.resume.catch(() => undefined)
		} catch {
			const rejected = unavailable('The browser rejected audio.')
			return failedActivation(rejected)
		}
		let connected = false
		return Object.freeze({
			connect: () => {
				connected = true
				this.#connecting = this.#loadAndConnect(activation).finally(() => {
					this.#connecting = null
				})
				return this.#connecting
			},
			cancel: async () => {
				if (!connected && activation.context.state !== 'closed') {
					await activation.context.close().catch(() => undefined)
				}
			}
		})
	}

	async #loadAndConnect(
		activation: PreparedWebAudioActivation
	): Promise<ApplicationResult<EngineConnection>> {
		try {
			let delegate = this.#delegate
			if (delegate === null) {
				delegate = await this.#dependencies.loadRuntime()
				this.#delegate = delegate
				delegate.onEvent((event) => {
					for (const listener of this.#eventListeners) listener(event)
				})
				delegate.onHealth((health) => {
					for (const listener of this.#healthListeners) listener(health)
				})
			}
			return await delegate.connectPrepared(activation)
		} catch {
			if (activation.context.state !== 'closed')
				await activation.context.close().catch(() => undefined)
			return unavailable('Web audio could not load.')
		}
	}

	public async disconnect(): Promise<ApplicationResult<null>> {
		if (this.#connecting !== null) await this.#connecting
		const result = await (this.#delegate?.disconnect() ?? Promise.resolve(success(null)))
		return result
	}

	public send(
		command: AnyEngineCommandEnvelope
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		return this.#delegate?.send(command) ?? Promise.resolve(unavailable('Enable audio first.'))
	}

	public onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void {
		this.#eventListeners.add(listener)
		return () => this.#eventListeners.delete(listener)
	}

	public getHealth(): Promise<ApplicationResult<AudioHealthSnapshot>> {
		return (
			this.#delegate?.getHealth() ??
			Promise.resolve(unavailable('Enable audio before reading its health.'))
		)
	}

	public onHealth(listener: (health: AudioHealthSnapshot) => void): () => void {
		this.#healthListeners.add(listener)
		return () => this.#healthListeners.delete(listener)
	}
}
