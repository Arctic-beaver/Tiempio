import { projectLimits } from '../../../../project-core/src/index.js'

export const sourceViewportVersion = 1 as const

export const sourceViewportLimits = Object.freeze({
	horizontalZoomMinimum: 0.5,
	horizontalZoomMaximum: 4,
	verticalZoomMinimum: 0.65,
	verticalZoomMaximum: 2.25,
	minimumPitch: 0,
	maximumPitch: 127,
	maximumSourceTick: projectLimits.maxMaterialTick
})

export interface SourceViewportState {
	readonly followPreference: boolean
	readonly horizontalZoom: number
	readonly manualPlayheadTick: number
	readonly pitchAnchor: number
	readonly sourceLayerId: string
	readonly timeAnchorTick: number
	readonly verticalZoom: number
	readonly version: typeof sourceViewportVersion
}

export interface SourceViewportDefaults {
	readonly pitchAnchor: number
	readonly timeAnchorTick?: number
}

export type SourceViewportUpdate = Partial<Omit<SourceViewportState, 'sourceLayerId' | 'version'>>

type SourceViewportListener = () => void

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value))
}

function finiteOr(value: number | undefined, fallback: number): number {
	return value === undefined || !Number.isFinite(value) ? fallback : value
}

export function createSourceViewportState(
	sourceLayerId: string,
	defaults: SourceViewportDefaults
): SourceViewportState {
	return Object.freeze({
		version: sourceViewportVersion,
		sourceLayerId,
		manualPlayheadTick: 0,
		timeAnchorTick: clamp(
			Math.round(finiteOr(defaults.timeAnchorTick, 0)),
			0,
			sourceViewportLimits.maximumSourceTick
		),
		pitchAnchor: clamp(
			finiteOr(defaults.pitchAnchor, 60),
			sourceViewportLimits.minimumPitch,
			sourceViewportLimits.maximumPitch
		),
		horizontalZoom: 1,
		verticalZoom: 1,
		followPreference: true
	})
}

function updatedSourceViewportState(
	current: SourceViewportState,
	update: SourceViewportUpdate
): SourceViewportState {
	return Object.freeze({
		...current,
		manualPlayheadTick: clamp(
			Math.round(finiteOr(update.manualPlayheadTick, current.manualPlayheadTick)),
			0,
			sourceViewportLimits.maximumSourceTick
		),
		timeAnchorTick: clamp(
			Math.round(finiteOr(update.timeAnchorTick, current.timeAnchorTick)),
			0,
			sourceViewportLimits.maximumSourceTick
		),
		pitchAnchor: clamp(
			finiteOr(update.pitchAnchor, current.pitchAnchor),
			sourceViewportLimits.minimumPitch,
			sourceViewportLimits.maximumPitch
		),
		horizontalZoom: clamp(
			finiteOr(update.horizontalZoom, current.horizontalZoom),
			sourceViewportLimits.horizontalZoomMinimum,
			sourceViewportLimits.horizontalZoomMaximum
		),
		verticalZoom: clamp(
			finiteOr(update.verticalZoom, current.verticalZoom),
			sourceViewportLimits.verticalZoomMinimum,
			sourceViewportLimits.verticalZoomMaximum
		),
		followPreference: update.followPreference ?? current.followPreference
	})
}

export class SourceViewportStore {
	readonly #listeners = new Map<string, Set<SourceViewportListener>>()
	readonly #states = new Map<string, SourceViewportState>()

	public get(sourceLayerId: string, defaults: SourceViewportDefaults): SourceViewportState {
		const current = this.#states.get(sourceLayerId)
		if (current !== undefined) return current
		const created = createSourceViewportState(sourceLayerId, defaults)
		this.#states.set(sourceLayerId, created)
		return created
	}

	public subscribe(sourceLayerId: string, listener: SourceViewportListener): () => void {
		const listeners = this.#listeners.get(sourceLayerId) ?? new Set<SourceViewportListener>()
		listeners.add(listener)
		this.#listeners.set(sourceLayerId, listeners)
		return () => {
			listeners.delete(listener)
			if (listeners.size === 0) this.#listeners.delete(sourceLayerId)
		}
	}

