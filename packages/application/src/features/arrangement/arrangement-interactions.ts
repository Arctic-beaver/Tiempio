import type { ArrangementInstanceViewModel } from './view-model.js'

export type ArrangementGestureKind = 'move' | 'resize-left' | 'resize-right'

export interface ArrangementGestureResult {
	readonly durationTicks: number
	readonly sourceOffsetTicks: number
	readonly startTick: number
}

function boundedTick(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export function snapArrangementTick(tick: number, gridTicks: number): number {
	const bounded = boundedTick(tick)
	if (!Number.isSafeInteger(gridTicks) || gridTicks <= 0) return bounded
	return Math.round(bounded / gridTicks) * gridTicks
}

export function arrangementTickAtPoint(
	clientX: number,
	left: number,
	width: number,
	endTick: number
): number {
	if (!Number.isFinite(width) || width <= 0 || !Number.isSafeInteger(endTick) || endTick <= 0) {
		return 0
	}
	const ratio = Math.min(1, Math.max(0, (clientX - left) / width))
	return Math.round(ratio * endTick)
}

export function arrangementGestureResult(
	instance: ArrangementInstanceViewModel,
	kind: ArrangementGestureKind,
	deltaTicks: number,
	gridTicks: number
): ArrangementGestureResult {
	const delta = snapArrangementTick(Math.abs(deltaTicks), gridTicks) * Math.sign(deltaTicks)
	if (kind === 'move') {
		return Object.freeze({
			startTick: Math.max(0, instance.startTick + delta),
			durationTicks: instance.durationTicks,
			sourceOffsetTicks: instance.sourceOffsetTicks
		})
	}
	if (kind === 'resize-right') {
		return Object.freeze({
			startTick: instance.startTick,
			durationTicks: Math.max(gridTicks, instance.durationTicks + delta),
			sourceOffsetTicks: instance.sourceOffsetTicks
		})
	}
	const maximumDelta = instance.durationTicks - gridTicks
	const applied = Math.min(maximumDelta, Math.max(0, delta))
	return Object.freeze({
		startTick: instance.startTick + applied,
		durationTicks: instance.durationTicks - applied,
		sourceOffsetTicks: instance.sourceOffsetTicks + applied
	})
}

export function splitOffsetForTick(
	instance: ArrangementInstanceViewModel,
	absoluteTick: number,
	gridTicks: number
): number | null {
	const offset = snapArrangementTick(absoluteTick - instance.startTick, gridTicks)
	return offset > 0 && offset < instance.durationTicks ? offset : null
}
