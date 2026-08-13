import {
	applicationError,
	engineProtocolLimits,
	webWorkletCapabilityCodes,
	validateEngineEventEnvelope,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationResult,
	type EngineConnection
} from '../../../../packages/contracts/src/index.js'
import workletModuleUrl from './webEngineWorkletProcessor.js?worker&url'
import {
	hasWebEngineCommandCapacity,
	isWorkletToMainMessage,
	webEngineProcessorName,
	type WebEngineFatalCode,
	type WorkletToMainMessage
} from './webEngineWorkletProtocol.js'

const ABI_OK = 0
const ABI_INVALID = 1
const ABI_UNAVAILABLE = 2
const ABI_QUEUE_FULL = 3
const workletReadyTimeoutMs = 10_000
const commandTimeoutMs = 5_000

type EngineEventListener = (event: AnyEngineEventEnvelope) => void
type FatalListener = (error: ApplicationError) => void

export interface WebAudioWorkletAdapter {
	readonly connection: EngineConnection
	dispose(): void
	onEvent(listener: EngineEventListener): () => void
	onFatal(listener: FatalListener): () => void
	send(command: AnyEngineCommandEnvelope): Promise<ApplicationResult<{ readonly accepted: true }>>
}

interface PendingCommand {
	readonly resolve: (result: ApplicationResult<{ readonly accepted: true }>) => void
	readonly timeout: ReturnType<typeof globalThis.setTimeout>
}

function failureForResult(result: number): ApplicationError {
	if (result === ABI_INVALID) {
		return applicationError('INVALID_REQUEST', 'The Web audio engine rejected the command.', {
			details: { diagnostic: 'protocol.invalid-envelope' }
		})
	}
	if (result === ABI_QUEUE_FULL) {
		return applicationError('ENGINE_UNAVAILABLE', 'The Web audio control queue is saturated.', {
			retryable: true,
			details: { diagnostic: 'audio.render-overload' }
		})
	}
	return applicationError(
		'ENGINE_UNAVAILABLE',
		result === ABI_UNAVAILABLE
			? 'The Web audio processor is unavailable.'
			: 'The Web audio engine returned an unknown result.',
		{ retryable: true, details: { diagnostic: 'engine.unavailable' } }
	)
}

function fatalError(code: WebEngineFatalCode): ApplicationError {
	return applicationError('ENGINE_UNAVAILABLE', 'The Web audio processor stopped unexpectedly.', {
		retryable: true,
		details: {
			diagnostic: code === 'memory-growth' ? 'audio.render-overload' : 'audio.start-failed',
			workletFailure: code
		}
	})
}

