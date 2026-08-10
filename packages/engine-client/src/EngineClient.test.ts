import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	engineProtocolVersion,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationResult,
	type EngineCapabilityCode,
	type EngineRuntime
} from '../../contracts/src/index.js'
import { EngineClient } from './EngineClient.js'

class FakeEngineRuntime implements EngineRuntime {
	readonly commands: AnyEngineCommandEnvelope[] = []
	disconnectCount = 0
	listener: ((event: AnyEngineEventEnvelope) => void) | null = null

	public constructor(readonly connectedProtocolVersion: number = engineProtocolVersion) {}

	public async connect(): Promise<
		ApplicationResult<{
			readonly capabilities: readonly EngineCapabilityCode[]
			readonly protocolVersion: number
		}>
	> {
		return Object.freeze({
			ok: true as const,
			value: Object.freeze({
				protocolVersion: this.connectedProtocolVersion,
				capabilities: Object.freeze(['protocol.typed-json'] as const)
			})
		})
	}

	public async disconnect(): Promise<ApplicationResult<null>> {
		this.disconnectCount += 1
		return Object.freeze({ ok: true as const, value: null })
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

	public onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void {
		this.listener = listener
		return () => {
			if (this.listener === listener) this.listener = null
		}
	}

	public async getHealth(): Promise<ApplicationResult<never>> {
		return Object.freeze({
			ok: false as const,
			error: Object.freeze({
				code: 'ENGINE_UNAVAILABLE' as const,
				message: 'No health fixture.',
				retryable: false,
				details: null
			})
		})
	}

	public onHealth(): () => void {
		return () => undefined
	}

	public emit(event: AnyEngineEventEnvelope): void {
		this.listener?.(event)
	}
}

describe('EngineClient', () => {
	it('performs one compatible handshake and sends monotonic typed commands', async () => {
		const runtime = new FakeEngineRuntime()
		const client = new EngineClient(runtime)

		const connected = await client.connect()
		assert.deepEqual(connected, {
			ok: true,
			value: {
				protocolVersion: engineProtocolVersion,
				capabilities: ['protocol.typed-json']
			}
		})
		assert.equal(client.state, 'ready')
		assert.deepEqual(runtime.commands[0], {
			protocolVersion: engineProtocolVersion,
			requestId: 'application-handshake-0',
			sequence: 0,
			type: 'handshake',
			payload: {
				protocolVersion: engineProtocolVersion,
				peer: 'application',
				renderPlanVersion: 1,
				patchModelVersion: 1,
				capabilities: ['protocol.typed-json']
			}
		})

		assert.equal((await client.send('play', { startTick: 960 })).ok, true)
		assert.equal((await client.send('stop', {})).ok, true)
		assert.deepEqual(
			runtime.commands.map(({ sequence, type }) => ({ sequence, type })),
			[
				{ sequence: 0, type: 'handshake' },
				{ sequence: 1, type: 'play' },
				{ sequence: 2, type: 'stop' }
			]
		)
		assert.equal((await client.disconnect()).ok, true)
		assert.equal(client.state, 'disconnected')
		assert.equal(runtime.listener, null)
	})

	it('keeps event sequence separate from project revision evidence', async () => {
		const runtime = new FakeEngineRuntime()
		const client = new EngineClient(runtime)
		const events: AnyEngineEventEnvelope[] = []
		const failures: string[] = []
		client.onEvent((event) => events.push(event))
		client.onFailure((error) => failures.push(String(error.details?.diagnostic)))
		assert.equal((await client.connect()).ok, true)

		runtime.emit({
			protocolVersion: engineProtocolVersion,
			sequence: 4,
			type: 'render-plan-acknowledged',
			payload: { projectRevision: 12, planGeneration: 2 }
		})
		runtime.emit({
			protocolVersion: engineProtocolVersion,
			sequence: 5,
			type: 'offline-render-completed',
			payload: { renderId: 'render-1', projectRevision: 9, frameCount: 48_000 }
		})
		runtime.emit({
			protocolVersion: engineProtocolVersion,
			sequence: 5,
			type: 'render-plan-acknowledged',
			payload: { projectRevision: 13, planGeneration: 3 }
		})

		assert.deepEqual(
			events.map(({ payload, sequence }) => ({ payload, sequence })),
			[
				{
					sequence: 4,
					payload: { projectRevision: 12, planGeneration: 2 }
				},
				{
					sequence: 5,
					payload: {
						renderId: 'render-1',
						projectRevision: 9,
						frameCount: 48_000
					}
				}
			]
		)
		assert.deepEqual(failures, ['protocol.invalid-sequence'])
		assert.equal(client.lastFailure?.code, 'ENGINE_UNAVAILABLE')
	})

	it('disconnects and leaves no subscription after a protocol mismatch', async () => {
		const runtime = new FakeEngineRuntime(engineProtocolVersion + 1)
		const client = new EngineClient(runtime)
		const result = await client.connect()

		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.error.code, 'ENGINE_PROTOCOL_VERSION_MISMATCH')
		assert.equal(client.state, 'disconnected')
		assert.equal(runtime.disconnectCount, 1)
		assert.equal(runtime.listener, null)
		assert.deepEqual(runtime.commands, [])
	})

	it('fails a locally invalid handshake without sending an envelope', async () => {
		const runtime = new FakeEngineRuntime()
		const client = new EngineClient(runtime, {
			createRequestId: () => 'request id with spaces'
		})
		const result = await client.connect()

		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.error.code, 'INVALID_REQUEST')
		assert.equal(client.state, 'disconnected')
		assert.equal(runtime.disconnectCount, 1)
		assert.equal(runtime.listener, null)
		assert.deepEqual(runtime.commands, [])
	})

	it('rejects commands without connecting an unavailable runtime', async () => {
		const runtime = new FakeEngineRuntime()
		const client = new EngineClient(runtime)
		const result = await client.send('play', { startTick: 0 })

		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.error.code, 'INVALID_REQUEST')
		assert.deepEqual(runtime.commands, [])
	})
})
