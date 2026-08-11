import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import type { Writable } from 'node:stream'
import {
	applicationError,
	engineProtocolVersion,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	type AnyEngineCommandEnvelope,
	type AnyEngineEventEnvelope,
	type ApplicationResult,
	type AudioHealthSnapshot,
	type EngineCapabilityCode,
	type EngineConnection,
	type EngineHandshake
} from '../../../../packages/contracts/src/index.js'
import {
	nativeHostOperationalLimits,
	nativeHostTokenBytes,
	nativeHostTokenEnvironmentKey,
	validateNativeHostBootstrapAcknowledgement
} from '../../host/native-host-contract.js'
import { encodeNativeHostFrame, NativeHostFrameDecoder } from './framed-json-transport.js'

const nativeHostCapabilities = Object.freeze<readonly EngineCapabilityCode[]>([
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

const maximumPendingWrites = 64
const pipeWriteTimeoutMs = 2_000

export type EngineHostState =
	'disconnected' | 'starting' | 'ready' | 'restarting' | 'stopping' | 'failed'

export interface NativeHostIdentity {
	readonly createdAtMs: number
	readonly executablePath: string
	readonly parentPid: number
	readonly pid: number
	readonly tokenDigest: `sha256:${string}`
}

export type NativeHostChild = Pick<
	ChildProcessWithoutNullStreams,
	'pid' | 'stdin' | 'stdout' | 'stderr' | 'exitCode' | 'killed' | 'kill' | 'on' | 'once'
>

export type NativeHostSpawn = (
	executablePath: string,
	options: {
		readonly env: NodeJS.ProcessEnv
		readonly shell: false
		readonly stdio: readonly ['pipe', 'pipe', 'pipe']
		readonly windowsHide: true
	}
) => NativeHostChild

interface SupervisorLimits {
	readonly forcedCleanupConfirmationMs: number
	readonly gracefulShutdownMs: number
	readonly heartbeatFailureMs: number
	readonly heartbeatIntervalMs: number
	readonly maxAutomaticRestartsPerEpisode: number
	readonly maxRendererEventsPerSecond: number
	readonly maxRetainedStderrBytes: number
	readonly startupTimeoutMs: number
}

export interface EngineHostSupervisorOptions {
	readonly executablePath: string
	readonly approvedRoot: string
	readonly spawnHost?: NativeHostSpawn
	readonly createToken?: () => string
	readonly now?: () => number
	readonly limits?: Partial<SupervisorLimits>
}

interface Deferred<Value> {
	readonly promise: Promise<Value>
	resolve(value: Value): void
	reject(reason: Error): void
}

interface ActiveHost {
	readonly child: NativeHostChild
	decoder: NativeHostFrameDecoder
	readonly epoch: number
	readonly identity: NativeHostIdentity
	readonly tokenDigest: `sha256:${string}`
	bootstrapAccepted: boolean
	capabilitiesAccepted: boolean
	expectedExit: boolean
	lastEventSequence: number
	protocolReady: boolean
}

function deferred<Value>(): Deferred<Value> {
	let resolve: (value: Value) => void = () => undefined
	let reject: (reason: Error) => void = () => undefined
	const promise = new Promise<Value>((accept, decline) => {
		resolve = accept
		reject = decline
	})
	return { promise, resolve, reject }
}

function success<Value>(value: Value): ApplicationResult<Value> {
	return Object.freeze({ ok: true as const, value })
}

function engineFailure(message: string, retryable = true): ApplicationResult<never> {
	return Object.freeze({
		ok: false as const,
		error: applicationError('ENGINE_UNAVAILABLE', message, { retryable })
	})
}

function digestToken(token: string): `sha256:${string}` {
	return `sha256:${createHash('sha256').update(token, 'ascii').digest('hex').toUpperCase()}`
}

function defaultSpawn(
	executablePath: string,
	options: Parameters<NativeHostSpawn>[1]
): NativeHostChild {
	return spawn(executablePath, [], {
		env: options.env,
		shell: options.shell,
		stdio: [...options.stdio],
		windowsHide: options.windowsHide
	})
}

function initialHealth(state: AudioHealthSnapshot['backendState']): AudioHealthSnapshot {
	return Object.freeze({
		activeDeviceId: null,
		activeVoices: 0,
		backendState: state,
		blockFrames: null,
		deviceState: 'unavailable' as const,
		mode: null,
		outputMuted: true,
		outputSignalObserved: false,
		projectRevision: null,
		sampleRate: null,
		underruns: 0
	})
}

function visibleDiagnosticText(value: string): string {
	return [...value]
		.filter((character) => {
			const code = character.charCodeAt(0)
			return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
		})
		.join('')
}

export class EngineHostSupervisor {
	readonly #approvedRoot: string
	readonly #createToken: () => string
	readonly #eventListeners = new Set<(event: AnyEngineEventEnvelope) => void>()
	readonly #executablePath: string
	readonly #healthListeners = new Set<(health: AudioHealthSnapshot) => void>()
	readonly #limits: SupervisorLimits
	readonly #now: () => number
	readonly #spawnHost: NativeHostSpawn
	#active: ActiveHost | null = null
	#coalescedEvents = new Map<AnyEngineEventEnvelope['type'], AnyEngineEventEnvelope>()
	#coalesceTimer: ReturnType<typeof setInterval> | null = null
	#connectPromise: Promise<ApplicationResult<EngineConnection>> | null = null
	#disconnectPromise: Promise<ApplicationResult<null>> | null = null
	#epoch = 0
	#handshake: EngineHandshake | null = null
	#handshakeWaiter: Deferred<void> | null = null
	#health: AudioHealthSnapshot = initialHealth('disconnected')
	#heartbeatId: string | null = null
	#heartbeatTimer: ReturnType<typeof setInterval> | null = null
	#lastPongAt = 0
	#lastRendererSequence = -1
	#latestPlan: AnyEngineCommandEnvelope | null = null
	#nextHostSequence = 0
	#nextRendererEventSequence = 0
	#pendingWrites = 0
	#planAcknowledgement: { readonly revision: number; readonly waiter: Deferred<void> } | null =
		null
	#restartsUsed = 0
	#state: EngineHostState = 'disconnected'
	#stderr = Buffer.alloc(0)

	public constructor(options: EngineHostSupervisorOptions) {
		this.#approvedRoot = options.approvedRoot
		this.#executablePath = options.executablePath
		this.#spawnHost = options.spawnHost ?? defaultSpawn
		this.#createToken =
			options.createToken ?? (() => randomBytes(nativeHostTokenBytes).toString('base64url'))
		this.#now = options.now ?? Date.now
		this.#limits = Object.freeze({ ...nativeHostOperationalLimits, ...options.limits })
		const child = relative(this.#approvedRoot, this.#executablePath)
		if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
			throw new Error('Native host executable is outside its approved root.')
		}
	}

	public get state(): EngineHostState {
		return this.#state
	}

	public get identity(): NativeHostIdentity | null {
		return this.#active?.identity ?? null
	}

	public get resourceSnapshot(): Readonly<{
		activeProcess: boolean
		coalesceTimer: boolean
		eventListeners: number
		healthListeners: number
		heartbeatTimer: boolean
		pendingWrites: number
		retainedStderrBytes: number
	}> {
		return Object.freeze({
			activeProcess: this.#active !== null,
			coalesceTimer: this.#coalesceTimer !== null,
			eventListeners: this.#eventListeners.size,
			healthListeners: this.#healthListeners.size,
			heartbeatTimer: this.#heartbeatTimer !== null,
			pendingWrites: this.#pendingWrites,
			retainedStderrBytes: this.#stderr.byteLength
		})
	}

	public connect(): Promise<ApplicationResult<EngineConnection>> {
		if (this.#connectPromise !== null) return this.#connectPromise
		if (this.#state === 'stopping') {
			return Promise.resolve(engineFailure('The native audio engine is stopping.'))
		}
		if (this.#active?.bootstrapAccepted === true) {
			return Promise.resolve(
				success(
					Object.freeze({
						capabilities: nativeHostCapabilities,
						protocolVersion: engineProtocolVersion
					})
				)
			)
		}
		this.#resetRendererSession()
		this.#state = 'starting'
		this.#publishHealth(initialHealth('starting'))
		this.#connectPromise = this.#launch()
			.then(() =>
				success(
					Object.freeze({
						capabilities: nativeHostCapabilities,
						protocolVersion: engineProtocolVersion
					})
				)
			)
			.catch(() => engineFailure('The native audio engine could not start.'))
			.finally(() => {
				this.#connectPromise = null
			})
		return this.#connectPromise
	}

	public disconnect(): Promise<ApplicationResult<null>> {
		if (this.#disconnectPromise !== null) return this.#disconnectPromise
		this.#disconnectPromise = this.#disconnect().finally(() => {
			this.#disconnectPromise = null
		})
		return this.#disconnectPromise
	}

	async #disconnect(): Promise<ApplicationResult<null>> {
		if (this.#active === null) {
			this.#state = 'disconnected'
			this.#publishHealth(initialHealth('disconnected'))
			return success(null)
		}
		this.#state = 'stopping'
		this.#stopHeartbeat()
		this.#stopCoalescing()
		const active = this.#active
		active.expectedExit = true
		try {
			if (active.protocolReady) {
				await this.#writeCommand(active, 'shutdown', {})
			}
			await this.#waitForExit(active, this.#limits.gracefulShutdownMs)
		} catch {
			const cleaned = await this.#forceStopExact(active)
			if (!cleaned) {
				this.#state = 'failed'
				this.#publishHealth(initialHealth('failed'))
				return engineFailure('The native audio engine did not stop cleanly.', false)
			}
		}
		this.#releaseActive(active)
		this.#state = 'disconnected'
		this.#publishHealth(initialHealth('disconnected'))
		return success(null)
	}

	public async send(
		command: AnyEngineCommandEnvelope
	): Promise<ApplicationResult<{ readonly accepted: true }>> {
		const validated = validateEngineCommandEnvelope(command)
		if (!validated.ok) {
			return Object.freeze({
				ok: false as const,
				error: applicationError('INVALID_REQUEST', validated.message)
			})
		}
		const active = this.#active
		if (active === null || !active.bootstrapAccepted) {
			return engineFailure('The native audio engine is unavailable.')
		}
		if (
			validated.value.sequence <= this.#lastRendererSequence ||
			(this.#lastRendererSequence < 0 && validated.value.type !== 'handshake') ||
			(this.#lastRendererSequence >= 0 && validated.value.type === 'handshake')
		) {
			return Object.freeze({
				ok: false as const,
				error: applicationError('INVALID_REQUEST', 'Engine command sequence is invalid.')
			})
		}
		this.#lastRendererSequence = validated.value.sequence
		let handshakeWaiter: Deferred<void> | null = null
		if (validated.value.type === 'handshake') {
			this.#handshake = validated.value.payload
			handshakeWaiter = deferred<void>()
			this.#handshakeWaiter = handshakeWaiter
		}
		if (validated.value.type === 'load-render-plan') this.#latestPlan = validated.value
		try {
			await this.#writeCommand(active, validated.value.type, validated.value.payload)
			if (validated.value.type === 'handshake' && handshakeWaiter !== null) {
				await this.#withTimeout(
					handshakeWaiter.promise,
					this.#limits.startupTimeoutMs,
					'Native host handshake timed out.'
				)
				this.#state = 'ready'
				this.#startHeartbeat()
				this.#startCoalescing()
			}
			return success(Object.freeze({ accepted: true as const }))
		} catch {
			void this.#handleFailure(active)
			return engineFailure('The native audio engine rejected the command.')
		}
	}

	public getHealth(): ApplicationResult<AudioHealthSnapshot> {
		return success(this.#health)
	}

	public onEvent(listener: (event: AnyEngineEventEnvelope) => void): () => void {
		this.#eventListeners.add(listener)
		return () => this.#eventListeners.delete(listener)
	}

	public onHealth(listener: (health: AudioHealthSnapshot) => void): () => void {
		this.#healthListeners.add(listener)
		return () => this.#healthListeners.delete(listener)
	}

	public releaseRenderer(): Promise<ApplicationResult<null>> {
		this.#eventListeners.clear()
		this.#healthListeners.clear()
		return this.disconnect()
	}

	async #launch(): Promise<void> {
		const token = this.#createToken()
		if (
			token.length < nativeHostTokenBytes ||
			token.length > 256 ||
			!/^[-_A-Za-z0-9]+$/u.test(token)
		) {
			throw new Error('Native host token factory returned an invalid token.')
		}
		const tokenDigest = digestToken(token)
		const child = this.#spawnHost(this.#executablePath, {
			env: { ...process.env, [nativeHostTokenEnvironmentKey]: token },
			shell: false,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		})
		if (child.pid === undefined)
			throw new Error('Native host did not expose a process identity.')
		const epoch = ++this.#epoch
		const bootstrapped = deferred<void>()
		const active: ActiveHost = {
			child,
			epoch,
			identity: Object.freeze({
				createdAtMs: this.#now(),
				executablePath: this.#executablePath,
				parentPid: process.pid,
				pid: child.pid,
				tokenDigest
			}),
			tokenDigest,
			bootstrapAccepted: false,
			capabilitiesAccepted: false,
			expectedExit: false,
			lastEventSequence: -1,
			protocolReady: false,
			decoder: null as unknown as NativeHostFrameDecoder
		}
		active.decoder = new NativeHostFrameDecoder((value) => {
			if (!active.bootstrapAccepted) {
				if (!validateNativeHostBootstrapAcknowledgement(value, tokenDigest)) {
					throw new Error('Native host bootstrap acknowledgement is invalid.')
				}
				active.bootstrapAccepted = true
				bootstrapped.resolve()
				return
			}
			this.#acceptEvent(active, value)
		})
		this.#active = active
		child.stdout.on('data', (chunk: Buffer) => {
			try {
				active.decoder.push(chunk)
			} catch {
				bootstrapped.reject(new Error('Native host framing failed.'))
				if (active.bootstrapAccepted) void this.#handleFailure(active)
			}
		})
		child.stdout.on('end', () => {
			try {
				active.decoder.finish()
			} catch {
				bootstrapped.reject(new Error('Native host stream ended mid-frame.'))
			}
			if (active.bootstrapAccepted && !active.expectedExit) void this.#handleFailure(active)
		})
		child.stderr.on('data', (chunk: Buffer) => this.#captureStderr(chunk))
		child.stdin.on('error', () => {
			bootstrapped.reject(new Error('Native host input pipe failed.'))
			if (active.bootstrapAccepted) void this.#handleFailure(active)
		})
		child.stdout.on('error', () => {
			bootstrapped.reject(new Error('Native host output pipe failed.'))
			if (active.bootstrapAccepted) void this.#handleFailure(active)
		})
		child.stderr.on('error', () => {
			if (active.bootstrapAccepted) void this.#handleFailure(active)
		})
		child.on('error', () => {
			bootstrapped.reject(new Error('Native host process failed.'))
			if (active.bootstrapAccepted) void this.#handleFailure(active)
		})
		child.once('exit', () => {
			if (!active.bootstrapAccepted)
				bootstrapped.reject(new Error('Native host exited early.'))
			else if (!active.expectedExit) void this.#handleFailure(active)
		})
		try {
			await this.#withTimeout(
				bootstrapped.promise,
				this.#limits.startupTimeoutMs,
				'Native host bootstrap timed out.'
			)
		} catch (error) {
			active.expectedExit = true
			await this.#forceStopExact(active)
			this.#releaseActive(active)
			throw error
		}
	}

	#acceptEvent(active: ActiveHost, input: unknown): void {
		if (this.#active !== active) return
		const validated = validateEngineEventEnvelope(input)
		if (!validated.ok || validated.value.sequence <= active.lastEventSequence) {
			throw new Error('Native host emitted an invalid event envelope.')
		}
		const event = validated.value
		active.lastEventSequence = event.sequence
		if (event.type === 'ready') active.protocolReady = true
		if (event.type === 'capabilities') active.capabilitiesAccepted = true
		if (active.protocolReady && active.capabilitiesAccepted) this.#handshakeWaiter?.resolve()
		if (event.type === 'pong' && event.payload.heartbeatId === this.#heartbeatId) {
			this.#lastPongAt = this.#now()
			return
		}
		if (
			event.type === 'render-plan-acknowledged' &&
			this.#planAcknowledgement?.revision === event.payload.projectRevision
		) {
			this.#planAcknowledgement.waiter.resolve()
		}
		if (event.type === 'audio-health') {
			this.#publishHealth(Object.freeze({ ...event.payload }))
		}
		if (event.type === 'transport-snapshot' || event.type === 'meter-snapshot') {
			this.#coalescedEvents.set(event.type, event)
			return
		}
		this.#publishEvent(event)
	}

	#publishEvent(event: AnyEngineEventEnvelope): void {
		const resequenced = Object.freeze({
			...event,
			sequence: this.#nextRendererEventSequence++
		}) as AnyEngineEventEnvelope
		for (const listener of this.#eventListeners) {
			try {
				listener(resequenced)
			} catch {
				// Renderer listeners do not own the native host lifecycle.
			}
		}
	}

	#publishHealth(health: AudioHealthSnapshot): void {
		this.#health = health
		for (const listener of this.#healthListeners) {
			try {
				listener(health)
			} catch {
				// Renderer listeners do not own the native host lifecycle.
			}
		}
	}

	#startCoalescing(): void {
		this.#stopCoalescing()
		const interval = Math.ceil(1_000 / this.#limits.maxRendererEventsPerSecond)
		this.#coalesceTimer = setInterval(() => {
			const pending = [...this.#coalescedEvents.values()].sort(
				(a, b) => a.sequence - b.sequence
			)
			this.#coalescedEvents.clear()
			for (const event of pending) this.#publishEvent(event)
		}, interval)
		this.#coalesceTimer.unref()
	}

	#stopCoalescing(): void {
		if (this.#coalesceTimer !== null) clearInterval(this.#coalesceTimer)
		this.#coalesceTimer = null
		this.#coalescedEvents.clear()
	}

	#startHeartbeat(): void {
		this.#stopHeartbeat()
		this.#lastPongAt = this.#now()
		this.#heartbeatTimer = setInterval(() => {
			const active = this.#active
			if (active === null || !active.protocolReady) return
			if (this.#now() - this.#lastPongAt >= this.#limits.heartbeatFailureMs) {
				void this.#handleFailure(active)
				return
			}
			this.#heartbeatId = `supervisor-heartbeat-${String(active.epoch)}-${String(this.#nextHostSequence)}`
			void this.#writeCommand(active, 'ping', { heartbeatId: this.#heartbeatId }).catch(() =>
				this.#handleFailure(active)
			)
		}, this.#limits.heartbeatIntervalMs)
		this.#heartbeatTimer.unref()
	}

	#stopHeartbeat(): void {
		if (this.#heartbeatTimer !== null) clearInterval(this.#heartbeatTimer)
		this.#heartbeatTimer = null
		this.#heartbeatId = null
	}

	async #writeCommand(
		active: ActiveHost,
		type: AnyEngineCommandEnvelope['type'],
		payload: AnyEngineCommandEnvelope['payload']
	): Promise<void> {
		if (this.#active !== active || active.child.exitCode !== null) {
			throw new Error('Native host pipe is unavailable.')
		}
		if (this.#pendingWrites >= maximumPendingWrites) {
			throw new Error('Native host command queue is full.')
		}
		const sequence = this.#nextHostSequence++
		const command = validateEngineCommandEnvelope({
			protocolVersion: engineProtocolVersion,
			requestId: `supervisor-${String(active.epoch)}-${String(sequence)}-${type}`,
			sequence,
			type,
			payload
		})
		if (!command.ok) throw new Error(command.message)
		this.#pendingWrites += 1
		try {
			await this.#writeFrame(active.child.stdin, encodeNativeHostFrame(command.value))
		} finally {
			this.#pendingWrites -= 1
		}
	}

	#writeFrame(stream: Writable, frame: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Native host pipe write timed out.')),
				pipeWriteTimeoutMs
			)
			stream.write(frame, (error) => {
				clearTimeout(timeout)
				if (error === null || error === undefined) resolve()
				else reject(error)
			})
		})
	}

	async #handleFailure(active: ActiveHost): Promise<void> {
		if (this.#active !== active || active.expectedExit || this.#state === 'stopping') return
		active.expectedExit = true
		this.#stopHeartbeat()
		this.#stopCoalescing()
		this.#handshakeWaiter?.reject(new Error('Native host failed during handshake.'))
		this.#handshakeWaiter = null
		this.#planAcknowledgement?.waiter.reject(
			new Error('Native host failed during plan activation.')
		)
		this.#planAcknowledgement = null
		await this.#forceStopExact(active)
		this.#releaseActive(active)
		const mayRestart =
			this.#handshake !== null &&
			this.#restartsUsed < this.#limits.maxAutomaticRestartsPerEpisode
		if (!mayRestart) {
			this.#state = 'failed'
			this.#publishHealth(initialHealth('failed'))
			return
		}
		this.#restartsUsed += 1
		this.#state = 'restarting'
		this.#publishHealth(initialHealth('restarting'))
		try {
			await this.#launch()
			const restarted = this.#active
			if (restarted === null || this.#handshake === null)
				throw new Error('Restart did not launch.')
			this.#handshakeWaiter = deferred<void>()
			await this.#writeCommand(restarted, 'handshake', this.#handshake)
			await this.#withTimeout(
				this.#handshakeWaiter.promise,
				this.#limits.startupTimeoutMs,
				'Restart handshake timed out.'
			)
			if (this.#latestPlan?.type === 'load-render-plan') {
				const planWaiter = deferred<void>()
				this.#planAcknowledgement = {
					revision: this.#latestPlan.payload.plan.projectRevision,
					waiter: planWaiter
				}
				await this.#writeCommand(restarted, 'load-render-plan', this.#latestPlan.payload)
				await this.#withTimeout(
					planWaiter.promise,
					this.#limits.startupTimeoutMs,
					'Restarted native host did not activate the latest plan.'
				)
				this.#planAcknowledgement = null
			}
			this.#state = 'ready'
			this.#startHeartbeat()
			this.#startCoalescing()
		} catch {
			const restarted = this.#active
			if (restarted !== null) {
				restarted.expectedExit = true
				await this.#forceStopExact(restarted)
				this.#releaseActive(restarted)
			}
			this.#state = 'failed'
			this.#publishHealth(initialHealth('failed'))
		}
	}

	async #forceStopExact(active: ActiveHost): Promise<boolean> {
		if (active.child.exitCode !== null) return true
		const signalSent = active.child.kill('SIGKILL')
		if (!signalSent && active.child.exitCode === null) return false
		try {
			await this.#waitForExit(active, this.#limits.forcedCleanupConfirmationMs)
			return true
		} catch {
			return false
		}
	}

	#waitForExit(active: ActiveHost, timeoutMs: number): Promise<void> {
		if (active.child.exitCode !== null) return Promise.resolve()
		return this.#withTimeout(
			new Promise<void>((resolve) => active.child.once('exit', () => resolve())),
			timeoutMs,
			'Native host exit timed out.'
		)
	}

	#releaseActive(active: ActiveHost): void {
		if (this.#active !== active) return
		active.child.stdin.destroy()
		active.child.stdout.destroy()
		active.child.stderr.destroy()
		this.#active = null
		this.#pendingWrites = 0
		this.#nextHostSequence = 0
		this.#stderr = Buffer.alloc(0)
	}

	#captureStderr(chunk: Buffer): void {
		const normalized = Buffer.from(
			visibleDiagnosticText(
				chunk.toString('utf8').replaceAll(this.#executablePath, '[native-host]')
			),
			'utf8'
		)
		this.#stderr = Buffer.concat([this.#stderr, normalized]).subarray(
			-Math.min(
				this.#limits.maxRetainedStderrBytes,
				this.#stderr.byteLength + normalized.byteLength
			)
		)
	}

	#resetRendererSession(): void {
		this.#handshake = null
		this.#handshakeWaiter = null
		this.#lastRendererSequence = -1
		this.#latestPlan = null
		this.#nextHostSequence = 0
		this.#nextRendererEventSequence = 0
		this.#planAcknowledgement = null
		this.#restartsUsed = 0
	}

	#withTimeout<Value>(
		promise: Promise<Value>,
		timeoutMs: number,
		message: string
	): Promise<Value> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
			void promise.then(
				(value) => {
					clearTimeout(timeout)
					resolve(value)
				},
				(error: unknown) => {
					clearTimeout(timeout)
					reject(error instanceof Error ? error : new Error(message))
				}
			)
		})
	}
}
