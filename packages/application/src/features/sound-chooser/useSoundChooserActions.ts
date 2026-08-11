import { useCallback } from 'react'
import {
	synthPresetDefinition,
	type LayerPerformanceMapping,
	type SemanticSynthMacrosV2,
	type SynthMacroId,
	type SynthPresetId
} from '../../../../project-core/src/index.js'
import { useCommands } from '../../commands/CommandContext.js'
import { commandForView } from '../../commands/command-registry.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

export function useSoundChooserActions(): {
	readonly chooseSound: (performance: LayerPerformanceMapping) => void
	readonly commitMacro: (macro: SynthMacroId, value: number) => void
	readonly returnToLayerChoice: () => void
	readonly selectCharacter: (presetId: SynthPresetId) => void
	readonly selectedMacros: SemanticSynthMacrosV2
	readonly selectedPresetId: SynthPresetId
} {
	const { execute } = useCommands()
	const projectSession = useProjectSession()
	const selectedLayer = projectSession.snapshot.project.layers.find(
		(layer) => layer.id === projectSession.selectedLayerId
	)
	const selectedInstrument =
		selectedLayer?.source.type === 'synth' ? selectedLayer.source.instrument : null
	const fallback = synthPresetDefinition('bass.deep')
	const selectedPresetId = selectedInstrument?.presetId ?? fallback.id
	const selectedMacros = selectedInstrument?.macros ?? fallback.defaultMacros
	const selectCharacter = useCallback(
		(presetId: SynthPresetId): void => {
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
		[projectSession]
	)
	const commitMacro = useCallback(
		(macro: SynthMacroId, value: number): void => {
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
		[projectSession]
	)
	const chooseSound = useCallback(
		(performance: LayerPerformanceMapping): void => {
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
		[execute, projectSession]
	)
	const returnToLayerChoice = useCallback((): void => {
		execute(commandForView('first-layer'))
	}, [execute])
	return {
		chooseSound,
		commitMacro,
		returnToLayerChoice,
		selectCharacter,
		selectedMacros,
		selectedPresetId
	}
}
