import {
	applicationError,
	type AnyEngineEventEnvelope,
	type ApplicationError,
	type ApplicationRuntime,
	type AudioHealthSnapshot,
	type EngineCapabilityCode,
	type EngineCommandPayloadByType,
	type ProjectHandle
} from '../../../contracts/src/index.js'
import { EngineClient, type EngineClientCommandType } from '../../../engine-client/src/index.js'
import {
	compileEngineWireRenderPlan,
	compileProjectRenderPlan,
	type ProjectDocument,
	type ProjectRenderPlan,
	type ProjectSession,
	type ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import {
	type ApplicationController,
	type ApplicationControllerSnapshot,
	silentApplicationMeter
} from './ApplicationController.js'
import { PerformanceInputSession } from '../performance/performance-input-session.js'
import { AuditionPreviewCoordinator } from '../preview/audition-preview-coordinator.js'

const applicationEngineCapabilities = Object.freeze<readonly EngineCapabilityCode[]>([
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

export interface ProjectDocumentCodec {
	encode(project: ProjectDocument): Uint8Array
}

export interface ApplicationRuntimeControllerOptions {
	readonly projectCodec?: ProjectDocumentCodec
}

function freezeSnapshot(snapshot: ApplicationControllerSnapshot): ApplicationControllerSnapshot {
	return Object.freeze({ ...snapshot })
}

function playablePlan(plan: ProjectRenderPlan): ProjectRenderPlan {
	return Object.freeze({
		...plan,
		layers: Object.freeze(plan.layers.filter((layer) => layer.source.type === 'synth'))
	})
}

export class ApplicationRuntimeController implements ApplicationController {
	readonly #client: EngineClient | null
	readonly #listeners = new Set<() => void>()
	readonly #options: ApplicationRuntimeControllerOptions
	readonly #runtime: ApplicationRuntime
	public readonly performanceInput: PerformanceInputSession
	public readonly previewCoordinator: AuditionPreviewCoordinator
	#currentHandle: ProjectHandle | null = null
	#disposed = false
	#engineRestarting = false
	#latestPlanGeneration = 0
	#latestRequestedPlanRevision = -1
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
			noteOn: (auditionId, pitch, velocity) => {
				this.previewCoordinator.interrupt()
				if (this.#snapshot.available) {
					void this.#send('note-on', { auditionId, pitch, velocity })
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
		this.#client =
			runtime.engine.availability === 'available'
				? new EngineClient(runtime.engine.api, {
						capabilities: applicationEngineCapabilities
					})
				: null
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

	public bindProjectSession(session: ProjectSession): void {
		this.previewCoordinator.interrupt()
		this.performanceInput.releaseAll()
		this.#projectUnsubscribe?.()
		this.#projectGeneration += 1
		this.#projectSession = session
		this.#currentHandle = null
		this.#latestRequestedPlanRevision = session.getSnapshot().revision
		this.#observedProjectRevision = session.getSnapshot().revision
		this.#latestPlanGeneration = this.#projectGeneration
		this.#projectUnsubscribe = session.subscribe(() => this.#projectChanged())
		if (this.#started) {
			void this.#createProjectHandle(this.#projectGeneration)
			this.#schedulePlanPublish()
		}
	}

	public async start(): Promise<void> {
		if (this.#started || this.#disposed) return
		this.#started = true
		this.#attachWindowListeners()
		void this.#createProjectHandle(this.#projectGeneration)
		if (this.#runtime.lifecycle.availability === 'available') {
			await this.#runtime.lifecycle.api.ready()
		}
		await this.#startEngine()
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
		this.#runtimeHealthUnsubscribe?.()
		this.#runtimeHealthUnsubscribe = null
		this.#unsubscribeEngineEvents?.()
		this.#unsubscribeEngineEvents = null
		this.#unsubscribeEngineFailures?.()
		this.#unsubscribeEngineFailures = null
		this.#lifecycleUnsubscribe?.()
		this.#lifecycleUnsubscribe = null
		if (this.#client?.state === 'ready') await this.#client.disconnect()
		this.#publish({ ...this.#snapshot, available: false, playing: false })
	}

	async #startEngine(): Promise<void> {
		if (this.#client === null || this.#runtime.engine.availability !== 'available') return
		this.#unsubscribeEngineEvents = this.#client.onEvent((event) =>
			this.#acceptEngineEvent(event)
		)
		this.#unsubscribeEngineFailures = this.#client.onFailure((error) => {
			this.previewCoordinator.reset()
			this.performanceInput.releaseAll()
			this.#setDiagnostic(error)
		})
		this.#runtimeHealthUnsubscribe = this.#runtime.engine.api.onHealth((health) =>
			this.#acceptHealth(health)
		)
		const connected = await this.#client.connect()
		if (!connected.ok) {
			this.#setDiagnostic(connected.error)
			return
		}
		const missingCapability = applicationEngineCapabilities.find(
			(capability) => !connected.value.capabilities.includes(capability)
		)
		if (missingCapability !== undefined) {
			this.#setDiagnostic(
				applicationError(
					'ENGINE_UNAVAILABLE',
					'The native engine is missing a required capability.',
					{
						details: { capability: missingCapability }
					}
				)
			)
			await this.#client.disconnect()
			return
		}
		await this.#initializeAudio()
	}

	async #initializeAudio(): Promise<void> {
		const configured = await this.#send('configure-audio', {
			sampleRate: 48_000,
			blockFrames: 512,
			channels: 2
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
			const wire = compileEngineWireRenderPlan(playablePlan(compiled.plan))
			if (wire.status !== 'ready') {
				this.#setDiagnostic(applicationError('ENGINE_UNAVAILABLE', wire.message))
				return
			}
			const accepted = await this.#send('load-render-plan', { plan: wire.plan })
			if (!accepted) return
		} while (
			publishedGeneration !== this.#projectGeneration ||
			publishedRevision !== this.#latestRequestedPlanRevision
		)
	}

	async #publishLatestPlan(): Promise<void> {
		this.#latestRequestedPlanRevision = this.#projectSession.getSnapshot().revision
		this.#latestPlanGeneration = this.#projectGeneration
		if (this.#planDrain !== null) await this.#planDrain
		else await this.#drainPlans()
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
		if (health.backendState === 'restarting') {
			this.#engineRestarting = true
		}
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
		if (this.#engineRestarting && health.backendState === 'stopped') {
			this.#engineRestarting = false
			void this.#initializeAudio()
		}
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
