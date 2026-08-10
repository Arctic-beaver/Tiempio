import type { LocalizationKey } from '../../../../localization/src/index.js'
import type { ProjectLayer } from '../../../../project-core/src/index.js'
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
	if (layer.source.type === 'synth') return 'Deep'
	if (layer.source.type === 'drum') return 'Basic kit'
	return 'Reference'
}

export function noteName(pitch: number): string {
	const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
	return `${names[pitch % 12] ?? 'C'}${String(Math.floor(pitch / 12) - 1)}`
}

export function pianoPitches(layer: ProjectLayer | null): readonly number[] {
	const base = layer?.role === 'bass' ? 36 : 60
	return [base + 12, base + 11, base + 9, base + 7, base + 5, base + 4, base + 2, base]
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
