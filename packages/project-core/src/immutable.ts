function isPlainRecord(value: object): boolean {
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

export function cloneAndFreeze<Value>(value: Value): Value {
	if (Array.isArray(value)) {
		return Object.freeze(value.map((entry) => cloneAndFreeze(entry))) as Value
	}
	if (typeof value === 'object' && value !== null) {
		if (!isPlainRecord(value)) {
			throw new TypeError('Project data must contain only plain objects and arrays.')
		}
		const clone: Record<string, unknown> = {}
		for (const [key, entry] of Object.entries(value)) clone[key] = cloneAndFreeze(entry)
		return Object.freeze(clone) as Value
	}
	return value
}
