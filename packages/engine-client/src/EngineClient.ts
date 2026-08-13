import {
	applicationError,
	enginePatchModelVersion,
	engineProtocolVersion,
	engineRenderPlanVersion,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationResult,
	type EngineCapabilityCode,
	type EngineConnection,
	type EngineCommandPayloadByType,
	type EngineCommandType,
	type EngineProtocolFailure,
	type EngineRuntime
} from '../../contracts/src/index.js'

export type EngineClientState = 'disconnected' | 'connecting' | 'ready' | 'disconnecting'
export type EngineClientCommandType = Exclude<EngineCommandType, 'handshake'>

export type EngineClientConnection = EngineConnection & {
	readonly protocolVersion: typeof engineProtocolVersion
}

export interface EngineClientOptions {
	readonly capabilities?: readonly EngineCapabilityCode[]
	readonly createRequestId?: (sequence: number, type: EngineCommandType) => string
}

export type EngineEventListener = (event: AnyEngineEventEnvelope) => void
export type EngineFailureListener = (error: ApplicationError) => void

const defaultCapabilities = Object.freeze<readonly EngineCapabilityCode[]>(['protocol.typed-json'])

function success<Value>(value: Value): ApplicationResult<Value> {
	return Object.freeze({ ok: true as const, value })
}

function protocolError(
	failure: EngineProtocolFailure,
	source: 'command' | 'event'
): ApplicationError {
	return applicationError(
		failure.diagnostic === 'protocol.version-mismatch'
			? 'ENGINE_PROTOCOL_VERSION_MISMATCH'
			: source === 'command'
				? 'INVALID_REQUEST'
				: 'ENGINE_UNAVAILABLE',
		failure.message,
		{ details: { diagnostic: failure.diagnostic } }
	)
}

function stateError(state: EngineClientState, operation: string): ApplicationError {
	return applicationError(
		'INVALID_REQUEST',
		`Cannot ${operation} while the engine client is ${state}.`,
		{ details: { operation, state } }
	)
}

export class EngineClient {
	readonly #capabilities: readonly EngineCapabilityCode[]
	readonly #createRequestId: (sequence: number, type: EngineCommandType) => string
	readonly #eventListeners = new Set<EngineEventListener>()
	readonly #failureListeners = new Set<EngineFailureListener>()
	readonly #runtime: EngineRuntime
	#lastEventSequence = -1
	#lastFailure: ApplicationError | null = null
	#nextCommandSequence = 0
	#state: EngineClientState = 'disconnected'
	#unsubscribeRuntime: (() => void) | null = null

	public constructor(runtime: EngineRuntime, options: EngineClientOptions = {}) {
		this.#runtime = runtime
		this.#capabilities = Object.freeze([...(options.capabilities ?? defaultCapabilities)])
		this.#createRequestId =
			options.createRequestId ??
			((sequence, type) => `application-${type}-${String(sequence)}`)
	}

	public get state(): EngineClientState {
		return this.#state
	}

	public get lastFailure(): ApplicationError | null {
		return this.#lastFailure
	}

	public connect(): Promise<ApplicationResult<EngineClientConnection>> {
		if (this.#state !== 'disconnected') {
			return Promise.resolve(
				Object.freeze({ ok: false as const, error: stateError(this.#state, 'connect') })
			)
		}
		this.#beginConnection()
		try {
			return this.#completeConnection(this.#runtime.connect())
		} catch (error) {
			this.#releaseRuntimeSubscription()
			this.#state = 'disconnected'
			return Promise.reject(error)
		}
	}

	public connectPrepared(
		connection: EngineConnection
	): Promise<ApplicationResult<EngineClientConnection>> {
		if (this.#state !== 'disconnected') {
			return Promise.resolve(
				Object.freeze({ ok: false as const, error: stateError(this.#state, 'connect') })
			)
		}
		this.#beginConnection()
		return this.#completeConnection(Promise.resolve(success(connection)))
	}

	#beginConnection(): void {
		this.#state = 'connecting'
		this.#lastEventSequence = -1
		this.#lastFailure = null
		this.#nextCommandSequence = 0
		this.#unsubscribeRuntime = this.#runtime.onEvent((event) => this.#acceptEvent(event))
	}

	async #completeConnection(
		connection: Promise<ApplicationResult<EngineConnection>>
	): Promise<ApplicationResult<EngineClientConnection>> {
		const connected = await connection
		if (!connected.ok) {
			this.#releaseRuntimeSubscription()
			this.#state = 'disconnected'
			return connected
		}
		if (connected.value.protocolVersion !== engineProtocolVersion) {
			await this.#runtime.disconnect()
			this.#releaseRuntimeSubscription()
			this.#state = 'disconnected'
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'ENGINE_PROTOCOL_VERSION_MISMATCH',
					`Engine protocol ${String(connected.value.protocolVersion)} does not match ${String(engineProtocolVersion)}.`,
					{
						details: {
							actualVersion: connected.value.protocolVersion,
							expectedVersion: engineProtocolVersion
						}
					}
				)
			})
		}

		const handshake = await this.#dispatch('handshake', {
			protocolVersion: engineProtocolVersion,
			peer: 'application',
			renderPlanVersion: engineRenderPlanVersion,
			patchModelVersion: enginePatchModelVersion,
			capabilities: this.#capabilities
		})
		if (!handshake.ok) {
			await this.#runtime.disconnect()
			this.#releaseRuntimeSubscription()
			this.#state = 'disconnected'
			return handshake
		}

