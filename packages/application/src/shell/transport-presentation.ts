export function transportPositionPercent(tick: number, startTick: number, endTick: number): number {
	if (
		!Number.isFinite(tick) ||
		!Number.isFinite(startTick) ||
		!Number.isFinite(endTick) ||
		endTick <= startTick
	) {
		return 0
	}
	const percent = ((tick - startTick) / (endTick - startTick)) * 100
	return Math.min(100, Math.max(0, percent))
}
