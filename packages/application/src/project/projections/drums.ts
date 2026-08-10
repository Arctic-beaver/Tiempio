import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { DrumsProjection } from './types.js'

const drumRows: readonly {
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}[] = Object.freeze([
	Object.freeze({ id: 'kick', labelKey: 'drums.kick' }),
	Object.freeze({ id: 'snare', labelKey: 'drums.snare' }),
	Object.freeze({ id: 'hat', labelKey: 'drums.hat' }),
	Object.freeze({ id: 'clap', labelKey: 'drums.clap' })
])

export function projectDrums({
	drumClip,
	drumLayer,
	revision
}: StudioProjectionContext): DrumsProjection {
	return {
		revision,
		layerId: drumLayer?.id ?? null,
		clipId: drumClip?.id ?? null,
		stepCount: drumClip?.kind === 'drum' ? drumClip.pattern.stepCount : 16,
		rows: drumRows.map((row) => ({
			...row,
			activeSteps:
				drumClip?.kind === 'drum'
					? drumClip.events
							.filter((event) => event.instrument === row.id)
							.map((event) => event.step)
							.sort((left, right) => left - right)
					: []
		}))
	}
}