		this.#state = 'ready'
		return success(
			Object.freeze({
				protocolVersion: engineProtocolVersion,
				audioConfiguration: connected.value.audioConfiguration,
				capabilities: Object.freeze([...connected.value.capabilities])
			})
		)
	}

	public async disconnect(): Promise<ApplicationResult<null>> {
		if (this.#state === 'disconnected') return success(null)
		if (this.#state !== 'ready') {
			return Object.freeze({
				ok: false as const,
				error: stateError(this.#state, 'disconnect')
			})
		}
		this.#state = 'disconnecting'
		const result = await this.#runtime.disconnect()
		this.#releaseRuntimeSubscription()
		this.#state = 'disconnected'
		return result
	}

	public send<Type extends EngineClientCommandType>(
		type: Type,
		payload: EngineCommandPayloadByType[Type]
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		if (this.#state !== 'ready') {
			return Promise.resolve(
				Object.freeze({ ok: false as const, error: stateError(this.#state, 'send') })
			)
		}
		if ((type as EngineCommandType) === 'handshake') {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'INVALID_REQUEST',
						'Engine handshake is owned by EngineClient.connect().'
					)
				})
			)
		}
		return this.#dispatch(type, payload)
	}

	public onEvent(listener: EngineEventListener): () => void {
		this.#eventListeners.add(listener)
		return () => this.#eventListeners.delete(listener)
	}

	public onFailure(listener: EngineFailureListener): () => void {
		this.#failureListeners.add(listener)
		return () => this.#failureListeners.delete(listener)
	}

	async #dispatch<Type extends EngineCommandType>(
		type: Type,
		payload: EngineCommandPayloadByType[Type]
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		const sequence = this.#nextCommandSequence
		const validated = validateEngineCommandEnvelope({
			protocolVersion: engineProtocolVersion,
			requestId: this.#createRequestId(sequence, type),
			sequence,
			type,
			payload
		})
		if (!validated.ok) {
			return Object.freeze({
				ok: false as const,
				error: protocolError(validated, 'command')
			})
		}
		this.#nextCommandSequence += 1
		return this.#runtime.send(validated.value)
	}

	#acceptEvent(event: AnyEngineEventEnvelope): void {
		const validated = validateEngineEventEnvelope(event)
		if (!validated.ok) {
			this.#publishFailure(protocolError(validated, 'event'))
			return
		}
		if (validated.value.sequence <= this.#lastEventSequence) {
			this.#publishFailure(
				applicationError(
					'ENGINE_UNAVAILABLE',
					'Engine event sequence is replayed or out of order.',
					{
						details: {
							diagnostic: 'protocol.invalid-sequence',
							lastSequence: this.#lastEventSequence,
							receivedSequence: validated.value.sequence
						}
					}
				)
			)
			return
		}
		this.#lastEventSequence = validated.value.sequence
		for (const listener of this.#eventListeners) listener(validated.value)
	}

	#publishFailure(error: ApplicationError): void {
		this.#lastFailure = error
		for (const listener of this.#failureListeners) listener(error)
	}

	#releaseRuntimeSubscription(): void {
		this.#unsubscribeRuntime?.()
		this.#unsubscribeRuntime = null
	}
}
