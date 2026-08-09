import { cloneElement, useId, type JSX, type ReactElement } from 'react'

export interface TooltipProperties {
	readonly children: ReactElement<{ 'aria-describedby'?: string }>
	readonly content: string
	readonly placement?: 'top' | 'right' | 'bottom' | 'left'
}

export function Tooltip({
	children,
	content,
	placement = 'bottom'
}: TooltipProperties): JSX.Element {
	const tooltipId = useId()
	return (
		<span className="ti-tooltip" data-placement={placement}>
			{cloneElement(children, { 'aria-describedby': tooltipId })}
			<span className="ti-tooltip__content" id={tooltipId} role="tooltip">
				{content}
			</span>
		</span>
	)
}
