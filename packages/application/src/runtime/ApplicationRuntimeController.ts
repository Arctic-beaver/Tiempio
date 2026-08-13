import {
	applicationError,
	applicationEngineRequestedCapabilityCodes,
	evaluateEngineCapabilities,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationResult,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type EngineCommandPayloadByType,
	type EngineConnection,
	type ProjectHandle
} from '../../../contracts/src/index.js'
import type { EngineClient, EngineClientCommandType } from '../../../engine-client/src/index.js'
import {
	compileEngineWireRenderPlan,
	compileProjectRenderPlan,
	type DrumInstrument,
	type ProjectDocument,
	type ProjectSession,
	type ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import {
	type ApplicationController,
	type ApplicationControllerSnapshot,
	type OpenedApplicationProject,
	silentApplicationMeter
} from './ApplicationController.js'
import { PerformanceInputSession } from '../performance/performance-input-session.js'
import { AuditionPreviewCoordinator } from '../preview/audition-preview-coordinator.js'

export interface ProjectDocumentCodec {
	decode?(
		bytes: Uint8Array
	):
		| { readonly project: ProjectDocument; readonly status: 'loaded' }
		| { readonly error: { readonly message: string }; readonly status: 'invalid' }
		| { readonly status: 'unsupported' }
	encode(project: ProjectDocument): Uint8Array
}

export interface PreparedEngineActivation {
	connect(): Promise<ApplicationResult<EngineConnection>>
	cancel(): Promise<void>
}

export interface ApplicationRuntimeControllerOptions {
	readonly loadEngineClient?: (
		runtime: Extract<
			ApplicationRuntime['engine'],
			{ readonly availability: 'available' }
		>['api']
	) => Promise<EngineClient>
	readonly prepareEngineActivation?: () => PreparedEngineActivation
	readonly projectCodec?: ProjectDocumentCodec
}

async function loadEngineClient(
	runtime: Extract<ApplicationRuntime['engine'], { readonly availability: 'available' }>['api']
): Promise<EngineClient> {
	const { EngineClient: EngineClientConstructor } =
		await import('../../../engine-client/src/index.js')
	return new EngineClientConstructor(runtime, {
		capabilities: applicationEngineRequestedCapabilityCodes
	})
}

function freezeSnapshot(snapshot: ApplicationControllerSnapshot): ApplicationControllerSnapshot {
	return Object.freeze({ ...snapshot })
}

const drumAuditionPitches = Object.freeze({
	kick: 36,
	clap: 39,
	closedHat: 42,
	openHat: 46,
	perc: 56
} as const satisfies Readonly<Record<DrumInstrument, number>>)

export class ApplicationRuntimeController implements ApplicationController {
	#client: EngineClient | null = null
	readonly #listeners = new Set<() => void>()
	readonly #options: ApplicationRuntimeControllerOptions
	readonly #runtime: ApplicationRuntime
	public readonly performanceInput: PerformanceInputSession
	public readonly previewCoordinator: AuditionPreviewCoordinator
	#currentHandle: ProjectHandle | null = null
	#disposed = false
	#drumAuditionSequence = 0
	#audioRetry: Promise<void> | null = null
	#latestPlanGeneration = 0
	#latestRequestedPlanRevision = -1
	#publishedPlanGeneration = -1
	#publishedPlanRevision = -1
	#metronomeEnabled = false
	#metronomeVolume = 0.65
	#observedProjectRevision = -1
	#lifecycleUnsubscribe: (() => void) | null = null
	#planDrain: Promise<void> | null = null
	#projectGeneration = 0
	#projectSession: ProjectSession
	#projectUnsubscribe: (() => void) | null = null
	#recoveryDrain: Promise<void> | null = null
	#runtimeHealthUnsubscribe: (() => void) | null = null
	#snapshot = freezeSnapshot({
		acknowledgedProjectRevision: null,
		available: false,
		diagnostic: null,
		health: null,
		meter: silentApplicationMeter,
		playing: false,
		tick: 0
	})
	#started = false
	#unsubscribeEngineEvents: (() => void) | null = null
	#unsubscribeEngineFailures: (() => void) | null = null

	public constructor(
		runtime: ApplicationRuntime,
		initialSession: ProjectSession,
		options: ApplicationRuntimeControllerOptions = {}
	) {
		this.#runtime = runtime
		this.#options = options
		this.#projectSession = initialSession
		this.performanceInput = new PerformanceInputSession({
			noteOn: (auditionId, layerId, pitch, velocity) => {
				this.previewCoordinator.interrupt()
				if (this.#snapshot.available) {
					void this.#send('note-on', { auditionId, layerId, pitch, velocity })
				}
			},
			noteOff: (auditionId) => {
				if (this.#snapshot.available) void this.#send('note-off', { auditionId })
			}
		})
		this.previewCoordinator = new AuditionPreviewCoordinator({
			cancel: (previewId) => {
				if (this.#snapshot.available) void this.#send('cancel-preview', { previewId })
			},
			start: (program) => {
				if (!this.#snapshot.available || this.#snapshot.playing) return false
				this.performanceInput.releaseAll()
				void this.#send('start-preview', program)
				return true
			}
		})
		if (runtime.lifecycle.availability === 'available') {
			this.#lifecycleUnsubscribe = runtime.lifecycle.api.onCloseRequested(() => {
				this.prepareToClose()
			})
		}
		this.bindProjectSession(initialSession)
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): ApplicationControllerSnapshot => this.#snapshot

	public bindProjectSession(session: ProjectSession, handle: ProjectHandle | null = null): void {
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#projectUnsubscribe?.()
		this.#projectGeneration += 1
		this.#projectSession = session
		this.#currentHandle = handle
		this.#latestRequestedPlanRevision = session.getSnapshot().revision
		this.#observedProjectRevision = session.getSnapshot().revision
		this.#latestPlanGeneration = this.#projectGeneration
		this.#projectUnsubscribe = session.subscribe(() => this.#projectChanged())
		if (this.#started) {
			if (handle === null) void this.#createProjectHandle(this.#projectGeneration)
			else this.#scheduleRecovery(true)
			this.#schedulePlanPublish()
		}
	}

	public openProject(): Promise<ApplicationResult<OpenedApplicationProject>> {
		if (
			this.#runtime.projects.availability !== 'available' ||
			this.#options.projectCodec?.decode === undefined
		) {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'OPERATION_UNAVAILABLE',
						'Project opening is unavailable.'
					)
				})
			)
		}
		let opened: Promise<ApplicationResult<ProjectHandle>>
		try {
			opened = this.#runtime.projects.api.open()
		} catch {
			return Promise.resolve(
				Object.freeze({
					ok: false as const,
					error: applicationError(
						'INTERNAL_ERROR',
						'The project picker could not be opened.',
						{ retryable: true }
					)
				})
			)
		}
		return this.#loadOpenedProject(
			this.#runtime.projects.api,
			this.#options.projectCodec.decode,
			opened
		)
	}

	public async start(): Promise<void> {
		if (this.#started || this.#disposed) return
		this.#started = true
		this.#attachWindowListeners()
		if (this.#currentHandle === null) void this.#createProjectHandle(this.#projectGeneration)
		else this.#scheduleRecovery(true)
		if (this.#runtime.lifecycle.availability === 'available') {
			await this.#runtime.lifecycle.api.ready()
		}
		await this.#startEngine()
	}

	public retryAudio(): Promise<void> {
		if (this.#audioRetry !== null) return this.#audioRetry
		if (this.#runtime.engine.availability !== 'available' || this.#disposed) {
			return Promise.resolve()
		}
		let activation: PreparedEngineActivation | null = null
		try {
			activation = this.#options.prepareEngineActivation?.() ?? null
		} catch {
			this.#setDiagnostic(
				applicationError('ENGINE_UNAVAILABLE', 'The audio activation could not start.', {
					retryable: true
				})
			)
			return Promise.resolve()
		}
		this.#audioRetry = this.#retryAudio(activation).finally(() => {
			this.#audioRetry = null
		})
		return this.#audioRetry
	}

	public auditionDrum(layerId: string, instrument: DrumInstrument): void {
		if (!this.#snapshot.available || this.#disposed) return
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#drumAuditionSequence += 1
		const auditionId = `drum-audition-${String(this.#drumAuditionSequence)}`
		void this.#publishLatestPlan().then(async () => {
			if (this.#disposed || !this.#snapshot.available) return
			await this.#send('note-on', {
				auditionId,
				layerId,
				pitch: drumAuditionPitches[instrument],
				velocity: 112
			})
		})
	}

	public togglePlayback(): void {
		if (this.#snapshot.playing) void this.#send('stop', {})
		else {
			this.previewCoordinator.interrupt()
			void this.#send('play', { startTick: this.#snapshot.tick })
		}
	}

	public stop(): void {
		void this.#send('stop', {})
	}

	public seek(tick: number): void {
		if (!Number.isSafeInteger(tick) || tick < 0) return
		this.previewCoordinator.interrupt()
		void this.#send('seek', { tick })
	}

	public setLoop(loop: {
		readonly enabled: boolean
		readonly startTick: number
		readonly endTick: number
	}): void {
		void this.#send('set-loop', loop)
	}

	public setMetronomeEnabled(enabled: boolean): void {
		this.#metronomeEnabled = enabled
		void this.#send('set-metronome-enabled', { enabled })
	}

	public setMetronomeVolume(volume: number): void {
		if (!Number.isFinite(volume)) return
		this.#metronomeVolume = Math.min(1, Math.max(0, volume))
		void this.#send('set-metronome-volume', { volume: this.#metronomeVolume })
	}

	public prepareToClose(): void {
		if (this.#disposed) return
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#scheduleRecovery(true)
		void this.dispose()
	}

	public async dispose(): Promise<void> {
		if (this.#disposed) return
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#disposed = true
		this.#detachWindowListeners()
		this.#projectUnsubscribe?.()
		this.#projectUnsubscribe = null
		this.#detachEngineListeners()
		this.#lifecycleUnsubscribe?.()
		this.#lifecycleUnsubscribe = null
		if (this.#client?.state === 'ready') await this.#client.disconnect()
		this.#publish({ ...this.#snapshot, available: false, playing: false })
	}

	async #startEngine(activation: PreparedEngineActivation | null = null): Promise<void> {
		if (this.#runtime.engine.availability !== 'available') return
		this.#detachEngineListeners()
		this.#runtimeHealthUnsubscribe = this.#runtime.engine.api.onHealth((health) =>
			this.#acceptHealth(health)
		)
		let client = this.#client
		let connected
		if (client === null) {
			const runtimeConnection = await (activation?.connect() ??
				this.#runtime.engine.api.connect())
			if (!runtimeConnection.ok) {
				if (!this.#disposed) this.#setDiagnostic(runtimeConnection.error)
				return
			}
			if (this.#disposed) {
				await this.#runtime.engine.api.disconnect()
				return
			}
			try {
				client = await (this.#options.loadEngineClient ?? loadEngineClient)(
					this.#runtime.engine.api
				)
			} catch {
				await this.#runtime.engine.api.disconnect()
				if (!this.#disposed) {
					this.#setDiagnostic(
						applicationError(
							'ENGINE_UNAVAILABLE',
							'The audio engine client could not load.',
							{
								retryable: true
							}
						)
					)
				}
				return
			}
			if (this.#disposed) {
				await this.#runtime.engine.api.disconnect()
				return
			}
			this.#client = client
			this.#attachEngineClientListeners(client)
			connected = await client.connectPrepared(runtimeConnection.value)
		} else if (activation === null) {
			this.#attachEngineClientListeners(client)
			connected = await client.connect()
		} else {
			const runtimeConnection = await activation.connect()
			if (!runtimeConnection.ok) {
				if (!this.#disposed) this.#setDiagnostic(runtimeConnection.error)
				return
			}
			if (this.#disposed) {
				await this.#runtime.engine.api.disconnect()
				return
			}
			this.#attachEngineClientListeners(client)
			connected = await client.connectPrepared(runtimeConnection.value)
		}
		if (!connected.ok) {
			if (!this.#disposed) this.#setDiagnostic(connected.error)
			return
		}
		if (this.#disposed) {
			await client.disconnect()
			return
		}
		const capabilityEvaluation = evaluateEngineCapabilities(connected.value.capabilities)
		if (!capabilityEvaluation.compatible) {
			const missingCapability = capabilityEvaluation.missingRequired[0] ?? 'audible-output'
			this.#setDiagnostic(
				applicationError(
					'ENGINE_UNAVAILABLE',
					'The audio engine is missing a required compatible capability.',
					{
						details: { capability: missingCapability }
					}
				)
			)
			await client.disconnect()
			return
		}
		await this.#initializeAudio(connected.value)
	}

	#attachEngineClientListeners(client: EngineClient): void {
		this.#unsubscribeEngineEvents = client.onEvent((event) => this.#acceptEngineEvent(event))
		this.#unsubscribeEngineFailures = client.onFailure((error) => {
			this.previewCoordinator.reset()
			this.performanceInput.releaseAll()
			this.#setDiagnostic(error)
		})
	}

	async #retryAudio(activation: PreparedEngineActivation | null): Promise<void> {
		if (this.#runtime.engine.availability !== 'available' || this.#disposed) return
		try {
			this.previewCoordinator.interrupt()
			this.performanceInput.releaseAll()
			this.#detachEngineListeners()
			if (this.#client?.state === 'ready') {
				const disconnected = await this.#client.disconnect()
				if (!disconnected.ok) this.#setDiagnostic(disconnected.error)
			}
			if (this.#client !== null && this.#client.state !== 'disconnected') {
				this.#setDiagnostic(
					applicationError('ENGINE_UNAVAILABLE', 'The audio engine cannot retry yet.', {
						retryable: true
					})
				)
				return
			}
			await this.#startEngine(activation)
		} finally {
			await activation?.cancel()
		}
	}

	#detachEngineListeners(): void {
		this.#runtimeHealthUnsubscribe?.()
		this.#runtimeHealthUnsubscribe = null
		this.#unsubscribeEngineEvents?.()
		this.#unsubscribeEngineEvents = null
		this.#unsubscribeEngineFailures?.()
		this.#unsubscribeEngineFailures = null
	}

	async #initializeAudio(connection: EngineConnection): Promise<void> {
		this.#publishedPlanGeneration = -1
		this.#publishedPlanRevision = -1
		const configuration = connection.audioConfiguration ?? {
			sampleRate: 48_000,
			blockFrames: 512,
			channels: 2 as const
		}
		const configured = await this.#send('configure-audio', {
			sampleRate: configuration.sampleRate,
			blockFrames: configuration.blockFrames,
			channels: configuration.channels
		})
		if (!configured) return
		await this.#publishLatestPlan()
		await this.#send('set-metronome-enabled', { enabled: this.#metronomeEnabled })
		await this.#send('set-metronome-volume', { volume: this.#metronomeVolume })
		await this.#send('start-audio', {})
		if (this.#runtime.engine.availability === 'available') {
			const health = await this.#runtime.engine.api.getHealth()
			if (health.ok) this.#acceptHealth(health.value)
			else this.#setDiagnostic(health.error)
		}
	}

	#projectChanged(): void {
		const snapshot = this.#projectSession.getSnapshot()
		if (snapshot.revision !== this.#observedProjectRevision) {
			this.previewCoordinator.interrupt()
			this.performanceInput.releaseAll()
			this.#observedProjectRevision = snapshot.revision
			this.#latestRequestedPlanRevision = snapshot.revision
			this.#latestPlanGeneration = this.#projectGeneration
			this.#schedulePlanPublish()
		}
		this.#scheduleRecovery(false)
	}

	#schedulePlanPublish(): void {
		if (this.#client?.state !== 'ready' || this.#disposed || this.#planDrain !== null) return
		this.#planDrain = this.#drainPlans().finally(() => {
			this.#planDrain = null
			if (
				!this.#disposed &&
				(this.#latestPlanGeneration !== this.#projectGeneration ||
					this.#latestRequestedPlanRevision !==
						this.#projectSession.getSnapshot().revision)
			) {
				this.#schedulePlanPublish()
			}
		})
	}

	async #drainPlans(): Promise<void> {
		let publishedGeneration = -1
		let publishedRevision = -1
		do {
			publishedGeneration = this.#projectGeneration
			publishedRevision = this.#latestRequestedPlanRevision
			const snapshot = this.#projectSession.getSnapshot()
			if (snapshot.revision !== publishedRevision) continue
			const compiled = compileProjectRenderPlan(
				snapshot.project,
				snapshot.revision,
				publishedRevision
			)
			if (compiled.status !== 'ready') {
				this.#setDiagnostic(applicationError('ENGINE_UNAVAILABLE', compiled.message))
				return
			}
			const wire = compileEngineWireRenderPlan(compiled.plan)
			if (wire.status !== 'ready') {
				this.#setDiagnostic(applicationError('ENGINE_UNAVAILABLE', wire.message))
				return
			}
			const accepted = await this.#send('load-render-plan', { plan: wire.plan })
			if (!accepted) return
			this.#publishedPlanGeneration = publishedGeneration
			this.#publishedPlanRevision = publishedRevision
		} while (
			publishedGeneration !== this.#projectGeneration ||
			publishedRevision !== this.#latestRequestedPlanRevision
		)
	}

	async #publishLatestPlan(): Promise<void> {
		this.#latestRequestedPlanRevision = this.#projectSession.getSnapshot().revision
		this.#latestPlanGeneration = this.#projectGeneration
		if (this.#planDrain !== null) await this.#planDrain
		const revision = this.#projectSession.getSnapshot().revision
		this.#latestRequestedPlanRevision = revision
		this.#latestPlanGeneration = this.#projectGeneration
		if (
			this.#publishedPlanGeneration === this.#projectGeneration &&
			this.#publishedPlanRevision === revision
		) {
			return
		}
		await this.#drainPlans()
	}

	async #createProjectHandle(generation: number): Promise<void> {
		if (
			this.#runtime.projects.availability !== 'available' ||
			this.#options.projectCodec === undefined
		) {
			return
		}
		const created = await this.#runtime.projects.api.create()
		if (this.#disposed || generation !== this.#projectGeneration) return
		if (!created.ok) return
		this.#currentHandle = created.value
		this.#scheduleRecovery(true)
	}

	async #loadOpenedProject(
		projects: Extract<
			ApplicationRuntime['projects'],
			{ readonly availability: 'available' }
		>['api'],
		decode: NonNullable<ProjectDocumentCodec['decode']>,
		opened: Promise<ApplicationResult<ProjectHandle>>
	): Promise<ApplicationResult<OpenedApplicationProject>> {
		try {
			const selected = await opened
			if (!selected.ok) return selected
			const loaded = await projects.load(selected.value)
			if (!loaded.ok) return loaded
			if (loaded.value.compatibility === 'unsupported') {
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						'PROJECT_READ_ONLY',
						'This project was created by a newer Tiempio version and cannot be edited.'
					)
				})
			}
			const decoded = decode(loaded.value.snapshot.bytes)
			if (decoded.status !== 'loaded') {
				return Object.freeze({
					ok: false as const,
					error: applicationError(
						decoded.status === 'unsupported' ? 'PROJECT_READ_ONLY' : 'PROJECT_INVALID',
						decoded.status === 'unsupported'
							? 'This project was created by a newer Tiempio version and cannot be edited.'
							: decoded.error.message
					)
				})
			}
			return Object.freeze({
				ok: true as const,
				value: Object.freeze({ handle: selected.value, project: decoded.project })
			})
		} catch {
			return Object.freeze({
				ok: false as const,
				error: applicationError(
					'INTERNAL_ERROR',
					'The selected project could not be opened.',
					{ retryable: true }
				)
			})
		}
	}

	#scheduleRecovery(force: boolean): void {
		if (
			this.#runtime.projects.availability !== 'available' ||
			this.#options.projectCodec === undefined ||
			this.#currentHandle === null ||
			this.#recoveryDrain !== null
		) {
			return
		}
		const snapshot = this.#projectSession.getSnapshot()
		if (!force && (!snapshot.recovery.needed || snapshot.recovery.inFlight !== null)) return
		this.#recoveryDrain = this.#writeRecovery(snapshot).finally(() => {
			this.#recoveryDrain = null
			const current = this.#projectSession.getSnapshot()
			if (!this.#disposed && current.recovery.needed) this.#scheduleRecovery(false)
		})
	}

	async #writeRecovery(snapshot: ProjectSessionSnapshot): Promise<void> {
		if (
			this.#runtime.projects.availability !== 'available' ||
			this.#options.projectCodec === undefined ||
			this.#currentHandle === null
		) {
			return
		}
		const generation = this.#projectGeneration
		const session = this.#projectSession
		const handle = this.#currentHandle
		const fingerprint = `recovery-${String(generation)}-${String(snapshot.revision)}`
		let bytes: Uint8Array
		try {
			bytes = this.#options.projectCodec.encode(snapshot.project)
			session.beginRecovery(snapshot.revision, fingerprint)
		} catch {
			return
		}
		const result = await this.#runtime.projects.api.writeRecovery(handle, {
			revision: snapshot.revision,
			bytes
		})
		if (generation !== this.#projectGeneration || session !== this.#projectSession) return
		const current = session.getSnapshot().recovery.inFlight
		if (
			current === null ||
			current.revision !== snapshot.revision ||
			current.fingerprint !== fingerprint
		) {
			return
		}
		if (result.ok && result.value.revision === snapshot.revision) {
			session.acknowledgeRecovery(snapshot.revision, fingerprint)
		} else {
			session.cancelRecovery(snapshot.revision, fingerprint)
		}
	}

	#acceptEngineEvent(event: AnyEngineEventEnvelope): void {
		if (event.type === 'meter-snapshot') {
			if (!this.#snapshot.available || document.visibilityState !== 'visible') return
			this.#publish({
				...this.#snapshot,
				meter: Object.freeze({ ...event.payload })
			})
			return
		}
		if (event.type === 'preview-started') {
			this.previewCoordinator.acceptStarted(event.payload.previewId)
			return
		}
		if (event.type === 'preview-state') {
			this.previewCoordinator.acceptState(
				event.payload.previewId,
				event.payload.pitches,
				event.payload.active
			)
			return
		}
		if (event.type === 'preview-ended') {
			this.previewCoordinator.acceptEnded(event.payload.previewId)
			return
		}
		if (event.type === 'render-plan-acknowledged') {
			if (
				event.payload.projectRevision < this.#latestRequestedPlanRevision ||
				(this.#snapshot.acknowledgedProjectRevision !== null &&
					event.payload.projectRevision < this.#snapshot.acknowledgedProjectRevision)
			) {
				return
			}
			this.#publish({
				...this.#snapshot,
				acknowledgedProjectRevision: event.payload.projectRevision
			})
			return
		}
		if (event.type === 'transport-snapshot') {
			if (event.payload.projectRevision < this.#latestRequestedPlanRevision) return
			if (event.payload.playing) this.previewCoordinator.interrupt()
			this.#publish({
				...this.#snapshot,
				playing: event.payload.playing,
				tick: event.payload.tick
			})
			return
		}
		if (event.type === 'diagnostic' || event.type === 'fatal-error') {
			this.#setDiagnostic(
				applicationError('ENGINE_UNAVAILABLE', event.payload.message, {
					details: { diagnostic: event.payload.code }
				})
			)
			if (event.type === 'fatal-error') {
				this.previewCoordinator.reset()
				this.performanceInput.releaseAll()
			}
		}
	}

	#acceptHealth(health: AudioHealthSnapshot): void {
		const available = health.backendState === 'ready' && health.deviceState === 'available'
		if (!available) {
			this.previewCoordinator.reset()
			this.performanceInput.releaseAll()
		}
		this.#publish({
			...this.#snapshot,
			available,
			diagnostic: available ? null : this.#snapshot.diagnostic,
			health,
			meter: available ? this.#snapshot.meter : silentApplicationMeter,
			playing: available ? this.#snapshot.playing : false
		})
	}

	async #send<Type extends EngineClientCommandType>(
		type: Type,
		payload: EngineCommandPayloadByType[Type]
	): Promise<boolean> {
		if (this.#client?.state !== 'ready' || this.#disposed) return false
		const result = await this.#client.send(type, payload)
		if (!result.ok) this.#setDiagnostic(result.error)
		return result.ok
	}

	#visibilityChanged = (): void => {
		if (document.visibilityState === 'visible') return
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#publish({ ...this.#snapshot, meter: silentApplicationMeter })
	}

	#attachWindowListeners(): void {
		window.addEventListener('blur', this.#releasePerformanceInputBound)
		window.addEventListener('pagehide', this.#releasePerformanceInputBound)
		document.addEventListener('visibilitychange', this.#visibilityChanged)
	}

	#detachWindowListeners(): void {
		window.removeEventListener('blur', this.#releasePerformanceInputBound)
		window.removeEventListener('pagehide', this.#releasePerformanceInputBound)
		document.removeEventListener('visibilitychange', this.#visibilityChanged)
	}

	#releasePerformanceInputBound = (): void => {
		this.performanceInput.releaseAll()
	}

	#setDiagnostic(error: ApplicationError): void {
		this.previewCoordinator.reset()
		this.performanceInput.releaseAll()
		this.#publish({
			...this.#snapshot,
			available: false,
			diagnostic: error,
			meter: silentApplicationMeter,
			playing: false
		})
	}

	#publish(snapshot: ApplicationControllerSnapshot): void {
		this.#snapshot = freezeSnapshot(snapshot)
		for (const listener of this.#listeners) listener()
	}
}
