const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function canonicalValue(value: unknown, ancestors: WeakSet<object>): string {
	if (value === null) return 'null'
	if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new TypeError('Canonical JSON cannot encode a non-finite number.')
		return JSON.stringify(Object.is(value, -0) ? 0 : value)
	}
	if (typeof value !== 'object')
		throw new TypeError('Canonical JSON accepts only JSON-compatible values.')
	if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot encode cyclic data.')
	ancestors.add(value)
	try {
		if (Array.isArray(value)) {
			return `[${value.map((entry) => canonicalValue(entry, ancestors)).join(',')}]`
		}
		if (!isPlainRecord(value))
			throw new TypeError('Canonical JSON accepts only plain objects and arrays.')
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], ancestors)}`)
			.join(',')}}`
	} finally {
		ancestors.delete(value)
	}
}

export function canonicalJson(value: unknown): string {
	return `${canonicalValue(value, new WeakSet())}\n`
}

export function encodeCanonicalJson(value: unknown): Uint8Array {
	return encoder.encode(canonicalJson(value))
}

export function decodeUtf8(bytes: Uint8Array): string {
	return decoder.decode(bytes)
}
