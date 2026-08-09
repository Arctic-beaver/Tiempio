export type ShellWidthMode = 'compact' | 'standard' | 'wide'
export type ShellHeightMode = 'constrained' | 'comfortable'

export interface ShellLayoutModel {
	readonly heightMode: ShellHeightMode
	readonly layersPresentation: 'drawer' | 'panel'
	readonly contextPresentation: 'drawer' | 'panel'
	readonly widthMode: ShellWidthMode
}

export function resolveShellLayout(width: number, height: number): ShellLayoutModel {
	const widthMode: ShellWidthMode = width < 720 ? 'compact' : width < 1200 ? 'standard' : 'wide'
	return Object.freeze({
		widthMode,
		heightMode: height < 560 ? 'constrained' : 'comfortable',
		layersPresentation: widthMode === 'compact' ? 'drawer' : 'panel',
		contextPresentation: widthMode === 'wide' ? 'panel' : 'drawer'
	})
}