	public update(
		sourceLayerId: string,
		defaults: SourceViewportDefaults,
		update: SourceViewportUpdate
	): SourceViewportState {
		const current = this.get(sourceLayerId, defaults)
		const next = updatedSourceViewportState(current, update)
		if (
			current.manualPlayheadTick === next.manualPlayheadTick &&
			current.timeAnchorTick === next.timeAnchorTick &&
			current.pitchAnchor === next.pitchAnchor &&
			current.horizontalZoom === next.horizontalZoom &&
			current.verticalZoom === next.verticalZoom &&
			current.followPreference === next.followPreference
		) {
			return current
		}
		this.#states.set(sourceLayerId, next)
		for (const listener of this.#listeners.get(sourceLayerId) ?? []) listener()
		return next
	}

	public delete(sourceLayerId: string): void {
		if (!this.#states.delete(sourceLayerId)) return
		for (const listener of this.#listeners.get(sourceLayerId) ?? []) listener()
	}
}

export const sourceViewportStore = new SourceViewportStore()

export interface SourceViewportNote {
	readonly durationTicks: number
	readonly id: string
	readonly pitchValue: number
	readonly startTick: number
}

export interface SourceViewportWindow {
	readonly endTick: number
	readonly highestPitch: number
	readonly lowestPitch: number
	readonly startTick: number
}

export interface SourceViewportPixelMetrics {
	readonly canvasTicks: number
	readonly canvasWidth: number
	readonly clientHeight: number
	readonly clientWidth: number
	readonly keysWidth: number
	readonly rowHeight: number
	readonly rulerHeight: number
	readonly scrollLeft: number
	readonly scrollTop: number
}

export function sourceViewportWindowFromPixels(
	metrics: SourceViewportPixelMetrics
): SourceViewportWindow {
	const timelineLeft = Math.max(0, metrics.scrollLeft - metrics.keysWidth)
	const timelineWidth = Math.max(1, metrics.clientWidth - metrics.keysWidth)
	const startTick = clamp(
		Math.round((timelineLeft / Math.max(1, metrics.canvasWidth)) * metrics.canvasTicks),
		0,
		metrics.canvasTicks
	)
	const endTick = clamp(
		Math.ceil(
			((timelineLeft + timelineWidth) / Math.max(1, metrics.canvasWidth)) *
				metrics.canvasTicks
		),
		startTick,
		metrics.canvasTicks
	)
	const firstVisibleRow = Math.max(
		0,
		(metrics.scrollTop - metrics.rulerHeight) / Math.max(1, metrics.rowHeight)
	)
	const lastVisibleRow = Math.max(
		firstVisibleRow,
		(metrics.scrollTop + metrics.clientHeight - metrics.rulerHeight) /
			Math.max(1, metrics.rowHeight)
	)
	return Object.freeze({
		startTick,
		endTick,
		highestPitch: clamp(
			Math.ceil(sourceViewportLimits.maximumPitch - firstVisibleRow),
			sourceViewportLimits.minimumPitch,
			sourceViewportLimits.maximumPitch
		),
		lowestPitch: clamp(
			Math.floor(sourceViewportLimits.maximumPitch - lastVisibleRow),
			sourceViewportLimits.minimumPitch,
			sourceViewportLimits.maximumPitch
		)
	})
}

export interface OffscreenSourceNotes {
	readonly above: readonly SourceViewportNote[]
	readonly below: readonly SourceViewportNote[]
}

export function offscreenSourceNotes(
	notes: readonly SourceViewportNote[],
	window: SourceViewportWindow
): OffscreenSourceNotes {
	const intersectsTime = (note: SourceViewportNote): boolean =>
		note.startTick < window.endTick && note.startTick + note.durationTicks > window.startTick
	return Object.freeze({
		above: Object.freeze(
			notes
				.filter((note) => intersectsTime(note) && note.pitchValue > window.highestPitch)
				.sort(
					(left, right) =>
						left.startTick - right.startTick || right.pitchValue - left.pitchValue
				)
		),
		below: Object.freeze(
			notes
				.filter((note) => intersectsTime(note) && note.pitchValue < window.lowestPitch)
				.sort(
					(left, right) =>
						left.startTick - right.startTick || left.pitchValue - right.pitchValue
				)
		)
	})
}

export function sourceCanvasTicks(
	materialEndTick: number,
	viewport: Pick<SourceViewportState, 'manualPlayheadTick' | 'timeAnchorTick'>,
	ticksPerBar: number
): number {
	const chunk = Math.max(1, ticksPerBar * 16)
	const required = Math.max(
		chunk,
		materialEndTick,
		viewport.manualPlayheadTick + ticksPerBar * 4,
		viewport.timeAnchorTick + ticksPerBar * 8
	)
	return Math.min(sourceViewportLimits.maximumSourceTick, Math.ceil(required / chunk) * chunk)
}

export function tickAtSourcePointer(
	clientX: number,
	left: number,
	width: number,
	canvasTicks: number
): number {
	const ratio = clamp((clientX - left) / Math.max(1, width), 0, 1)
	return clamp(Math.round(ratio * canvasTicks), 0, sourceViewportLimits.maximumSourceTick)
}
