import {
	performanceSourceId,
	type PerformanceInputSession,
	type PerformanceSourceId
} from './performance-input-session.js'

export interface PerformanceKeyboardEvent {
	readonly altKey: boolean
	readonly code: string
	readonly ctrlKey: boolean
	readonly defaultPrevented?: boolean
	readonly isComposing: boolean
	readonly metaKey: boolean
	readonly repeat: boolean
	readonly shiftKey: boolean
	readonly target: EventTarget | null
	preventDefault(): void
}

export interface PerformancePointerCaptureTarget {
	hasPointerCapture(pointerId: number): boolean
	releasePointerCapture(pointerId: number): void
	setPointerCapture(pointerId: number): void
}

export interface PerformancePointerEvent {
	readonly button: number
	readonly currentTarget: PerformancePointerCaptureTarget
	readonly isPrimary: boolean
	readonly pointerId: number
	readonly pointerType: string
	preventDefault(): void
}

function editableTarget(target: EventTarget | null): boolean {
	if (target === null || typeof target !== 'object') return false
	const candidate = target as {
		readonly closest?: (selectors: string) => unknown
		readonly isContentEditable?: boolean
		readonly tagName?: string
	}
	return (
		candidate.isContentEditable === true ||
		candidate.tagName === 'INPUT' ||
		candidate.tagName === 'TEXTAREA' ||
		candidate.tagName === 'SELECT' ||
		candidate.closest?.('dialog, [role="dialog"], [aria-modal="true"]') != null
	)
}

export function keyboardPerformanceSource(code: string): PerformanceSourceId {
	return performanceSourceId('keyboard', code)
}

export function pointerPerformanceSource(pointerId: number): PerformanceSourceId {
	if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
		throw new RangeError('Pointer ID must be a non-negative safe integer.')
	}
	return performanceSourceId('pointer', pointerId)
}

export function performanceKeyDown(
	session: PerformanceInputSession,
	ownerId: string,
	event: PerformanceKeyboardEvent
): boolean {
	if (
		event.defaultPrevented === true ||
		event.repeat ||
		event.isComposing ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey ||
		editableTarget(event.target)
	) {
		return false
	}
	const accepted = session.pressCode(ownerId, keyboardPerformanceSource(event.code), event.code)
	if (accepted) event.preventDefault()
	return accepted
}

export function performanceKeyUp(
	session: PerformanceInputSession,
	event: Pick<PerformanceKeyboardEvent, 'code' | 'preventDefault'>
): boolean {
	const released = session.releaseSource(keyboardPerformanceSource(event.code))
	if (released) event.preventDefault()
	return released
}

function primaryPointer(event: PerformancePointerEvent): boolean {
	if (event.pointerType === 'touch') return true
	return event.isPrimary && event.button === 0
}

export function performancePointerDown(
	session: PerformanceInputSession,
	ownerId: string,
	code: string,
	event: PerformancePointerEvent
): boolean {
	if (!primaryPointer(event)) return false
	const sourceId = pointerPerformanceSource(event.pointerId)
	if (!session.pressCode(ownerId, sourceId, code)) return false
	try {
		event.currentTarget.setPointerCapture(event.pointerId)
	} catch {
		session.releaseSource(sourceId)
		return false
	}
	event.preventDefault()
	return true
}

export function performancePointerEnd(
	session: PerformanceInputSession,
	event: Pick<PerformancePointerEvent, 'currentTarget' | 'pointerId' | 'preventDefault'>
): boolean {
	const released = session.releaseSource(pointerPerformanceSource(event.pointerId))
	if (event.currentTarget.hasPointerCapture(event.pointerId)) {
		event.currentTarget.releasePointerCapture(event.pointerId)
	}
	if (released) event.preventDefault()
	return released
}

export function performancePointerCaptureLost(
	session: PerformanceInputSession,
	pointerId: number
): boolean {
	return session.releaseSource(pointerPerformanceSource(pointerId))
}
