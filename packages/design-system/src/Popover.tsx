import {
	useEffect,
	useId,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent,
	type ReactNode
} from 'react'
import { FloatingOverlay } from './FloatingOverlay.js'
import { floatingOverlayPathIsOwned } from './floating-overlay.js'

export interface PopoverProperties {
	readonly children: ReactNode | ((close: () => void) => ReactNode)
	readonly disabled?: boolean
	readonly icon?: ReactNode
	readonly label: string
	readonly placement?: 'start' | 'end'
}

export function Popover({
	children,
	disabled = false,
	icon,
	label,
	placement = 'end'
}: PopoverProperties): JSX.Element {
	const [open, setOpen] = useState(false)
	const popoverId = useId()
	const rootReference = useRef<HTMLDivElement>(null)
	const triggerReference = useRef<HTMLButtonElement>(null)
	const panelReference = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const dismissOutside = (event: PointerEvent): void => {
			const owners = [rootReference.current, panelReference.current].filter(
				(owner): owner is HTMLDivElement => owner !== null
			)
			if (!floatingOverlayPathIsOwned(event.composedPath(), owners)) setOpen(false)
		}
		document.addEventListener('pointerdown', dismissOutside)
		return () => document.removeEventListener('pointerdown', dismissOutside)
	}, [open])

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
		if (event.key !== 'Escape' || !open) return
		event.preventDefault()
		setOpen(false)
		triggerReference.current?.focus()
	}
	const close = (): void => {
		setOpen(false)
	}

	return (
		<div className="ti-popover" onKeyDown={handleKeyDown} ref={rootReference}>
			<button
				aria-controls={open ? popoverId : undefined}
				aria-expanded={open}
				aria-haspopup="dialog"
				className="ti-popover__trigger"
				disabled={disabled}
				onClick={() => setOpen((current) => !current)}
				ref={triggerReference}
				type="button"
			>
				{icon === undefined ? null : (
					<span aria-hidden="true" className="ti-popover__trigger-icon">
						{icon}
					</span>
				)}
				<span>{label}</span>
			</button>
			{open ? (
				<FloatingOverlay
					alignment={placement}
					anchorRef={triggerReference}
					aria-label={label}
					className="ti-popover__panel"
					id={popoverId}
					onAnchorMissing={() => setOpen(false)}
					panelRef={panelReference}
					role="dialog"
				>
					{typeof children === 'function' ? children(close) : children}
				</FloatingOverlay>
			) : null}
		</div>
	)
}
