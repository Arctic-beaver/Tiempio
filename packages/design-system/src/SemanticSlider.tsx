import {
	useId,
	useLayoutEffect,
	useState,
	type ChangeEvent,
	type JSX,
	type KeyboardEvent,
	type PointerEvent
} from 'react'
import {
	isSemanticSliderAdjustmentCode,
	SemanticSliderGesture,
	type SemanticSliderGestureKind
} from './semantic-slider-gesture.js'

export interface SemanticSliderProperties {
	readonly disabled?: boolean
	readonly formatValue?: (value: number) => string
	readonly label: string
	readonly max: number
	readonly min: number
	readonly onChange: (value: number) => void
	readonly onCommit?: (value: number) => void
	readonly onCancel?: () => void
	readonly step?: number
	readonly value: number
}

export function SemanticSlider({
	disabled = false,
	formatValue = String,
	label,
	max,
	min,
	onChange,
	onCommit,
	onCancel,
	step = 1,
	value
}: SemanticSliderProperties): JSX.Element {
	const sliderId = useId()
	const valueId = useId()
	const [gesture] = useState(() => new SemanticSliderGesture(value))
	useLayoutEffect(() => {
		gesture.synchronize(value)
	}, [gesture, value])
	const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
		const next = Number(event.currentTarget.value)
		gesture.preview(next)
		onChange(next)
	}
	const commit = (kind?: SemanticSliderGestureKind): void => {
		const next = gesture.finish(kind)
		if (next !== null) onCommit?.(next)
	}
	const begin = (kind: SemanticSliderGestureKind, currentValue: number): void => {
		const pending = gesture.begin(kind, currentValue)
		if (pending !== null) onCommit?.(pending)
	}
	const cancel = (): boolean => {
		const restored = gesture.cancel()
		if (restored === null) return false
		onChange(restored)
		onCancel?.()
		return true
	}
	const handleBlur = (): void => {
		commit()
	}
	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.code === 'Escape') {
			if (cancel()) event.preventDefault()
			return
		}
		if (isSemanticSliderAdjustmentCode(event.code)) {
			begin('keyboard', Number(event.currentTarget.value))
		}
	}
	const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (isSemanticSliderAdjustmentCode(event.code)) commit('keyboard')
	}
	const handlePointerDown = (event: PointerEvent<HTMLInputElement>): void => {
		begin('pointer', Number(event.currentTarget.value))
	}
	const handlePointerCancel = (): void => {
		cancel()
	}
	const handlePointerUp = (): void => {
		commit('pointer')
	}

	return (
		<div className="ti-slider" data-disabled={disabled || undefined}>
			<div className="ti-slider__label-row">
				<label htmlFor={sliderId}>{label}</label>
				<output className="ti-slider__value" htmlFor={sliderId} id={valueId}>
					{formatValue(value)}
				</output>
			</div>
			<input
				aria-describedby={valueId}
				disabled={disabled}
				id={sliderId}
				max={max}
				min={min}
				onBlur={handleBlur}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onKeyUp={handleKeyUp}
				onPointerCancel={handlePointerCancel}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				step={step}
				type="range"
				value={value}
			/>
		</div>
	)
}
