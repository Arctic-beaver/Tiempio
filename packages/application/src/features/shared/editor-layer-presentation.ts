import type { ProjectedLayerItem } from '../../project/projections/types.js'

export function editorLayerName(item: ProjectedLayerItem | undefined): string {
	if (item?.labelKey === 'layers.drums') return 'Drums'
	if (item?.labelKey === 'layers.chords') return 'Harmony'
	if (item?.labelKey === 'layers.melody') return 'Melody'
	return 'Bass'
}

export function editorLayerSound(item: ProjectedLayerItem | undefined): string {
	if (item === undefined) return 'Deep'
	if (item.labelKey === 'layers.drums') return 'Clean Pulse'
	if (item.labelKey === 'layers.chords') return 'Soft Pad'
	if (item.labelKey === 'layers.melody') return 'Glass Lead'
	return item.soundName
}

export function editorLayerDetail(item: ProjectedLayerItem, includeBassRange: boolean): string {
	const sound = editorLayerSound(item)
	return includeBassRange && item.labelKey === 'layers.bass' ? `${sound} · A1–A3` : sound
}
