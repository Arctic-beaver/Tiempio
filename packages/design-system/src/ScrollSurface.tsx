import type { HTMLAttributes, JSX } from 'react'

export interface ScrollSurfaceProperties extends HTMLAttributes<HTMLDivElement> {
	readonly direction?: 'vertical' | 'horizontal' | 'both'
}

export function ScrollSurface({
	className = '',
	direction = 'vertical',
	...properties
}: ScrollSurfaceProperties): JSX.Element {
	return (
		<div
			{...properties}
			className={`ti-scroll-surface ti-scroll-surface--${direction} ${className}`.trim()}
		/>
	)
}
