import { useCallback } from 'react'
import {
	clipId,
	createDrumClip,
	createDrumEvent,
	defaultTicksPerQuarter,
	type ClipId,
	type DrumInstrument,
	type DrumPatternCharacter,
	type DrumVoiceVariantId,
	type LayerId,
	type ProjectSessionSnapshot
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'

interface DrumClipTarget {
	readonly clip: ClipId
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
	const ensureDrumClip = useCallback(
		(historyGroup: string): DrumClipTarget | null => {
			const layer = drums.layerId
			if (layer === null) return null
			let snapshot = projectSession.getSnapshot()
			const currentLayer = snapshot.project.layers.find((candidate) => candidate.id === layer)
			const existing = currentLayer?.clips.find((clip) => clip.kind === 'drum')
			if (existing !== undefined) return { layer, clip: existing.id, snapshot }
			const createdClipId = clipId(projectSession.nextId('clip.drums.ui'))
			snapshot = projectSession.dispatch(
				{
					type: 'clip.place',
					baseRevision: snapshot.revision,
					layerId: layer,
					clip: createDrumClip({
						id: createdClipId,
						startTick: 0,
						lengthTicks: defaultTicksPerQuarter * 4
					})
				},
				{ historyGroup }
			)
			return { layer, clip: createdClipId, snapshot }
		},
		[drums.layerId, projectSession]
	)
	const toggleStep = useCallback(
		(instrument: DrumInstrument, step: number): void => {
			const historyGroup = `drums.toggle.${instrument}.${String(step)}`
			const target = ensureDrumClip(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum-event.toggle',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					clipId: target.clip,
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
		[ensureDrumClip, projectSession]
	)
	const selectPattern = useCallback(
		(character: Exclude<DrumPatternCharacter, 'custom'>): void => {
			const historyGroup = `drums.pattern.${character}`
			const target = ensureDrumClip(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.pattern.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					clipId: target.clip,
					character
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumClip, projectSession]
	)
	const setDensity = useCallback(
		(density: number): void => {
			const historyGroup = 'drums.density'
			const target = ensureDrumClip(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.density.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					clipId: target.clip,
					density
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumClip, projectSession]
	)
	const setSwing = useCallback(
		(swing: number): void => {
			const historyGroup = 'drums.swing'
			const target = ensureDrumClip(historyGroup)
			if (target === null) return
			projectSession.dispatch(
				{
					type: 'drum.swing.set',
					baseRevision: target.snapshot.revision,
					layerId: target.layer,
					clipId: target.clip,
					swing
				},
				{ historyGroup }
			)
			projectSession.endHistoryGroup(historyGroup)
		},
		[ensureDrumClip, projectSession]
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
