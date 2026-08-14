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
	type EngineWireRenderPlan,
	type ProjectHandle,
	validateEngineWireRenderPlan
} from '../../../contracts/src/index.js'
import type { EngineClient, EngineClientCommandType } from '../../../engine-client/src/index.js'
import {
	compileEngineWireRenderPlan,
	compileEngineWireSynthPatch,
	compileProjectRenderPlan,
	cloneAndFreeze,
	type DrumInstrument,
	type PreparedProjectTransaction,
	type ProjectDocument,
	type ProjectSession,
	type ProjectSessionSnapshot
} from '../../../project-core/src/index.js'
import {
	type AuditionInstrumentPreview,
	type ApplicationController,
	type ApplicationControllerSnapshot,
	type DraftAuditionLayer,
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

const candidatePlanAcknowledgementTimeoutMs = 4_000

interface PreactivatedProjectPlan {
	readonly baseProject: ProjectDocument
	readonly baseRevision: number
	readonly project: ProjectDocument
	readonly revision: number
}

interface PendingProjectPlanActivation extends PreactivatedProjectPlan {
	readonly expectedPlanGeneration: number
	readonly finish: (accepted: boolean, restore?: boolean) => void
}

function draftWirePlan(
	plan: EngineWireRenderPlan,
	draft: DraftAuditionLayer | null
): EngineWireRenderPlan | null {
	if (draft === null) return plan
	if (
		draft.draftId.length === 0 ||
		draft.draftId.length > 64 ||
		!/^draft\.layer:[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(draft.draftId) ||
		plan.layers.some((layer) => layer.id === draft.draftId)
	) {
		return null
	}
	const candidate = cloneAndFreeze({
		...plan,
		layers: [
			...plan.layers,
			{
				id: draft.draftId,
				gain: 1,
				pan: 0,
				source: {
					type: 'subtractive-synth' as const,
					patch: compileEngineWireSynthPatch(draft.instrument.resolvedPatch)
				},
				events: []
			}
		]
	})
	const validation = validateEngineWireRenderPlan(candidate)
	return validation.ok ? validation.value : null
}

function auditionWirePlan(
	plan: EngineWireRenderPlan,
	draft: DraftAuditionLayer | null,
	preview: AuditionInstrumentPreview | null
): EngineWireRenderPlan | null {
	const withDraft = draftWirePlan(plan, draft)
	if (withDraft === null || preview === null) return withDraft
	let replaced = false
	const candidate = cloneAndFreeze({
		...withDraft,
		layers: withDraft.layers.map((layer) => {
			if (layer.id !== preview.layerId || layer.source.type !== 'subtractive-synth') {
				return layer
			}
			replaced = true
			return {
				...layer,
				source: {
					type: 'subtractive-synth' as const,
					patch: compileEngineWireSynthPatch(preview.instrument.resolvedPatch)
				}
			}
		})
	})
	if (!replaced) return null
	const validation = validateEngineWireRenderPlan(candidate)
	return validation.ok ? validation.value : null
}

interface PendingPerformanceNote {
	released: boolean
}

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
	#auditionInstrumentPreview: AuditionInstrumentPreview | null = null
	#draftAuditionLayer: DraftAuditionLayer | null = null
	readonly #ignoredPlanGenerations = new Set<number>()
	#latestPlanGeneration = 0
	#latestRequestedPlanRevision = -1
	#latestRequestedPlanVariant = 0
	#pendingProjectPlanActivation: PendingProjectPlanActivation | null = null
	#preactivatedProjectPlan: PreactivatedProjectPlan | null = null
	#publishedPlanGeneration = -1
	#publishedPlanRevision = -1
	#publishedPlanVariant = -1
	#metronomeEnabled = false
	#metronomeVolume = 0.65
	#observedProjectRevision = -1
	#lifecycleUnsubscribe: (() => void) | null = null
	#planDrain: Promise<void> | null = null
	#projectGeneration = 0
	#projectSession: ProjectSession
	#projectUnsubscribe: (() => void) | null = null
	readonly #pendingPerformanceNotes = new Map<string, PendingPerformanceNote>()
	#recoveryDrain: Promise<void> | null = null
	#sentPlanGeneration = 0
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
				this.#beginPerformanceNote(auditionId, layerId, pitch, velocity)
			},
			noteOff: (auditionId) => {
				this.#endPerformanceNote(auditionId)
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
		this.#finishPendingProjectPlanActivation(false, false)
		this.#preactivatedProjectPlan = null
		this.#auditionInstrumentPreview = null
		this.#draftAuditionLayer = null
		this.#projectUnsubscribe?.()
		this.#projectGeneration += 1
		this.#latestRequestedPlanVariant += 1
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

	public async setAuditionInstrumentPreview(
		preview: AuditionInstrumentPreview | null
	): Promise<boolean> {
		if (this.#disposed) return false
		const owned =
			preview === null
				? null
				: Object.freeze({ layerId: preview.layerId, instrument: preview.instrument })
		if (owned !== null) {
			const canonicalLayer = this.#projectSession
				.getSnapshot()
				.project.layers.find((layer) => layer.id === owned.layerId)
			const targetsSynth = canonicalLayer?.source.type === 'synth'
			const targetsDraft = this.#draftAuditionLayer?.draftId === owned.layerId
			if (!targetsSynth && !targetsDraft) return false
		}
		if (
			owned?.layerId === this.#auditionInstrumentPreview?.layerId &&
			owned?.instrument === this.#auditionInstrumentPreview?.instrument
		) {
			return (
				this.#publishedPlanGeneration === this.#projectGeneration &&
				this.#publishedPlanRevision === this.#projectSession.getSnapshot().revision &&
				this.#publishedPlanVariant === this.#latestRequestedPlanVariant
			)
		}
		this.#auditionInstrumentPreview = owned
		this.#latestRequestedPlanVariant += 1
		const requestedVariant = this.#latestRequestedPlanVariant
		await this.#publishLatestPlan()
		return (
			requestedVariant === this.#latestRequestedPlanVariant &&
			this.#publishedPlanGeneration === this.#projectGeneration &&
			this.#publishedPlanRevision === this.#projectSession.getSnapshot().revision &&
			this.#publishedPlanVariant === requestedVariant
		)
	}

	public async setDraftAuditionLayer(layer: DraftAuditionLayer | null): Promise<boolean> {
		if (this.#disposed) return false
		if (
			layer !== null &&
			(layer.draftId.length === 0 ||
				layer.draftId.length > 64 ||
				!/^draft\.layer:[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(layer.draftId))
		) {
			return false
		}
		const owned =
			layer === null
				? null
				: Object.freeze({
						draftId: layer.draftId,
						instrument: layer.instrument
					})
		if (
			owned?.draftId === this.#draftAuditionLayer?.draftId &&
			owned?.instrument === this.#draftAuditionLayer?.instrument
		) {
			return (
				this.#publishedPlanGeneration === this.#projectGeneration &&
				this.#publishedPlanRevision === this.#projectSession.getSnapshot().revision &&
				this.#publishedPlanVariant === this.#latestRequestedPlanVariant
			)
		}
		this.#finishPendingProjectPlanActivation(false, false)
		this.#preactivatedProjectPlan = null
		if (
			this.#auditionInstrumentPreview !== null &&
			this.#auditionInstrumentPreview.layerId !== owned?.draftId
		) {
			this.#auditionInstrumentPreview = null
		}
		this.#draftAuditionLayer = owned
		this.#latestRequestedPlanVariant += 1
		const requestedVariant = this.#latestRequestedPlanVariant
		await this.#publishLatestPlan()
		return (
			requestedVariant === this.#latestRequestedPlanVariant &&
			this.#publishedPlanGeneration === this.#projectGeneration &&
			this.#publishedPlanRevision === this.#projectSession.getSnapshot().revision &&
			this.#publishedPlanVariant === requestedVariant
		)
	}

	public async preactivateProject(prepared: PreparedProjectTransaction): Promise<boolean> {
		if (this.#disposed || !this.#snapshot.available || this.#client?.state !== 'ready') {
			return false
		}
		const baseSnapshot = this.#projectSession.getSnapshot()
		if (
			prepared.baseRevision !== baseSnapshot.revision ||
			prepared.revision <= prepared.baseRevision
		) {
			return false
		}
		if (this.#planDrain !== null) await this.#planDrain
		const current = this.#projectSession.getSnapshot()
		if (
			current.project !== baseSnapshot.project ||
			current.revision !== prepared.baseRevision ||
			this.#disposed
		) {
			return false
		}
		const compiled = compileProjectRenderPlan(
			prepared.project,
			prepared.revision,
			prepared.revision
		)
		if (compiled.status !== 'ready') return false
		const wire = compileEngineWireRenderPlan(compiled.plan)
		if (wire.status !== 'ready') return false
		this.previewCoordinator.interrupt()
		this.performanceInput.deactivate('sound-chooser')
		this.#finishPendingProjectPlanActivation(false, false)
		this.#preactivatedProjectPlan = null
		this.#auditionInstrumentPreview = null
		const activation = await this.#sendPlanForActivation(wire.plan, {
			baseProject: current.project,
			baseRevision: current.revision,
			project: prepared.project,
			revision: prepared.revision
		})
		return activation
	}

	public async restoreProjectPlan(): Promise<void> {
		this.#finishPendingProjectPlanActivation(false, false)
		this.#preactivatedProjectPlan = null
		this.#auditionInstrumentPreview = null
		this.#draftAuditionLayer = null
		this.#latestRequestedPlanRevision = this.#projectSession.getSnapshot().revision
		this.#latestRequestedPlanVariant += 1
		await this.#publishLatestPlan()
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
		this.#publishedPlanVariant = -1
		this.#sentPlanGeneration = 0
		this.#ignoredPlanGenerations.clear()
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
			const preactivated = this.#preactivatedProjectPlan
			if (
				preactivated !== null &&
				preactivated.project === snapshot.project &&
				preactivated.revision === snapshot.revision
			) {
				this.#preactivatedProjectPlan = null
				this.#auditionInstrumentPreview = null
				this.#draftAuditionLayer = null
				this.#observedProjectRevision = snapshot.revision
				this.#latestRequestedPlanRevision = snapshot.revision
				this.#latestPlanGeneration = this.#projectGeneration
				this.#latestRequestedPlanVariant += 1
				this.#publishedPlanGeneration = this.#projectGeneration
				this.#publishedPlanRevision = snapshot.revision
				this.#publishedPlanVariant = this.#latestRequestedPlanVariant
				this.#publish({
					...this.#snapshot,
					acknowledgedProjectRevision: snapshot.revision
				})
				this.#scheduleRecovery(false)
				return
			}
			this.#finishPendingProjectPlanActivation(false, false)
			this.#preactivatedProjectPlan = null
			this.previewCoordinator.interrupt()
			this.#observedProjectRevision = snapshot.revision
			this.#latestRequestedPlanRevision = snapshot.revision
			this.#latestPlanGeneration = this.#projectGeneration
			this.#latestRequestedPlanVariant += 1
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
						this.#projectSession.getSnapshot().revision ||
					this.#publishedPlanVariant !== this.#latestRequestedPlanVariant)
			) {
				this.#schedulePlanPublish()
			}
		})
	}

	async #drainPlans(): Promise<void> {
		let publishedGeneration = -1
		let publishedRevision = -1
		let publishedVariant = -1
		do {
			publishedGeneration = this.#projectGeneration
			publishedRevision = this.#latestRequestedPlanRevision
			publishedVariant = this.#latestRequestedPlanVariant
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
			const plan = auditionWirePlan(
				wire.plan,
				this.#draftAuditionLayer,
				this.#auditionInstrumentPreview
			)
			if (plan === null) {
				this.#setDiagnostic(
					applicationError('ENGINE_UNAVAILABLE', 'The audition render plan is invalid.')
				)
				return
			}
			const accepted = await this.#sendPlan(plan)
			if (!accepted) return
			this.#publishedPlanGeneration = publishedGeneration
			this.#publishedPlanRevision = publishedRevision
			this.#publishedPlanVariant = publishedVariant
		} while (
			publishedGeneration !== this.#projectGeneration ||
			publishedRevision !== this.#latestRequestedPlanRevision ||
			publishedVariant !== this.#latestRequestedPlanVariant
		)
	}

	async #publishLatestPlan(): Promise<void> {
		this.#latestRequestedPlanRevision = this.#projectSession.getSnapshot().revision
		this.#latestPlanGeneration = this.#projectGeneration
		if (this.#planDrain !== null) await this.#planDrain
		const revision = this.#projectSession.getSnapshot().revision
		this.#latestRequestedPlanRevision = revision
		this.#latestPlanGeneration = this.#projectGeneration
		const variant = this.#latestRequestedPlanVariant
		if (
			this.#publishedPlanGeneration === this.#projectGeneration &&
			this.#publishedPlanRevision === revision &&
			this.#publishedPlanVariant === variant
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
			const decoded = decode(loaded.value.snapshot.bytes)
			if (decoded.status !== 'loaded') {
				return Object.freeze({
					ok: false as const,
					error: applicationError('PROJECT_INVALID', decoded.error.message)
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
			if (this.#ignoredPlanGenerations.delete(event.payload.planGeneration)) return
			const pending = this.#pendingProjectPlanActivation
			if (
				pending !== null &&
				event.payload.planGeneration === pending.expectedPlanGeneration &&
				event.payload.projectRevision === pending.revision
			) {
				const current = this.#projectSession.getSnapshot()
				pending.finish(
					current.revision === pending.baseRevision &&
						current.project === pending.baseProject
				)
				return
			}
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

	async #sendPlan(plan: EngineWireRenderPlan): Promise<boolean> {
		const accepted = await this.#send('load-render-plan', { plan })
		if (accepted) this.#sentPlanGeneration += 1
		return accepted
	}

	async #sendPlanForActivation(
		plan: EngineWireRenderPlan,
		candidate: PreactivatedProjectPlan
	): Promise<boolean> {
		const expectedPlanGeneration = this.#sentPlanGeneration + 1
		let settle: (accepted: boolean) => void = () => undefined
		let pendingReference: PendingProjectPlanActivation | null = null
		const result = new Promise<boolean>((resolve) => {
			let settled = false
			const timeout = globalThis.setTimeout(() => {
				pendingReference?.finish(false)
			}, candidatePlanAcknowledgementTimeoutMs)
			settle = (accepted: boolean): void => {
				if (settled) return
				settled = true
				globalThis.clearTimeout(timeout)
				resolve(accepted)
			}
		})
		const pending: PendingProjectPlanActivation = Object.freeze({
			...candidate,
			expectedPlanGeneration,
			finish: (accepted: boolean, restore: boolean = !accepted): void => {
				if (this.#pendingProjectPlanActivation !== pending) return
				this.#pendingProjectPlanActivation = null
				if (accepted) {
					this.#preactivatedProjectPlan = candidate
				} else {
					if (this.#sentPlanGeneration >= expectedPlanGeneration) {
						this.#ignorePlanGeneration(expectedPlanGeneration)
					}
					if (restore && !this.#disposed) {
						this.#latestRequestedPlanRevision =
							this.#projectSession.getSnapshot().revision
						this.#latestRequestedPlanVariant += 1
						this.#schedulePlanPublish()
					}
				}
				settle(accepted)
			}
		})
		pendingReference = pending
		this.#pendingProjectPlanActivation = pending
		const accepted = await this.#sendPlan(plan)
		if (!accepted) pending.finish(false)
		return result
	}

	#finishPendingProjectPlanActivation(accepted: boolean, restore = !accepted): void {
		this.#pendingProjectPlanActivation?.finish(accepted, restore)
	}

	#ignorePlanGeneration(generation: number): void {
		this.#ignoredPlanGenerations.add(generation)
		while (this.#ignoredPlanGenerations.size > 8) {
			const oldest = this.#ignoredPlanGenerations.values().next().value as number | undefined
			if (oldest === undefined) break
			this.#ignoredPlanGenerations.delete(oldest)
		}
	}

	#beginPerformanceNote(
		auditionId: string,
		layerId: string,
		pitch: number,
		velocity: number
	): void {
		if (!this.#snapshot.available || this.#disposed) return
		const pending: PendingPerformanceNote = { released: false }
		this.#pendingPerformanceNotes.set(auditionId, pending)
		void this.#publishLatestPlan().then(async () => {
			if (this.#pendingPerformanceNotes.get(auditionId) !== pending) return
			if (pending.released || !this.#snapshot.available || this.#disposed) {
				this.#pendingPerformanceNotes.delete(auditionId)
				return
			}
			const accepted = await this.#send('note-on', {
				auditionId,
				layerId,
				pitch,
				velocity
			})
			if (this.#pendingPerformanceNotes.get(auditionId) !== pending) return
			this.#pendingPerformanceNotes.delete(auditionId)
			if (accepted && pending.released && this.#snapshot.available && !this.#disposed) {
				await this.#send('note-off', { auditionId })
			}
		})
	}

	#endPerformanceNote(auditionId: string): void {
		const pending = this.#pendingPerformanceNotes.get(auditionId)
		if (pending !== undefined) {
			pending.released = true
			return
		}
		if (this.#snapshot.available && !this.#disposed) {
			void this.#send('note-off', { auditionId })
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
		this.previewCoordinator.interrupt()
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
