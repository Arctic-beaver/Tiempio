import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { DrumInstrument } from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { DrumsProjection } from './types.js'

const drumRows: readonly {
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}[] = Object.freeze([
	Object.freeze({ id: 'kick', labelKey: 'drums.kick' }),
	Object.freeze({ id: 'clap', labelKey: 'drums.clap' }),
	Object.freeze({ id: 'closedHat', labelKey: 'drums.hat' }),
	Object.freeze({ id: 'openHat', labelKey: 'drums.hat' }),
	Object.freeze({ id: 'perc', labelKey: 'drums.snare' })
])

export function projectDrums({
	drumClip,
	drumLayer,
	project,
	revision
}: StudioProjectionContext): DrumsProjection {
	const defaultLengthTicks = project.transport.ticksPerQuarter * 4
	const stepCount = drumClip?.kind === 'drum' ? drumClip.pattern.stepCount : 16
	const totalTicks =
		drumClip?.kind === 'drum'
			? (stepCount * project.transport.ticksPerQuarter) / drumClip.pattern.stepsPerQuarter
			: defaultLengthTicks
	return {
		revision,
		layerId: drumLayer?.id ?? null,
		clipId: drumClip?.id ?? null,
		startTick: drumClip?.startTick ?? 0,
		stepCount,
		totalTicks,
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
