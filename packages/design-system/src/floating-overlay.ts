export type FloatingOverlaySide = 'above' | 'below'
export type FloatingOverlayAlignment = 'start' | 'end'

export interface FloatingOverlayRectangle {
	readonly bottom: number
	readonly height: number
	readonly left: number
	readonly right: number
	readonly top: number
	readonly width: number
}

export interface FloatingOverlaySize {
	readonly height: number
	readonly width: number
}

export interface FloatingOverlayViewport {
	readonly height: number
	readonly left?: number
	readonly top?: number
	readonly width: number
}

export interface FloatingOverlayPlacement {
	readonly height: number
	readonly left: number
	readonly maxHeight: number
	readonly side: FloatingOverlaySide
	readonly top: number
	readonly width: number
}

export interface FloatingOverlayPlacementInput {
	readonly alignment?: FloatingOverlayAlignment
	readonly anchor: FloatingOverlayRectangle
	readonly gap?: number
	readonly minimumWidth?: number
	readonly panel: FloatingOverlaySize
	readonly safeInset?: number
	readonly viewport: FloatingOverlayViewport
}

function bounded(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) return minimum
	return Math.min(Math.max(value, minimum), maximum)
}

export function calculateFloatingOverlayPlacement({
	alignment = 'start',
	anchor,
	gap = 8,
	minimumWidth = 0,
	panel,
	safeInset = 12,
	viewport
}: FloatingOverlayPlacementInput): FloatingOverlayPlacement {
	const inset = Math.max(0, safeInset)
	const spacing = Math.max(0, gap)
	const viewportLeft = viewport.left ?? 0
	const viewportTop = viewport.top ?? 0
	const viewportRight = viewportLeft + viewport.width
	const viewportBottom = viewportTop + viewport.height
	const availableWidth = Math.max(0, viewport.width - inset * 2)
	const desiredWidth = Math.max(anchor.width, minimumWidth, panel.width)
	const width = Math.min(availableWidth, Math.max(0, desiredWidth))
	const belowSpace = Math.max(0, viewportBottom - inset - anchor.bottom - spacing)
	const aboveSpace = Math.max(0, anchor.top - viewportTop - inset - spacing)
	const side: FloatingOverlaySide =
		panel.height <= belowSpace || belowSpace >= aboveSpace ? 'below' : 'above'
	const maxHeight = side === 'below' ? belowSpace : aboveSpace
	const height = Math.min(Math.max(0, panel.height), maxHeight)
	const preferredLeft = alignment === 'end' ? anchor.right - width : anchor.left
	const minimumLeft = viewportLeft + inset
	const maximumLeft = Math.max(minimumLeft, viewportRight - inset - width)
	const left = bounded(preferredLeft, minimumLeft, maximumLeft)
	const top =
		side === 'below'
			? Math.min(viewportBottom - inset - height, anchor.bottom + spacing)
			: Math.max(viewportTop + inset, anchor.top - spacing - height)

	return Object.freeze({ height, left, maxHeight, side, top, width })
}

export function floatingOverlayPathIsOwned(
	path: readonly EventTarget[],
	owners: readonly EventTarget[]
): boolean {
	return owners.some((owner) => path.includes(owner))
}
