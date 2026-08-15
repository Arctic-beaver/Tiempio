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
	readonly timeStamp: number
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
	readonly pressure: number
	readonly timeStamp: number
	preventDefault(): void
}

export type PerformanceFocusTarget =
	| 'text-editing'
	| 'range-adjustment'
	| 'action-control'
	| 'performance-surface'
	| 'modal-or-capture'

interface SemanticEventTarget {
	readonly closest?: (selectors: string) => unknown
	readonly getAttribute?: (name: string) => string | null
	readonly isContentEditable?: boolean
	readonly role?: string
	readonly tagName?: string
	readonly type?: string
}

const modalOrCaptureSelector =
	'dialog, [role="dialog"], [aria-modal="true"], [data-capturing="true"], [data-performance-routing="blocked"]'
const delegatedPerformanceSelector = '[data-performance-routing="allow"]'
const textInputTypes = new Set([
	'',
	'date',
	'datetime-local',
	'email',
	'month',
	'number',
	'password',
	'search',
	'tel',
	'text',
	'time',
	'url',
	'week'
])
const actionInputTypes = new Set([
	'button',
	'checkbox',
	'color',
	'file',
	'hidden',
	'image',
	'radio',
	'reset',
	'submit'
])
const textEditingRoles = new Set(['combobox', 'searchbox', 'spinbutton', 'textbox'])
const actionRoles = new Set([
	'button',
	'checkbox',
	'link',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'radio',
	'switch',
	'tab'
])

function targetAttribute(target: SemanticEventTarget, name: string): string | null {
	const value = target.getAttribute?.(name)
	if (typeof value === 'string') return value.toLowerCase()
	if (name === 'role' && typeof target.role === 'string') return target.role.toLowerCase()
	if (name === 'type' && typeof target.type === 'string') return target.type.toLowerCase()
	return null
}

export function classifyPerformanceFocusTarget(target: EventTarget | null): PerformanceFocusTarget {
	if (target === null || typeof target !== 'object') return 'performance-surface'
	const candidate = target as SemanticEventTarget
	if (
		candidate.closest?.(modalOrCaptureSelector) != null &&
		candidate.closest?.(delegatedPerformanceSelector) == null
	) {
		return 'modal-or-capture'
	}
	const tagName = candidate.tagName?.toUpperCase() ?? ''
	const role = targetAttribute(candidate, 'role')
	const contentEditable = targetAttribute(candidate, 'contenteditable')
	if (
		candidate.isContentEditable === true ||
		(contentEditable !== null && contentEditable !== 'false') ||
		tagName === 'TEXTAREA' ||
		tagName === 'SELECT' ||
		(role !== null && textEditingRoles.has(role))
	) {
		return 'text-editing'
	}
	if (tagName === 'INPUT') {
		const inputType = targetAttribute(candidate, 'type') ?? ''
		if (inputType === 'range') return 'range-adjustment'
		if (textInputTypes.has(inputType)) return 'text-editing'
		if (actionInputTypes.has(inputType)) return 'action-control'
		return 'text-editing'
	}
	if (tagName === 'BUTTON' || tagName === 'A' || (role !== null && actionRoles.has(role))) {
		return 'action-control'
	}
	if (candidate.closest?.('[data-performance-surface="true"]') != null) {
		return 'performance-surface'
	}
	return 'performance-surface'
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

export function midiPerformanceSource(
	deviceIdentity: string,
	channel: number,
	pitch: number
): PerformanceSourceId {
	if (!Number.isSafeInteger(channel) || channel < 0 || channel > 15) {
		throw new RangeError('MIDI channel must be an integer from 0 through 15.')
	}
	if (!Number.isSafeInteger(pitch) || pitch < 0 || pitch > 127) {
		throw new RangeError('MIDI pitch must be an integer from 0 through 127.')
	}
	return performanceSourceId('midi', `${deviceIdentity}:${String(channel)}:${String(pitch)}`)
}

export function performancePointerVelocity(
	pointerType: string,
	pressure: number,
	fallbackVelocity = 102
): number {
	if (!Number.isSafeInteger(fallbackVelocity) || fallbackVelocity < 1 || fallbackVelocity > 127) {
		throw new RangeError('Fallback velocity must be an integer from 1 through 127.')
	}
	if (
		(pointerType === 'touch' || pointerType === 'pen') &&
		Number.isFinite(pressure) &&
		pressure > 0
	) {
		const normalized = Math.min(1, Math.max(0, pressure))
		return Math.min(127, Math.max(1, Math.round(1 + Math.sqrt(normalized) * 126)))
	}
	return fallbackVelocity
}

export function performanceKeyDown(
	session: PerformanceInputSession,
	ownerId: string,
	event: PerformanceKeyboardEvent
): boolean {
	const focusTarget = classifyPerformanceFocusTarget(event.target)
	if (
		event.defaultPrevented === true ||
		event.repeat ||
		event.isComposing ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey ||
		focusTarget === 'text-editing' ||
		focusTarget === 'modal-or-capture'
	) {
		return false
	}
	const accepted = session.pressCode(
		ownerId,
		keyboardPerformanceSource(event.code),
		event.code,
		102,
		event.timeStamp
	)
	if (accepted) event.preventDefault()
	return accepted
}

export function performanceKeyUp(
	session: PerformanceInputSession,
	event: Pick<PerformanceKeyboardEvent, 'code' | 'preventDefault' | 'timeStamp'>
): boolean {
	const released = session.releaseSource(keyboardPerformanceSource(event.code), event.timeStamp)
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
	if (
		!session.pressCode(
			ownerId,
			sourceId,
			code,
			performancePointerVelocity(event.pointerType, event.pressure),
			event.timeStamp
		)
	) {
		return false
	}
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
	event: Pick<
		PerformancePointerEvent,
		'currentTarget' | 'pointerId' | 'preventDefault' | 'timeStamp'
	>
): boolean {
	const released = session.releaseSource(
		pointerPerformanceSource(event.pointerId),
		event.timeStamp
	)
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
