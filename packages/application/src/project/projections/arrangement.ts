import { defaultTicksPerQuarter } from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import { layerPresentation, sectionPresentation } from './shared.js'
import type { ArrangementProjection } from './types.js'

export function projectArrangement({
	project,
	revision
}: StudioProjectionContext): ArrangementProjection {
	return {
		revision,
		totalBars: project.sections.reduce(
			(maximum, section) =>
				Math.max(
					maximum,
					(section.startTick + section.lengthTicks) / (defaultTicksPerQuarter * 4)
				),
			0
		),
		sectionIds: project.sections.map((section) => section.id),
		sections: project.sections.map((section, index) => ({
			id: section.id,
			bars: section.lengthTicks / (defaultTicksPerQuarter * 4),
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
