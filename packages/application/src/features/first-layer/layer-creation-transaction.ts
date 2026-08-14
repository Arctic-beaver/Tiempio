import {
	cloneAndFreeze,
	type LayerId,
	type ProjectCommand,
	type ProjectRole
} from '../../../../project-core/src/index.js'
import type { LayerCreationDraft } from './layer-creation-coordinator.js'

const projectRole = Object.freeze({
	melody: 'melody',
	chords: 'harmony',
	bass: 'bass',
	drums: 'rhythm'
} as const satisfies Readonly<Record<NonNullable<LayerCreationDraft['role']>, ProjectRole>>)

export function commandsForLayerCreation(
	draft: LayerCreationDraft,
	baseRevision: number,
	canonicalLayerId: LayerId
): readonly ProjectCommand[] {
	if (
		draft.step !== 'ready' ||
		draft.suspended ||
		draft.role === null ||
		draft.displayName === null
	) {
		throw new Error('A layer creation draft must be active and ready before commit.')
	}
	if (draft.role === 'drums') {
		return cloneAndFreeze([
			{
				type: 'layer.add',
				baseRevision,
				id: canonicalLayerId,
				name: draft.displayName,
				role: projectRole[draft.role]
			}
		])
	}
	if (
		draft.synthPresetId === null ||
		draft.semanticMacros === null ||
		draft.performance === null
	) {
		throw new Error('A ready pitched brick draft must own its complete synth configuration.')
	}
	return cloneAndFreeze([
		{
			type: 'layer.add',
			baseRevision,
			id: canonicalLayerId,
			name: draft.displayName,
			role: projectRole[draft.role],
			synth: {
				presetId: draft.synthPresetId,
				macros: draft.semanticMacros,
				performance: draft.performance
			}
		}
	])
}
