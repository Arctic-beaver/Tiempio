import { useId, type ChangeEvent, type JSX } from 'react'

export interface SemanticSliderProperties {
	readonly disabled?: boolean
	readonly formatValue?: (value: number) => string
	readonly label: string
	readonly max: number
	readonly min: number
	readonly onChange: (value: number) => void
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
	step = 1,
	value
}: SemanticSliderProperties): JSX.Element {
	const sliderId = useId()
	const valueId = useId()
	const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
		onChange(Number(event.currentTarget.value))
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
				onChange={handleChange}
				step={step}
				type="range"
				value={value}
			/>
		</div>
	)
}
