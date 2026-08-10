import { validateEngineCommandEnvelope } from './engine-command-validation.js'
import { type AnyEngineCommandEnvelope, type EngineProtocolResult } from './engine-protocol-dtos.js'
import { protocolFailure } from './engine-protocol-validation.js'

export type EngineProtocolSessionState = 'awaiting-handshake' | 'ready' | 'terminated'

export class EngineProtocolSession {
	#lastSequence = -1
	#state: EngineProtocolSessionState = 'awaiting-handshake'

	public get state(): EngineProtocolSessionState {
		return this.#state
	}

	public accept(input: unknown): EngineProtocolResult<AnyEngineCommandEnvelope> {
		if (this.#state === 'terminated') {
			return protocolFailure('protocol.invalid-envelope', 'Protocol session is terminated.')
		}
		const result = validateEngineCommandEnvelope(input)
		if (!result.ok) {
			if (
				this.#state === 'awaiting-handshake' ||
				result.diagnostic === 'protocol.version-mismatch'
			) {
				this.#state = 'terminated'
			}
			return result
		}
		if (result.value.sequence <= this.#lastSequence) {
			return protocolFailure(
				'protocol.invalid-sequence',
				'Engine command sequence is replayed or out of order.'
			)
		}
		if (this.#state === 'awaiting-handshake' && result.value.type !== 'handshake') {
			this.#state = 'terminated'
			return protocolFailure(
				'protocol.invalid-envelope',
				'Handshake must be the first command.'
			)
		}
		if (this.#state === 'ready' && result.value.type === 'handshake') {
			return protocolFailure('protocol.invalid-envelope', 'Handshake is already complete.')
		}
		this.#lastSequence = result.value.sequence
		if (result.value.type === 'handshake') this.#state = 'ready'
		return result
	}

	public terminate(): void {
		this.#state = 'terminated'
	}
}
