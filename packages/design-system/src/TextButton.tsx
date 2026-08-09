import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

export interface TextButtonProperties extends ButtonHTMLAttributes<HTMLButtonElement> {
	readonly icon?: ReactNode
	readonly selected?: boolean
	readonly tone?: 'neutral' | 'accent' | 'danger'
}

export function TextButton({
	children,
	className = '',
	icon,
	selected = false,
	tone = 'neutral',
	type = 'button',
	...buttonProperties
}: TextButtonProperties): JSX.Element {
	return (
		<button
			{...buttonProperties}
			aria-pressed={selected || undefined}
			className={`ti-text-button ti-control--${tone} ${className}`.trim()}
			data-selected={selected || undefined}
			type={type}
		>
			{icon === undefined ? null : (
				<span aria-hidden="true" className="ti-text-button__icon">
					{icon}
				</span>
			)}
			<span>{children}</span>
		</button>
	)
}
