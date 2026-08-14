export type SemanticSliderGestureKind = 'keyboard' | 'pointer'

const rangeAdjustmentCodes = new Set([
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'End',
	'Home',
	'PageDown',
	'PageUp'
])

export function isSemanticSliderAdjustmentCode(code: string): boolean {
	return rangeAdjustmentCodes.has(code)
}

export class SemanticSliderGesture {
	#active: SemanticSliderGestureKind | null = null
	#committed: number
	#dirty = false
	#preview: number

	public constructor(value: number) {
		if (!Number.isFinite(value)) throw new RangeError('Slider value must be finite.')
		this.#committed = value
		this.#preview = value
	}

	public synchronize(value: number): void {
		if (!Number.isFinite(value) || this.#dirty) return
		this.#committed = value
		this.#preview = value
	}

	public begin(kind: SemanticSliderGestureKind, value: number): number | null {
		this.synchronize(value)
		const pending = this.#active !== null && this.#active !== kind ? this.finish() : null
		this.#active = kind
		return pending
	}

	public preview(value: number): boolean {
		if (!Number.isFinite(value)) return false
		if (this.#active === null) this.#active = 'keyboard'
		this.#preview = value
		this.#dirty = value !== this.#committed
		return this.#dirty
	}

	public finish(kind?: SemanticSliderGestureKind): number | null {
		if (kind !== undefined && this.#active !== kind) return null
		this.#active = null
		if (!this.#dirty) return null
		this.#dirty = false
		this.#committed = this.#preview
		return this.#committed
	}

	public cancel(): number | null {
		this.#active = null
		if (!this.#dirty) return null
		this.#dirty = false
		this.#preview = this.#committed
		return this.#committed
	}

	public get pending(): boolean {
		return this.#dirty
	}
}
