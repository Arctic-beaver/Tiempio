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

export interface TransportMeterPoint {
	readonly denominator: number
	readonly numerator: number
	readonly tick: number
}

export interface TransportBeatPresentation {
	readonly bar: number
	readonly beat: number
	readonly denominator: number
	readonly numerator: number
	readonly ticksPerBeat: number
}

export interface TransportRulerMarker extends TransportBeatPresentation {
	readonly downbeat: boolean
	readonly durationTicks: number
	readonly tick: number
}

function validMeterMap(meterMap: readonly TransportMeterPoint[]): boolean {
	return (
		meterMap.length > 0 &&
		meterMap.every(
			(point, index) =>
				Number.isSafeInteger(point.tick) &&
				point.tick >= 0 &&
				Number.isSafeInteger(point.numerator) &&
				point.numerator > 0 &&
				[1, 2, 4, 8, 16].includes(point.denominator) &&
				(index > 0
					? (meterMap[index - 1]?.tick ?? point.tick) < point.tick
					: point.tick === 0)
		)
	)
}

function meterSegmentBars(
	point: TransportMeterPoint,
	endTick: number,
	ticksPerQuarter: number
): number {
	const ticksPerBeat = (ticksPerQuarter * 4) / point.denominator
	const ticksPerBar = ticksPerBeat * point.numerator
	return Math.ceil((endTick - point.tick) / ticksPerBar)
}

export function transportBeatPresentation(
	tick: number,
	meterMap: readonly TransportMeterPoint[],
	ticksPerQuarter: number
): TransportBeatPresentation {
	if (!Number.isFinite(tick) || !validMeterMap(meterMap) || ticksPerQuarter <= 0) {
		return { bar: 1, beat: 1, denominator: 4, numerator: 4, ticksPerBeat: 960 }
	}
	const boundedTick = Math.max(0, tick)
	let segmentIndex = 0
	for (const [index, point] of meterMap.entries()) {
		if (point.tick > boundedTick) break
		segmentIndex = index
	}
	let barsBefore = 0
	for (let index = 0; index < segmentIndex; index += 1) {
		const point = meterMap[index]
		const next = meterMap[index + 1]
		if (point !== undefined && next !== undefined) {
			barsBefore += meterSegmentBars(point, next.tick, ticksPerQuarter)
		}
	}
	const meter = meterMap[segmentIndex] ??
		meterMap[0] ?? {
			tick: 0,
			numerator: 4,
			denominator: 4
		}
	const ticksPerBeat = (ticksPerQuarter * 4) / meter.denominator
	const localBeat = Math.floor((boundedTick - meter.tick) / ticksPerBeat)
	return {
		bar: barsBefore + Math.floor(localBeat / meter.numerator) + 1,
		beat: (localBeat % meter.numerator) + 1,
		denominator: meter.denominator,
		numerator: meter.numerator,
		ticksPerBeat
	}
}

export function transportRulerMarkers(
	startTick: number,
	endTick: number,
	meterMap: readonly TransportMeterPoint[],
	ticksPerQuarter: number,
	granularity: 'bar' | 'beat'
): readonly TransportRulerMarker[] {
	if (
		!Number.isSafeInteger(startTick) ||
		!Number.isSafeInteger(endTick) ||
		startTick < 0 ||
		endTick <= startTick ||
		!validMeterMap(meterMap) ||
		!Number.isSafeInteger(ticksPerQuarter) ||
		ticksPerQuarter <= 0
	) {
		return []
	}
	const markers: TransportRulerMarker[] = []
	for (const [segmentIndex, meter] of meterMap.entries()) {
		const segmentEnd = Math.min(endTick, meterMap[segmentIndex + 1]?.tick ?? endTick)
		if (segmentEnd <= startTick || meter.tick >= endTick) continue
		const ticksPerBeat = (ticksPerQuarter * 4) / meter.denominator
		let beatIndex = 0
		for (let markerTick = meter.tick; markerTick < segmentEnd; markerTick += ticksPerBeat) {
			const downbeat = beatIndex % meter.numerator === 0
			if (markerTick >= startTick && (granularity === 'beat' || downbeat)) {
				const presentation = transportBeatPresentation(
					markerTick,
					meterMap,
					ticksPerQuarter
				)
				markers.push({
					...presentation,
					downbeat,
					durationTicks: ticksPerBeat,
					tick: markerTick
				})
				if (markers.length >= 512) break
			}
			beatIndex += 1
		}
		if (markers.length >= 512) break
	}
	return markers.map((marker, index) => ({
		...marker,
		durationTicks: (markers[index + 1]?.tick ?? endTick) - marker.tick
	}))
}
