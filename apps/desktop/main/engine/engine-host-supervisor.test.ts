import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import {
	enginePatchModelVersion,
	engineProtocolLimits,
	engineProtocolVersion,
	engineRenderPlanVersion,
	validateEngineCommandEnvelope,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type EngineCommandType,
	type EngineWireRenderPlan
} from '../../../../packages/contracts/src/index.js'
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

const capabilities = Object.freeze([
	'protocol.typed-json',
	'render-plan.full',
	'transport.basic',
	'transport.loop',
	'metronome.native',
	'synth.bass.deep',
	'audition.notes',
	'preview.programs',
	'diagnostics.health',
	'supervision.heartbeat',
	'audio.native.shared',
	'audio.devices'
])

const plan = JSON.parse(
	readFileSync(resolve('fixtures/engine-protocol/valid-bass-plan.json'), 'utf8')
) as EngineWireRenderPlan

type AcknowledgementMode = 'valid' | 'wrong-token' | 'wrong-version' | 'hang' | 'early-exit'

class FakeNativeHost extends EventEmitter {
	readonly pid: number
	readonly stdout = new PassThrough()
	readonly stderr = new PassThrough()
	readonly commands: AnyEngineCommandEnvelope[] = []
	readonly stdin: Writable
	exitCode: number | null = null
	killed = false
	killCount = 0
	killSucceeds = true
	closeOnShutdown = true
	respondToHeartbeat = true
	failWrites = false
	#eventSequence = 0
	#token = ''
	#mode: AcknowledgementMode

