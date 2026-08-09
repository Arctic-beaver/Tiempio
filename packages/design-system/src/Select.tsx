import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<Value extends string> {
	readonly description?: string
	readonly disabled?: boolean
	readonly label: string
	readonly value: Value
}

export interface SelectProperties<Value extends string> {
	readonly disabled?: boolean
	readonly label: string
	readonly onChange: (value: Value) => void
	readonly options: readonly SelectOption<Value>[]
	readonly value: Value
}

function selectableIndex<Value extends string>(
	options: readonly SelectOption<Value>[],
	startIndex: number,
	direction: 1 | -1
): number {
	if (options.length === 0) return -1
	for (let offset = 1; offset <= options.length; offset += 1) {
		const candidate = (startIndex + direction * offset + options.length) % options.length
		if (options[candidate]?.disabled !== true) return candidate
	}
	return -1
}

export function Select<Value extends string>({
	disabled = false,
	label,
	onChange,
	options,
	value
}: SelectProperties<Value>): JSX.Element {
	const selectedIndex = options.findIndex((option) => option.value === value)
	const selectedOption = options[selectedIndex]
	const [open, setOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(selectedIndex)
	const rootReference = useRef<HTMLDivElement>(null)
	const triggerReference = useRef<HTMLButtonElement>(null)
	const listboxId = useId()
	const labelId = useId()

	useEffect(() => {
		if (!open) return
		const dismissOutside = (event: PointerEvent): void => {
			if (rootReference.current?.contains(event.target as Node) === false) setOpen(false)
		}
		document.addEventListener('pointerdown', dismissOutside)
		return () => document.removeEventListener('pointerdown', dismissOutside)
	}, [open])

	const openListbox = (direction: 1 | -1 = 1): void => {
		const initial =
			selectedIndex >= 0 && options[selectedIndex]?.disabled !== true
				? selectedIndex
				: selectableIndex(options, direction === 1 ? -1 : 0, direction)
		setActiveIndex(initial)
		setOpen(true)
	}

	const choose = (index: number): void => {
		const option = options[index]
		if (option === undefined || option.disabled === true) return
		onChange(option.value)
		setOpen(false)
		triggerReference.current?.focus()
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
		if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
			event.preventDefault()
			openListbox(event.key === 'ArrowUp' ? -1 : 1)
			return
		}
		if (!open) return
		if (event.key === 'Escape') {
			event.preventDefault()
			setOpen(false)
			triggerReference.current?.focus()
			return
		}
		if (event.key === 'Tab') {
			setOpen(false)
			return
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			choose(activeIndex)
			return
		}
		if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault()
			const start = event.key === 'Home' ? -1 : 0
			setActiveIndex(selectableIndex(options, start, event.key === 'Home' ? 1 : -1))
			return
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			setActiveIndex(
				selectableIndex(options, activeIndex, event.key === 'ArrowDown' ? 1 : -1)
			)
		}
	}

	return (
		<div className="ti-select" onKeyDown={handleKeyDown} ref={rootReference}>
			<span className="ti-select__label" id={labelId}>
				{label}
			</span>
			<button
				aria-controls={open ? listboxId : undefined}
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-labelledby={`${labelId} ${listboxId}-value`}
				className="ti-select__trigger"
				disabled={disabled}
				onClick={() => (open ? setOpen(false) : openListbox())}
				ref={triggerReference}
				type="button"
			>
				<span id={`${listboxId}-value`}>{selectedOption?.label ?? value}</span>
				<ChevronDown aria-hidden="true" size="1em" strokeWidth={1.8} />
			</button>
			{open ? (
				<div
					aria-activedescendant={
						activeIndex < 0 ? undefined : `${listboxId}-option-${String(activeIndex)}`
					}
					aria-labelledby={labelId}
					className="ti-select__options ti-scroll-surface"
					id={listboxId}
					role="listbox"
					tabIndex={-1}
				>
					{options.map((option, index) => (
						<button
							aria-disabled={option.disabled || undefined}
							aria-selected={option.value === value}
							className="ti-select__option"
							data-active={index === activeIndex || undefined}
							disabled={option.disabled}
							id={`${listboxId}-option-${String(index)}`}
							key={option.value}
							onClick={() => choose(index)}
							onPointerMove={() => setActiveIndex(index)}
							role="option"
							tabIndex={-1}
							type="button"
						>
							<span>
								<strong>{option.label}</strong>
								{option.description === undefined ? null : (
									<small>{option.description}</small>
								)}
							</span>
							<Check
								aria-hidden="true"
								className="ti-select__check"
								size="1rem"
								strokeWidth={2}
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}
