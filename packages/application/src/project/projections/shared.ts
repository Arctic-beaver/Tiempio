import type { LocalizationKey } from '../../../../localization/src/index.js'
import { synthPresetDefinition, type ProjectLayer } from '../../../../project-core/src/index.js'
import type { StudioViewId } from '../../app/studio-state.js'
import type { LayerColor } from './types.js'

const rolePresentation: Readonly<
	Record<
		Exclude<ProjectLayer['role'], 'custom' | 'reference'>,
		{
			readonly color: LayerColor
			readonly labelKey: LocalizationKey
			readonly view: StudioViewId
		}
	>
> = Object.freeze({
	melody: { color: 'coral', labelKey: 'layers.melody', view: 'piano-roll' },
	harmony: { color: 'gold', labelKey: 'layers.chords', view: 'piano-roll' },
	bass: { color: 'blue', labelKey: 'layers.bass', view: 'piano-roll' },
	rhythm: { color: 'violet', labelKey: 'layers.drums', view: 'drums' }
})

export function layerPresentation(
	layer: ProjectLayer
): (typeof rolePresentation)[keyof typeof rolePresentation] {
	if (layer.role === 'custom' || layer.role === 'reference') {
		return { color: 'blue', labelKey: 'layers.melody', view: 'piano-roll' }
	}
	return rolePresentation[layer.role]
}

export function soundName(layer: ProjectLayer): string {
	if (layer.source.type === 'synth') {
		return synthPresetDefinition(layer.source.instrument.presetId).name
	}
	if (layer.source.type === 'drum') return 'Clean Pulse'
	return 'Reference'
}

export function noteName(pitch: number): string {
	const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
	return `${names[pitch % 12] ?? 'C'}${String(Math.floor(pitch / 12) - 1)}`
}

export function pianoPitches(): readonly number[] {
	return Array.from({ length: 128 }, (_, row) => 127 - row)
}

export function sectionPresentation(index: number): {
	readonly labelKey: LocalizationKey
	readonly tone: 'fade' | 'full' | 'open' | 'quiet'
} {
	const presentations = [
		{ labelKey: 'arrangement.intro', tone: 'quiet' },
		{ labelKey: 'arrangement.main', tone: 'full' },
		{ labelKey: 'arrangement.break', tone: 'open' },
		{ labelKey: 'arrangement.outro', tone: 'fade' }
	] as const
	return presentations[index] ?? presentations[1]
}