export async function createWebAudioWorkletAdapter(
	context: AudioContext,
	generation: number
): Promise<WebAudioWorkletAdapter> {
	await context.audioWorklet.addModule(workletModuleUrl)
	const node = new AudioWorkletNode(context, webEngineProcessorName, {
		numberOfInputs: 0,
		numberOfOutputs: 1,
		outputChannelCount: [2],
		processorOptions: { generation }
	})
	const eventListeners = new Set<EngineEventListener>()
	const fatalListeners = new Set<FatalListener>()
	const pending = new Map<number, PendingCommand>()
	const encoder = new TextEncoder()
	const decoder = new TextDecoder('utf-8', { fatal: true })
	let disposed = false
	let fatal: ApplicationError | null = null
	let nextMessageId = 0
	let observationHandle: number | ReturnType<typeof globalThis.setTimeout> | null = null
	const pendingObservations = new Map<
		'meter-snapshot' | 'transport-snapshot',
		AnyEngineEventEnvelope
	>()
	let readyResolve:
		((message: Extract<WorkletToMainMessage, { readonly kind: 'ready' }>) => void) | null = null
	let readyReject: ((error: ApplicationError) => void) | null = null
	const ready = new Promise<Extract<WorkletToMainMessage, { readonly kind: 'ready' }>>(
		(resolve, reject) => {
			readyResolve = resolve
			readyReject = reject
		}
	)
	const readyTimeout = globalThis.setTimeout(() => {
		readyReject?.(
			applicationError(
				'ENGINE_UNAVAILABLE',
				'The Web audio processor did not become ready.',
				{
					retryable: true,
					details: { diagnostic: 'audio.start-failed' }
				}
			)
		)
	}, workletReadyTimeoutMs)

	function publishFatal(error: ApplicationError): void {
		if (fatal !== null || disposed) return
		fatal = error
		readyReject?.(error)
		for (const [messageId, command] of pending) {
			globalThis.clearTimeout(command.timeout)
			command.resolve(Object.freeze({ ok: false as const, error }))
			pending.delete(messageId)
		}
		for (const listener of fatalListeners) listener(error)
	}

	function publishEvent(event: AnyEngineEventEnvelope): void {
		for (const listener of eventListeners) listener(event)
	}

	function cancelObservationFlush(): void {
		if (observationHandle === null) return
		if (typeof globalThis.cancelAnimationFrame === 'function') {
			globalThis.cancelAnimationFrame(Number(observationHandle))
		} else {
			globalThis.clearTimeout(observationHandle)
		}
		observationHandle = null
	}

	function flushObservations(): void {
		cancelObservationFlush()
		const observations = [...pendingObservations.values()].sort(
			(left, right) => left.sequence - right.sequence
		)
		pendingObservations.clear()
		for (const event of observations) publishEvent(event)
	}

	function scheduleObservationFlush(): void {
		if (observationHandle !== null) return
		observationHandle =
			typeof globalThis.requestAnimationFrame === 'function'
				? globalThis.requestAnimationFrame(flushObservations)
				: globalThis.setTimeout(flushObservations, 16)
	}

	function acceptValidatedEvent(event: AnyEngineEventEnvelope): void {
		if (event.type === 'meter-snapshot' || event.type === 'transport-snapshot') {
			pendingObservations.set(event.type, event)
			scheduleObservationFlush()
			return
		}
		flushObservations()
		publishEvent(event)
	}

	function acceptEvent(bytes: ArrayBuffer): void {
		try {
			const parsed: unknown = JSON.parse(decoder.decode(bytes))
			const validated = validateEngineEventEnvelope(parsed)
			if (!validated.ok) {
				publishFatal(
					applicationError(
						'ENGINE_UNAVAILABLE',
						'The Web audio processor sent an invalid event.',
						{
							retryable: true,
							details: { diagnostic: validated.diagnostic }
						}
					)
				)
				return
			}
			acceptValidatedEvent(validated.value)
		} catch {
			publishFatal(
				applicationError(
					'ENGINE_UNAVAILABLE',
					'The Web audio processor event could not be decoded.',
					{
						retryable: true,
						details: { diagnostic: 'protocol.invalid-envelope' }
					}
				)
			)
		}
	}

	node.port.onmessage = (event: MessageEvent<unknown>) => {
		if (disposed) return
		if (!isWorkletToMainMessage(event.data)) {
			if (
				typeof event.data === 'object' &&
				event.data !== null &&
				'generation' in event.data &&
				event.data.generation === generation
			) {
				publishFatal(fatalError('invalid-message'))
			}
			return
		}
		const message = event.data
		if (message.generation !== generation) return
		if (message.kind === 'ready') {
			readyResolve?.(message)
			return
		}
		if (message.kind === 'fatal') {
			publishFatal(fatalError(message.code))
			return
		}
		if (message.kind === 'event') {
			acceptEvent(message.bytes)
			return
		}
		const command = pending.get(message.messageId)
		if (command === undefined) return
		pending.delete(message.messageId)
		globalThis.clearTimeout(command.timeout)
		command.resolve(
			message.result === ABI_OK
				? Object.freeze({
						ok: true as const,
						value: Object.freeze({ accepted: true as const })
					})
				: Object.freeze({ ok: false as const, error: failureForResult(message.result) })
		)
	}
	node.onprocessorerror = () => publishFatal(fatalError('processor-failure'))
	node.connect(context.destination)

	let readyMessage: Extract<WorkletToMainMessage, { readonly kind: 'ready' }>
	try {
		readyMessage = await ready
	} catch (error) {
		node.disconnect()
		node.port.close()
		throw error
	} finally {
		globalThis.clearTimeout(readyTimeout)
	}

	const connection = Object.freeze<EngineConnection>({
		protocolVersion: readyMessage.protocolVersion,
		capabilities: Object.freeze([...webWorkletCapabilityCodes]),
		audioConfiguration: Object.freeze({
			sampleRate: readyMessage.sampleRate,
			blockFrames: readyMessage.blockFrames,
			channels: 2 as const
		})
	})

	return Object.freeze({
		connection,
		dispose: () => {
			if (disposed) return
			disposed = true
			const message = Object.freeze({ kind: 'dispose' as const, generation })
			node.port.postMessage(message)
			node.port.onmessage = null
			node.onprocessorerror = null
			cancelObservationFlush()
			pendingObservations.clear()
			for (const command of pending.values()) {
				globalThis.clearTimeout(command.timeout)
				command.resolve(
					Object.freeze({
						ok: false as const,
						error: applicationError(
							'ENGINE_UNAVAILABLE',
							'The Web audio connection was closed.',
							{
								retryable: true
							}
						)
					})
				)
			}
			pending.clear()
			node.disconnect()
			node.port.close()
			eventListeners.clear()
			fatalListeners.clear()
		},
		onEvent: (listener: EngineEventListener) => {
			eventListeners.add(listener)
			return () => eventListeners.delete(listener)
		},
		onFatal: (listener: FatalListener) => {
			fatalListeners.add(listener)
			if (fatal !== null) listener(fatal)
			return () => fatalListeners.delete(listener)
		},
		send: async (command: AnyEngineCommandEnvelope) => {
			if (disposed || fatal !== null) {
				return Object.freeze({
					ok: false as const,
					error:
						fatal ??
						applicationError(
							'ENGINE_UNAVAILABLE',
							'The Web audio connection is closed.',
							{
								retryable: true
							}
						)
				})
			}
			if (!hasWebEngineCommandCapacity(pending.size)) {
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'ENGINE_UNAVAILABLE',
						'The bounded Web audio message queue is saturated.',
						{ retryable: true, details: { diagnostic: 'audio.render-overload' } }
					)
				})
			}
			const bytes = encoder.encode(JSON.stringify(command))
			if (bytes.byteLength === 0 || bytes.byteLength > engineProtocolLimits.maxFrameBytes) {
				return Object.freeze({
					ok: false as const,
					error: applicationError('LIMIT_EXCEEDED', 'The Web audio command is too large.')
				})
			}
			const messageId = nextMessageId
			nextMessageId += 1
			return await new Promise<ApplicationResult<{ readonly accepted: true }>>((resolve) => {
				const timeout = globalThis.setTimeout(() => {
					pending.delete(messageId)
					resolve(
						Object.freeze({
							ok: false as const,
							error: applicationError(
								'ENGINE_UNAVAILABLE',
								'The Web audio processor did not acknowledge the command.',
								{
									retryable: true,
									details: { diagnostic: 'audio.render-overload' }
								}
							)
						})
					)
				}, commandTimeoutMs)
				pending.set(messageId, { resolve, timeout })
				const buffer = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength
				) as ArrayBuffer
				node.port.postMessage({ kind: 'command', generation, messageId, bytes: buffer }, [
					buffer
				])
			})
		}
	})
}
