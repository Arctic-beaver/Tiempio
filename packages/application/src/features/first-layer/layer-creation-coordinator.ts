import {
	assertMacroValue,
	cloneAndFreeze,
	createSynthInstrument,
	type LayerId,
	type LayerPerformanceMapping,
	type ProjectId,
	type SemanticSynthMacrosV2,
	type SynthMacroId,
	type SynthPresetId
} from '../../../../project-core/src/index.js'
import type { LayerRoleViewModel } from './view-model.js'

declare const layerCreationDraftIdBrand: unique symbol

export type LayerCreationDraftId = string & {
	readonly [layerCreationDraftIdBrand]: true
}

export type LayerCreationStep = 'choosing-role' | 'choosing-sound' | 'ready'

export interface LayerCreationDraft {
	readonly displayName: string | null
	readonly draftId: LayerCreationDraftId
	readonly error: string | null
	readonly originSourceLayerId: LayerId | null
	readonly performance: LayerPerformanceMapping | null
	readonly projectId: ProjectId
	readonly role: LayerRoleViewModel['id'] | null
	readonly semanticMacros: SemanticSynthMacrosV2 | null
	readonly step: LayerCreationStep
	readonly suspended: boolean
	readonly synthPresetId: SynthPresetId | null
}

export interface LayerCreationSnapshot {
	readonly announcement: string | null
	readonly draft: LayerCreationDraft | null
	readonly revision: number
}

export interface OpenLayerCreationInput {
	readonly originSourceLayerId: LayerId | null
	readonly projectId: ProjectId
}

export interface ChooseLayerCreationRoleInput {
	readonly displayName: string
	readonly performance: LayerPerformanceMapping
	readonly role: LayerRoleViewModel['id']
}

export interface LayerCreationCoordinatorOptions {
	readonly onAuditionInvalidated?: () => void
}

