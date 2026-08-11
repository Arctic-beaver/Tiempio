import type { StudioProjectionContext } from './projection-context.js'
import { layerPresentation, sectionPresentation } from './shared.js'
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
	const endTick = project.sections.reduce(
		(maximum, section) => Math.max(maximum, section.startTick + section.lengthTicks),
		0
	)
	return {
		endTick,
		revision,
		totalBars: barsInRange(
			0,
			endTick,
			project.transport.meterMap,
			project.transport.ticksPerQuarter
		),
		sectionIds: project.sections.map((section) => section.id),
		sections: project.sections.map((section, index) => ({
			id: section.id,
			bars: barsInRange(
				section.startTick,
				section.startTick + section.lengthTicks,
				project.transport.meterMap,
				project.transport.ticksPerQuarter
			),
			...sectionPresentation(index)
		})),
		layers: project.layers
			.filter((layer) => layer.role !== 'reference')
			.map((layer) => ({
				id: layer.id,
				labelKey: layerPresentation(layer).labelKey,
				color: layerPresentation(layer).color,
				sections: layer.clips.flatMap((clip) =>
					clip.sectionId === null ? [] : [clip.sectionId]
				)
			}))
	}
}
