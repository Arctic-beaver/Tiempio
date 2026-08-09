import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'

export interface IconButtonProperties extends Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'children'
> {
	readonly icon: ReactNode
	readonly label: string
	readonly selected?: boolean
	readonly size?: 'small' | 'medium'
	readonly tone?: 'neutral' | 'accent' | 'danger'
}

export function IconButton({
	className = '',
	icon,
	label,
	selected = false,
	size = 'medium',
	tone = 'neutral',
	type = 'button',
	...buttonProperties
}: IconButtonProperties): JSX.Element {
	return (
		<button
			{...buttonProperties}
			aria-label={label}
			aria-pressed={selected || undefined}
			className={`ti-icon-button ti-icon-button--${size} ti-control--${tone} ${className}`.trim()}
			data-selected={selected || undefined}
			type={type}
		>
			<span aria-hidden="true" className="ti-icon-button__glyph">
				{icon}
			</span>
		</button>
	)
}