function boundedDraftId(value: string): LayerCreationDraftId {
	if (
		value.length === 0 ||
		value.length > 64 ||
		!/^draft\.layer:[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
	) {
		throw new TypeError('Layer creation draft IDs must be bounded and separately namespaced.')
	}
	return value as LayerCreationDraftId
}

function ownedPerformance(performance: LayerPerformanceMapping): LayerPerformanceMapping {
	if (
		!Number.isSafeInteger(performance.key.tonic) ||
		performance.key.tonic < 0 ||
		performance.key.tonic > 11 ||
		(performance.key.mode !== 'major' && performance.key.mode !== 'minor') ||
		!Number.isSafeInteger(performance.octave) ||
		performance.octave < 1 ||
		performance.octave > 6
	) {
		throw new TypeError('Draft performance requires a valid key and octave from 1 to 6.')
	}
	return cloneAndFreeze({
		key: { tonic: performance.key.tonic, mode: performance.key.mode },
		octave: performance.octave
	})
}

function defaultPreset(role: Exclude<LayerRoleViewModel['id'], 'drums'>): SynthPresetId {
	if (role === 'melody') return 'lead.glass'
	if (role === 'chords') return 'pad.warm'
	return 'bass.deep'
}

function ownedDraft(draft: LayerCreationDraft): LayerCreationDraft {
	return cloneAndFreeze(draft)
}

export class LayerCreationCoordinator {
	readonly #listeners = new Set<() => void>()
	readonly #onAuditionInvalidated: () => void
	#draftSequence = 0
	#snapshot: LayerCreationSnapshot = Object.freeze({
		announcement: null,
		draft: null,
		revision: 0
	})

	public constructor(options: LayerCreationCoordinatorOptions = {}) {
		this.#onAuditionInvalidated = options.onAuditionInvalidated ?? (() => undefined)
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): LayerCreationSnapshot => this.#snapshot

	public openOrFocus(input: OpenLayerCreationInput): LayerCreationDraft {
		const current = this.#snapshot.draft
		if (current !== null && current.projectId === input.projectId) {
			if (current.suspended) this.#replace({ ...current, suspended: false, error: null })
			return this.#requireDraft()
		}
		if (current !== null) this.#onAuditionInvalidated()
		this.#draftSequence += 1
		const draft = ownedDraft({
			draftId: boundedDraftId(`draft.layer:ui-${String(this.#draftSequence)}`),
			projectId: input.projectId,
			originSourceLayerId: input.originSourceLayerId,
			step: 'choosing-role',
			role: null,
			displayName: null,
			synthPresetId: null,
			semanticMacros: null,
			performance: null,
			suspended: false,
			error: null
		})
		this.#publish(draft, 'Adding a brick. Existing bricks remain available.')
		return draft
	}

	public chooseRole(input: ChooseLayerCreationRoleInput): LayerCreationDraft {
		const current = this.#requireDraft()
		const displayName = input.displayName.trim()
		if (displayName.length === 0 || displayName.length > 96) {
			throw new TypeError('A draft brick name must contain 1-96 characters.')
		}
		this.#onAuditionInvalidated()
		if (input.role === 'drums') {
			this.#replace({
				...current,
				role: input.role,
				displayName,
				step: 'ready',
				synthPresetId: null,
				semanticMacros: null,
				performance: null,
				suspended: false,
				error: null
			})
			return this.#requireDraft()
		}
		const presetId = defaultPreset(input.role)
		const instrument = createSynthInstrument(presetId)
		this.#replace({
			...current,
			role: input.role,
			displayName,
			step: 'choosing-sound',
			synthPresetId: presetId,
			semanticMacros: instrument.macros,
			performance: ownedPerformance(input.performance),
			suspended: false,
			error: null
		})
		return this.#requireDraft()
	}

	public selectSynthPreset(presetId: SynthPresetId): LayerCreationDraft {
		const current = this.#requireSynthDraft()
		this.#onAuditionInvalidated()
		const instrument = createSynthInstrument(presetId)
		this.#replace({
			...current,
			synthPresetId: presetId,
			semanticMacros: instrument.macros,
			error: null
		})
		return this.#requireDraft()
	}

	public setSynthMacro(macro: SynthMacroId, value: number): LayerCreationDraft {
		const current = this.#requireSynthDraft()
		assertMacroValue(value)
		this.#replace({
			...current,
			semanticMacros: { ...current.semanticMacros, [macro]: value },
			error: null
		})
		return this.#requireDraft()
	}

	public completePerformance(performance: LayerPerformanceMapping): LayerCreationDraft {
		const current = this.#requireSynthDraft()
		this.#onAuditionInvalidated()
		this.#replace({
			...current,
			performance: ownedPerformance(performance),
			step: 'ready',
			error: null
		})
		return this.#requireDraft()
	}

	public backToRole(): LayerCreationDraft {
		const current = this.#requireDraft()
		this.#onAuditionInvalidated()
		this.#replace({ ...current, step: 'choosing-role', suspended: false, error: null })
		return this.#requireDraft()
	}

	public suspend(): boolean {
		const current = this.#snapshot.draft
		if (current === null || current.suspended) return false
		this.#onAuditionInvalidated()
		this.#replace({ ...current, suspended: true })
		return true
	}

	public resume(): LayerCreationDraft | null {
		const current = this.#snapshot.draft
		if (current === null) return null
		if (current.suspended) this.#replace({ ...current, suspended: false, error: null })
		return this.#requireDraft()
	}

	public reportError(message: string): void {
		const current = this.#requireDraft()
		const ownedMessage = message.trim().slice(0, 240)
		this.#replace({
			...current,
			error: ownedMessage.length === 0 ? 'The brick could not be created.' : ownedMessage
		})
	}

	public cancel(): boolean {
		if (this.#snapshot.draft === null) return false
		this.#onAuditionInvalidated()
		this.#publish(null, null)
		return true
	}

	public invalidateForProject(projectId: ProjectId): boolean {
		const current = this.#snapshot.draft
		if (current === null || current.projectId === projectId) return false
		return this.cancel()
	}

	#requireDraft(): LayerCreationDraft {
		const draft = this.#snapshot.draft
		if (draft === null) throw new Error('No layer creation draft is active.')
		return draft
	}

	#requireSynthDraft(): LayerCreationDraft & {
		readonly performance: LayerPerformanceMapping
		readonly semanticMacros: SemanticSynthMacrosV2
		readonly synthPresetId: SynthPresetId
	} {
		const draft = this.#requireDraft()
		if (
			draft.role === null ||
			draft.role === 'drums' ||
			draft.performance === null ||
			draft.semanticMacros === null ||
			draft.synthPresetId === null
		) {
			throw new Error('The active layer creation draft does not own a synth sound.')
		}
		return draft as LayerCreationDraft & {
			readonly performance: LayerPerformanceMapping
			readonly semanticMacros: SemanticSynthMacrosV2
			readonly synthPresetId: SynthPresetId
		}
	}

	#replace(draft: LayerCreationDraft): void {
		this.#publish(ownedDraft(draft), this.#snapshot.announcement)
	}

	#publish(draft: LayerCreationDraft | null, announcement: string | null): void {
		this.#snapshot = Object.freeze({
			draft,
			announcement,
			revision: this.#snapshot.revision + 1
		})
		for (const listener of this.#listeners) listener()
	}
}
