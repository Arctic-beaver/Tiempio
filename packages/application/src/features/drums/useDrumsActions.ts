import { useCallback } from 'react'
import {
	createDrumEvent,
	createSongInstance,
	defaultTicksPerQuarter,
	songInstanceId,
	type DrumInstrument,
	type DrumPatternCharacter,
	type DrumVoiceVariantId,
	type LayerId,
	type ProjectSessionSnapshot
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

interface DrumMaterialTarget {
	readonly layer: LayerId
	readonly snapshot: ProjectSessionSnapshot
}

export function useDrumsActions(): {
	readonly selectPattern: (character: Exclude<DrumPatternCharacter, 'custom'>) => void
	readonly selectVoiceVariant: (instrument: DrumInstrument, variantId: DrumVoiceVariantId) => void
	readonly setDensity: (density: number) => void
	readonly setSwing: (swing: number) => void
	readonly toggleStep: (instrument: DrumInstrument, step: number) => void
} {
	const projectSession = useProjectSession()
	const { drums } = projectSession.projections
	const ensureDrumMaterial = useCallback(
		(historyGroup: string): DrumMaterialTarget | null => {
			const layer = drums.layerId
			if (layer === null) return null
			let snapshot = projectSession.getSnapshot()
			const currentLayer = snapshot.project.layers.find((candidate) => candidate.id === layer)
			if (currentLayer?.material.kind !== 'drum') return null
			if (currentLayer.material.materialLengthTicks === 0) {
				snapshot = projectSession.dispatch(
					{
						type: 'source.material.extend',
						baseRevision: snapshot.revision,
						layerId: layer,
						throughTick: defaultTicksPerQuarter * 4
					},
					{ historyGroup }
				)
			}
			if (
				!snapshot.project.song.instances.some(
					(instance) => instance.sourceLayerId === layer
				)
			) {
				snapshot = projectSession.dispatch(
					{
						type: 'song-instance.place',
						baseRevision: snapshot.revision,
						instance: createSongInstance({
							id: songInstanceId(projectSession.nextId('instance.drums.ui')),
							sourceLayerId: layer,
							startTick: 0,
							durationTicks: Math.max(
								defaultTicksPerQuarter * 4,
								currentLayer.material.materialLengthTicks +
									currentLayer.material.tailRestTicks
							)
						})
					},
					{ historyGroup }
				)
			}
			return { layer, snapshot }
		},
		[drums.layerId, projectSession]
	)
	const toggleStep = useCallback(
		(instrument: DrumInstrument, step: number): void => {
			const historyGroup = `drums.toggle.${instrument}.${String(step)}`
			const target = ensureDrumMaterial(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum-event.toggle',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					eventWhenAdded: createDrumEvent({
						id: projectSession.nextId('event.drums.ui'),
						instrument,
						step
					})
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumMaterial, projectSession]
	)
	const selectPattern = useCallback(
		(character: Exclude<DrumPatternCharacter, 'custom'>): void => {
			const historyGroup = `drums.pattern.${character}`
			const target = ensureDrumMaterial(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.pattern.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					character
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumMaterial, projectSession]
	)
	const setDensity = useCallback(
		(density: number): void => {
			const historyGroup = 'drums.density'
			const target = ensureDrumMaterial(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.density.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					density
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumMaterial, projectSession]
	)
	const setSwing = useCallback(
		(swing: number): void => {
			const historyGroup = 'drums.swing'
			const target = ensureDrumMaterial(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.swing.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					swing
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumMaterial, projectSession]
	)
	const selectVoiceVariant = useCallback(
		(instrument: DrumInstrument, variantId: DrumVoiceVariantId): void => {
			const layer = drums.layerId
			if (layer === null) return
			const snapshot = projectSession.getSnapshot()
			projectSession.dispatch({
				type: 'drum.voice.select',
				baseRevision: snapshot.revision,
				layerId: layer,
				instrument,
				variantId
			})
		},
		[drums.layerId, projectSession]
	)
	return { selectPattern, selectVoiceVariant, setDensity, setSwing, toggleStep }
}
