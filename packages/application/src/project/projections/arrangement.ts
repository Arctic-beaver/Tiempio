import type { StudioProjectionContext } from './projection-context.js'
import { layerPresentation } from './shared.js'
import type { ArrangementProjection } from './types.js'

function barsInRange(
	startTick: number,
	endTick: number,
	meterMap: StudioProjectionContext['project']['transport']['meterMap'],
	ticksPerQuarter: number
): number {
	return meterMap.reduce((total, meter, index) => {
		const segmentStart = Math.max(startTick, meter.tick)
		const segmentEnd = Math.min(endTick, meterMap[index + 1]?.tick ?? endTick)
		if (segmentEnd <= segmentStart) return total
		const ticksPerBeat = (ticksPerQuarter * 4) / meter.denominator
		return total + (segmentEnd - segmentStart) / (ticksPerBeat * meter.numerator)
	}, 0)
}

export function projectArrangement({
	project,
	revision
}: StudioProjectionContext): ArrangementProjection {
	const endTick = project.song.instances.reduce(
		(maximum, instance) => Math.max(maximum, instance.startTick + instance.durationTicks),
		0
	)
	return {
		endTick,
		meterNumerator: project.transport.meterMap[0]?.numerator ?? 4,
		revision,
		ticksPerQuarter: project.transport.ticksPerQuarter,
		totalBars: barsInRange(
			0,
			endTick,
			project.transport.meterMap,
			project.transport.ticksPerQuarter
		),
		layers: project.layers
			.filter((layer) => layer.role !== 'reference')
			.map((layer) => {
				const material = layer.material
				return {
					id: layer.id,
					labelKey: layerPresentation(layer).labelKey,
					color: layerPresentation(layer).color,
					kind: material.kind === 'drum' ? ('drum' as const) : ('midi' as const),
					materialLengthTicks: material.materialLengthTicks,
					tailRestTicks: material.tailRestTicks,
					cycleTicks:
						material.materialLengthTicks + material.tailRestTicks ||
						project.transport.ticksPerQuarter * 4,
					notes:
						material.kind === 'midi'
							? material.notes.map((note) => ({
									id: note.id,
									pitch: note.pitch,
									startTick: note.startTick,
									durationTicks: note.durationTicks
								}))
							: [],
					hits:
						material.kind === 'drum'
							? material.events.map((event) => ({
									id: event.id,
									instrument: event.instrument,
									tick: Math.round(
										(event.step * project.transport.ticksPerQuarter) /
											material.pattern.stepsPerQuarter
									)
								}))
							: [],
					instances: project.song.instances
						.filter((instance) => instance.sourceLayerId === layer.id)
						.map((instance) => ({ ...instance }))
				}
			})
	}
}
