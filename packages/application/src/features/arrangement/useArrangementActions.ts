import { useCallback } from 'react'
import {
	createSongInstance,
	drumEventId,
	layerId,
	noteId,
	songInstanceId,
	type LayerId,
	type ProjectLayer
} from '../../../../project-core/src/index.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import type {
	ArrangementGestureKind,
	ArrangementGestureResult
} from './arrangement-interactions.js'

function variationLayer(
	source: ProjectLayer,
	variationId: LayerId,
	nextId: (scope: string) => string
): ProjectLayer {
	const material =
		source.material.kind === 'midi'
			? {
					...source.material,
					notes: source.material.notes.map((note) => ({
						...note,
						id: noteId(nextId('note.arrangement.variation'))
					}))
				}
			: source.material.kind === 'drum'
				? {
						...source.material,
						events: source.material.events.map((event) => ({
							...event,
							id: drumEventId(nextId('event.arrangement.variation'))
						}))
					}
				: source.material
	return {
		...source,
		id: variationId,
		name: `${source.name} variation`,
		material
	}
}

export interface ArrangementActions {
	readonly deleteInstance: (instanceId: string) => void
	readonly duplicateAsVariation: (instanceId: string) => string | null
	readonly duplicateLinked: (instanceId: string) => string | null
	readonly placeInstance: (
		layerValue: string,
		startTick: number,
		durationTicks: number
	) => string | null
	readonly splitInstance: (instanceId: string, splitOffsetTicks: number) => string | null
	readonly updateInstanceGesture: (
		instanceId: string,
		kind: ArrangementGestureKind,
		result: ArrangementGestureResult
	) => void
}

export function useArrangementActions(): ArrangementActions {
	const projectSession = useProjectSession()

	const placeInstance = useCallback(
		(layerValue: string, startTick: number, durationTicks: number): string | null => {
			const snapshot = projectSession.getSnapshot()
			const layer = snapshot.project.layers.find((candidate) => candidate.id === layerValue)
			if (layer === undefined || durationTicks <= 0) return null
			const id = songInstanceId(projectSession.nextId('instance.arrangement.ui'))
			projectSession.dispatch({
				type: 'song-instance.place',
				baseRevision: snapshot.revision,
				instance: createSongInstance({
					id,
					sourceLayerId: layer.id,
					startTick,
					durationTicks
				})
			})
			return id
		},
		[projectSession]
	)

	const deleteInstance = useCallback(
		(instanceValue: string): void => {
			const snapshot = projectSession.getSnapshot()
			const instance = snapshot.project.song.instances.find(
				(candidate) => candidate.id === instanceValue
			)
			if (instance === undefined) return
			projectSession.dispatch({
				type: 'song-instance.delete',
				baseRevision: snapshot.revision,
				instanceId: instance.id
			})
		},
		[projectSession]
	)

	const updateInstanceGesture = useCallback(
		(
			instanceValue: string,
			kind: ArrangementGestureKind,
			result: ArrangementGestureResult
		): void => {
			const snapshot = projectSession.getSnapshot()
			const instance = snapshot.project.song.instances.find(
				(candidate) => candidate.id === instanceValue
			)
			if (instance === undefined) return
			if (kind === 'move') {
				projectSession.dispatch({
					type: 'song-instance.move',
					baseRevision: snapshot.revision,
					instanceId: instance.id,
					startTick: result.startTick
				})
				return
			}
			if (kind === 'resize-right') {
				projectSession.dispatch({
					type: 'song-instance.resize',
					baseRevision: snapshot.revision,
					instanceId: instance.id,
					durationTicks: result.durationTicks
				})
				return
			}
			projectSession.dispatch({
				type: 'song-instance.trim-left',
				baseRevision: snapshot.revision,
				instanceId: instance.id,
				startTick: result.startTick,
				durationTicks: result.durationTicks,
				sourceOffsetTicks: result.sourceOffsetTicks
			})
		},
		[projectSession]
	)

	const splitInstance = useCallback(
		(instanceValue: string, splitOffsetTicks: number): string | null => {
			const snapshot = projectSession.getSnapshot()
			const instance = snapshot.project.song.instances.find(
				(candidate) => candidate.id === instanceValue
			)
			if (instance === undefined) return null
			const rightInstanceId = songInstanceId(
				projectSession.nextId('instance.arrangement.split')
			)
			projectSession.dispatch({
				type: 'song-instance.split',
				baseRevision: snapshot.revision,
				instanceId: instance.id,
				rightInstanceId,
				splitOffsetTicks
			})
			return rightInstanceId
		},
		[projectSession]
	)

	const duplicateLinked = useCallback(
		(instanceValue: string): string | null => {
			const snapshot = projectSession.getSnapshot()
			const instance = snapshot.project.song.instances.find(
				(candidate) => candidate.id === instanceValue
			)
			if (instance === undefined) return null
			const id = songInstanceId(projectSession.nextId('instance.arrangement.linked'))
			projectSession.dispatch({
				type: 'song-instance.place',
				baseRevision: snapshot.revision,
				instance: createSongInstance({
					...instance,
					id,
					startTick: instance.startTick + instance.durationTicks
				})
			})
			return id
		},
		[projectSession]
	)

	const duplicateAsVariation = useCallback(
		(instanceValue: string): string | null => {
			const snapshot = projectSession.getSnapshot()
			const instance = snapshot.project.song.instances.find(
				(candidate) => candidate.id === instanceValue
			)
			const source = snapshot.project.layers.find(
				(candidate) => candidate.id === instance?.sourceLayerId
			)
			if (instance === undefined || source === undefined || source.role === 'reference')
				return null
			const variationId = layerId(projectSession.nextId('layer.arrangement.variation'))
			const variation = variationLayer(source, variationId, projectSession.nextId)
			const variationInstanceId = songInstanceId(
				projectSession.nextId('instance.arrangement.variation')
			)
			projectSession.dispatch({
				type: 'layer.duplicate-as-variation',
				baseRevision: snapshot.revision,
				sourceLayerId: source.id,
				layer: variation,
				instance: createSongInstance({
					...instance,
					id: variationInstanceId,
					sourceLayerId: variation.id,
					startTick: instance.startTick + instance.durationTicks
				})
			})
			projectSession.selectLayer(variation.id)
			return variationInstanceId
		},
		[projectSession]
	)

	return {
		deleteInstance,
		duplicateAsVariation,
		duplicateLinked,
		placeInstance,
		splitInstance,
		updateInstanceGesture
	}
}
