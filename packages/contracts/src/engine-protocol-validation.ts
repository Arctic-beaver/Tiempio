import {
	engineProtocolLimits,
	type EngineDiagnosticCode,
	type EngineProtocolFailure
} from './engine-protocol-dtos.js'

export function protocolFailure(
	diagnostic: EngineDiagnosticCode,
	message: string
): EngineProtocolFailure {
	return Object.freeze({ ok: false as const, diagnostic, message })
}

export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value)
	return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

export function serializedBytes(value: unknown): number | null {
	try {
		const serialized = JSON.stringify(value)
		return serialized === undefined ? null : new TextEncoder().encode(serialized).byteLength
	} catch {
		return null
	}
}

export function objectDepth(value: unknown): number {
	if (typeof value !== 'object' || value === null) return 0
	let maximum = 0
	const stack: Array<{ readonly depth: number; readonly value: object }> = [{ value, depth: 1 }]
	const visited = new Set<object>()
	while (stack.length > 0) {
		const current = stack.pop()
		if (current === undefined || visited.has(current.value)) continue
		visited.add(current.value)
		maximum = Math.max(maximum, current.depth)
		if (maximum > engineProtocolLimits.maxJsonDepth) return maximum
		for (const child of Object.values(current.value as Record<string, unknown>)) {
			if (typeof child === 'object' && child !== null) {
				stack.push({ value: child, depth: current.depth + 1 })
			}
		}
	}
	return maximum
}

export function safeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function finiteRange(value: unknown, minimum: number, maximum: number): value is number {
	return (
		typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
	)
}

export function validIdentifier(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		new TextEncoder().encode(value).byteLength <= engineProtocolLimits.maxIdentifierBytes &&
		/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
	)
}

export function emptyPayload(value: unknown): boolean {
	return record(value) && exactKeys(value, [])
}