	public constructor(pid: number, mode: AcknowledgementMode = 'valid') {
		super()
		this.pid = pid
		this.#mode = mode
		const decoder = new NativeHostFrameDecoder((input) => this.#acceptCommand(input))
		this.stdin = new Writable({
			write: (chunk: Buffer, _encoding, complete) => {
				if (this.failWrites) {
					complete(new Error('Injected pipe failure.'))
					return
				}
				try {
					decoder.push(chunk)
					complete()
				} catch (error) {
					complete(
						error instanceof Error ? error : new Error('Injected decoder failure.')
					)
				}
			}
		})
	}

	public start(options: Parameters<NativeHostSpawn>[1]): void {
		this.#token = options.env[nativeHostTokenEnvironmentKey] ?? ''
		queueMicrotask(() => {
			if (this.#mode === 'hang') return
			if (this.#mode === 'early-exit') {
				this.exit(70)
				return
			}
			const digest = `sha256:${createHash('sha256')
				.update(this.#token, 'ascii')
				.digest('hex')
				.toUpperCase()}`
			this.stdout.write(
				encodeNativeHostFrame({
					bootstrapVersion:
						this.#mode === 'wrong-version'
							? nativeHostBootstrapVersion + 1
							: nativeHostBootstrapVersion,
					engineProtocolVersion,
					tokenDigest: this.#mode === 'wrong-token' ? `sha256:${'0'.repeat(64)}` : digest
				})
			)
		})
	}

	public kill(): boolean {
		this.killCount += 1
		this.killed = true
		if (!this.killSucceeds) return false
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

	public crash(): void {
		this.exit(101)
	}

	public emitMeter(leftPeak: number): void {
		this.#emitEvent('meter-snapshot', { leftPeak, rightPeak: leftPeak })
	}

	#acceptCommand(input: unknown): void {
		const command = validateEngineCommandEnvelope(input)
		if (!command.ok) throw new Error(command.message)
		this.commands.push(command.value)
		switch (command.value.type) {
			case 'handshake':
				this.#emitEvent('ready', { protocolVersion: engineProtocolVersion })
				this.#emitEvent('capabilities', { capabilities, limits: engineProtocolLimits })
				break
			case 'load-render-plan':
				this.#emitEvent('render-plan-acknowledged', {
					planGeneration: 1,
					projectRevision: command.value.payload.plan.projectRevision
				})
				break
			case 'ping':
				if (this.respondToHeartbeat) {
					this.#emitEvent('pong', { heartbeatId: command.value.payload.heartbeatId })
				}
				break
			case 'shutdown':
				if (this.closeOnShutdown) this.exit(0)
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

function command(
	sequence: number,
	type: EngineCommandType,
	payload: unknown
): AnyEngineCommandEnvelope {
	const validated = validateEngineCommandEnvelope({
		protocolVersion: engineProtocolVersion,
		requestId: `test-${String(sequence)}-${type}`,
		sequence,
		type,
		payload
	})
	if (!validated.ok) throw new Error(validated.message)
	return validated.value
}

function handshake(sequence = 0): AnyEngineCommandEnvelope {
	return command(sequence, 'handshake', {
		protocolVersion: engineProtocolVersion,
		peer: 'application',
		renderPlanVersion: engineRenderPlanVersion,
		patchModelVersion: enginePatchModelVersion,
		capabilities
	})
}

function supervisorWith(
	spawnHost: NativeHostSpawn,
	overrides: Record<string, number> = {}
): EngineHostSupervisor {
	return new EngineHostSupervisor({
		approvedRoot: resolve('build', 'native'),
		executablePath: resolve('build', 'native', 'fixture-host.exe'),
		spawnHost,
		createToken: () => '0123456789ABCDEF0123456789ABCDEF',
		limits: {
			startupTimeoutMs: 40,
			heartbeatIntervalMs: 10,
			heartbeatFailureMs: 35,
			gracefulShutdownMs: 20,
			forcedCleanupConfirmationMs: 20,
			maxRendererEventsPerSecond: 30,
			...overrides
		}
	})
}

function spawning(children: FakeNativeHost[]): NativeHostSpawn {
	let index = 0
	return (_executablePath, options) => {
		const child = children[index++]
		if (child === undefined) throw new Error('Unexpected extra native host spawn.')
		child.start(options)
		return child as unknown as NativeHostChild
	}
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error('Condition did not become true.')
		await delay(5)
	}
}

describe('EngineHostSupervisor', () => {
	it('shares startup, validates bootstrap and coalesces renderer meter events', async () => {
		const child = new FakeNativeHost(4101)
		const supervisor = supervisorWith(spawning([child]))
		const first = supervisor.connect()
		const second = supervisor.connect()
		assert.equal(first, second)
		assert.equal((await first).ok, true)
		assert.equal((await supervisor.send(handshake())).ok, true)

		const events: AnyEngineEventEnvelope[] = []
		const remove = supervisor.onEvent((event) => events.push(event))
		for (let index = 0; index < 100; index += 1) child.emitMeter(index / 100)
		await delay(45)
		assert.equal(events.length, 1)
		assert.equal(
			(events[0] as unknown as { payload: { leftPeak: number } }).payload.leftPeak,
			0.99
		)
		remove()
		const released = supervisor.releaseRenderer()
		assert.equal(released, supervisor.disconnect())
		assert.equal((await released).ok, true)
		assert.deepEqual(supervisor.resourceSnapshot, {
			activeProcess: false,
			coalesceTimer: false,
			eventListeners: 0,
			healthListeners: 0,
			heartbeatTimer: false,
			pendingWrites: 0,
			retainedStderrBytes: 0
		})
	})

	it('rejects missing, wrong-token, wrong-version, early-exit and hung startup', async () => {
		const missing = supervisorWith(() => {
			throw new Error('missing')
		})
		assert.equal((await missing.connect()).ok, false)

		for (const mode of ['wrong-token', 'wrong-version', 'early-exit', 'hang'] as const) {
			const child = new FakeNativeHost(4200 + mode.length, mode)
			const supervisor = supervisorWith(spawning([child]))
			assert.equal((await supervisor.connect()).ok, false)
			assert.equal(child.killCount, mode === 'early-exit' ? 0 : 1)
			assert.equal(supervisor.resourceSnapshot.activeProcess, false)
		}
	})

	it('fails a broken pipe and a missing heartbeat without leaving the owned child', async () => {
		const pipeChild = new FakeNativeHost(4301)
		const pipeSupervisor = supervisorWith(spawning([pipeChild]), {
			maxAutomaticRestartsPerEpisode: 0
		})
		assert.equal((await pipeSupervisor.connect()).ok, true)
		assert.equal((await pipeSupervisor.send(handshake())).ok, true)
		pipeChild.failWrites = true
		assert.equal((await pipeSupervisor.send(command(1, 'stop', {}))).ok, false)
		await waitFor(() => pipeSupervisor.state === 'failed')
		assert.equal(pipeSupervisor.resourceSnapshot.activeProcess, false)

		const hungChild = new FakeNativeHost(4302)
		hungChild.respondToHeartbeat = false
		const hungSupervisor = supervisorWith(spawning([hungChild]), {
			maxAutomaticRestartsPerEpisode: 0
		})
		assert.equal((await hungSupervisor.connect()).ok, true)
		assert.equal((await hungSupervisor.send(handshake())).ok, true)
		await waitFor(() => hungSupervisor.state === 'failed')
		assert.equal(hungChild.killCount, 1)
		assert.equal(hungSupervisor.resourceSnapshot.activeProcess, false)
	})

	it('restarts once, re-handshakes and acknowledges the latest plan before ready', async () => {
		const first = new FakeNativeHost(4401)
		const second = new FakeNativeHost(4402)
		const supervisor = supervisorWith(spawning([first, second]))
		assert.equal((await supervisor.connect()).ok, true)
		assert.equal((await supervisor.send(handshake())).ok, true)
		assert.equal((await supervisor.send(command(1, 'load-render-plan', { plan }))).ok, true)
		first.crash()
		await waitFor(() => supervisor.state === 'ready' && second.commands.length >= 2)
		assert.deepEqual(
			second.commands.slice(0, 2).map((entry) => entry.type),
			['handshake', 'load-render-plan']
		)
		assert.equal((await supervisor.disconnect()).ok, true)
	})

	it('uses the exact child handle across PID reuse and fails closed if cleanup cannot be proven', async () => {
		const owned = new FakeNativeHost(4501)
		const foreign = new FakeNativeHost(4501)
		const supervisor = supervisorWith(spawning([owned]))
		assert.equal((await supervisor.connect()).ok, true)
		assert.equal((await supervisor.send(handshake())).ok, true)
		owned.respondToHeartbeat = false
		await waitFor(() => supervisor.state === 'failed')
		assert.equal(owned.killCount, 1)
		assert.equal(foreign.killCount, 0)

		const unkillable = new FakeNativeHost(4502)
		unkillable.killSucceeds = false
		unkillable.closeOnShutdown = false
		const blocked = supervisorWith(spawning([unkillable]))
		assert.equal((await blocked.connect()).ok, true)
		assert.equal((await blocked.send(handshake())).ok, true)
		const result = await blocked.disconnect()
		assert.equal(result.ok, false)
		assert.equal(blocked.state, 'failed')
		assert.equal(blocked.identity?.pid, unkillable.pid)
		assert.equal(blocked.resourceSnapshot.activeProcess, true)
	})
})
