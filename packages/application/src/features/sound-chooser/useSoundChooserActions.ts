import { useCallback, useMemo } from 'react'
import {
	synthPresetDefinition,
	createSynthInstrument,
	type LayerPerformanceMapping,
	type SemanticSynthMacros,
	type SynthMacroId,
	type SynthPresetId,
	type SynthInstrumentState
} from '../../../../project-core/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import { useLayerCreation } from '../first-layer/LayerCreationContext.js'
import { useLayerCreationActions } from '../first-layer/useLayerCreationActions.js'

export function useSoundChooserActions(): {
	readonly auditionInstrument: SynthInstrumentState | null
	readonly chooseSound: (performance: LayerPerformanceMapping) => void
	readonly commitPending: boolean
	readonly layerId: string | null
	readonly commitMacro: (macro: SynthMacroId, value: number) => void
	readonly returnToLayerChoice: () => void
	readonly selectCharacter: (presetId: SynthPresetId) => void
	readonly selectedMacros: SemanticSynthMacros
	readonly selectedPresetId: SynthPresetId
} {
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const { coordinator, snapshot: creation } = useLayerCreation()
	const creationActions = useLayerCreationActions()
	const draft = creation.draft
	const targetsDraft =
		draft !== null &&
		!draft.suspended &&
		draft.role !== null &&
		draft.role !== 'drums' &&
		draft.step !== 'choosing-role' &&
		draft.synthPresetId !== null &&
		draft.semanticMacros !== null
	const selectedLayer = projectSession.snapshot.project.layers.find(
		(layer) => layer.id === projectSession.selectedLayerId
	)
	const selectedInstrument =
		selectedLayer?.source.type === 'synth' ? selectedLayer.source.instrument : null
	const fallback = synthPresetDefinition('bass.deep')
	const selectedPresetId = targetsDraft
		? draft.synthPresetId
		: (selectedInstrument?.presetId ?? fallback.id)
	const selectedMacros = targetsDraft
		? draft.semanticMacros
		: (selectedInstrument?.macros ?? fallback.defaultMacros)
	const auditionInstrument = useMemo(
		() => (targetsDraft ? createSynthInstrument(selectedPresetId, selectedMacros) : null),
		[selectedMacros, selectedPresetId, targetsDraft]
	)
	const selectCharacter = useCallback(
		(presetId: SynthPresetId): void => {
			if (targetsDraft) {
				coordinator.selectSynthPreset(presetId)
				return
			}
			const selected = projectSession.selectedLayerId
			if (selected === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'layer.character.select',
				baseRevision: snapshot.revision,
				layerId: selected,
				presetId
			})
		},
		[coordinator, projectSession, targetsDraft]
	)
	const commitMacro = useCallback(
		(macro: SynthMacroId, value: number): void => {
			if (targetsDraft) {
				coordinator.setSynthMacro(macro, value)
				return
			}
			const selected = projectSession.selectedLayerId
			if (selected === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'layer.macro.commit',
				baseRevision: snapshot.revision,
				layerId: selected,
				macro,
				value
			})
		},
		[coordinator, projectSession, targetsDraft]
	)
	const chooseSound = useCallback(
		(performance: LayerPerformanceMapping): void => {
			if (targetsDraft) {
				coordinator.completePerformance(performance)
				void creationActions.commitDraft()
				return
			}
			const snapshot = projectSession.getSnapshot()
			const selected = projectSession.selectedLayerId
			if (selected === null) return
			projectSession.dispatch({
				type: 'layer.performance.set',
				baseRevision: snapshot.revision,
				layerId: selected,
				performance
			})
			execute(commandForView('piano-roll'))
		},
		[coordinator, creationActions, execute, projectSession, targetsDraft]
	)
	const returnToLayerChoice = useCallback((): void => {
		if (targetsDraft) {
			creationActions.backToRole()
			return
		}
		execute(commandForView('first-layer'))
	}, [creationActions, execute, targetsDraft])
	return {
		auditionInstrument,
		chooseSound,
		commitPending: creationActions.commitPending,
		layerId: targetsDraft ? draft.draftId : projectSession.selectedLayerId,
		commitMacro,
		returnToLayerChoice,
		selectCharacter,
		selectedMacros,
		selectedPresetId
	}
}
