import type { LocalizationKey } from '../../../../localization/src/index.js'
import {
	defaultDrumVoiceVariants,
	drumVoiceVariantsFor,
	type DrumInstrument,
	type DrumVoiceVariantId
} from '../../../../project-core/src/index.js'
import type { StudioProjectionContext } from './projection-context.js'
import type { DrumsProjection } from './types.js'

const drumRows: readonly {
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}[] = Object.freeze([
	Object.freeze({ id: 'kick', labelKey: 'drums.kick' }),
	Object.freeze({ id: 'clap', labelKey: 'drums.clap' }),
	Object.freeze({ id: 'closedHat', labelKey: 'drums.closedHat' }),
	Object.freeze({ id: 'openHat', labelKey: 'drums.openHat' }),
	Object.freeze({ id: 'perc', labelKey: 'drums.perc' })
])

function variantName(variantId: DrumVoiceVariantId): string {
	const name = variantId.slice(variantId.indexOf('.') + 1)
	return `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`
}

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
	const voiceVariants =
		drumLayer?.source.type === 'drum'
			? drumLayer.source.voiceVariants
			: defaultDrumVoiceVariants
	return {
		revision,
		layerId: drumLayer?.id ?? null,
		clipId: drumClip?.id ?? null,
		character: drumClip?.character ?? 'straight',
		density: drumClip?.density ?? 0.38,
		swing: drumClip?.swing ?? 0.08,
		startTick: drumClip?.startTick ?? 0,
		stepCount,
		totalTicks,
		rows: drumRows.map((row) => {
			const selectedVariantId = voiceVariants[row.id]
			return {
				...row,
				selectedVariantId,
				selectedVariantName: variantName(selectedVariantId),
				variants: drumVoiceVariantsFor(row.id).map(({ variantId }) => ({
					id: variantId,
					name: variantName(variantId)
				})),
				activeSteps:
					drumClip?.kind === 'drum'
						? drumClip.events
								.filter((event) => event.instrument === row.id)
								.map((event) => event.step)
								.sort((left, right) => left - right)
						: []
			}
		})
	}
}
