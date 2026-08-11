import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useState,
	type CSSProperties,
	type AriaRole,
	type JSX,
	type ReactNode,
	type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import {
	calculateFloatingOverlayPlacement,
	type FloatingOverlayAlignment,
	type FloatingOverlayPlacement
} from './floating-overlay.js'

const OverlayHostContext = createContext<HTMLElement | null>(null)

export interface OverlayBoundaryProperties {
	readonly children: ReactNode
	readonly className?: string
}

export function OverlayBoundary({
	children,
	className = 'ti-overlay-layer'
}: OverlayBoundaryProperties): JSX.Element {
	const [host, setHost] = useState<HTMLDivElement | null>(null)
	return (
		<OverlayHostContext.Provider value={host}>
			{children}
			<div className={className} ref={setHost} />
		</OverlayHostContext.Provider>
	)
}

export interface FloatingOverlayProperties {
	readonly 'aria-label'?: string
	readonly 'aria-labelledby'?: string
	readonly alignment?: FloatingOverlayAlignment
	readonly anchorRef: RefObject<HTMLElement | null>
	readonly children: ReactNode
	readonly className: string
	readonly id?: string
	readonly minimumWidth?: number
	readonly onAnchorMissing: () => void
	readonly panelRef: RefObject<HTMLDivElement | null>
	readonly role?: AriaRole
}

function placementStyle(placement: FloatingOverlayPlacement | null): CSSProperties {
	if (placement === null) return { visibility: 'hidden' }
	return {
		left: `${String(placement.left)}px`,
		maxHeight: `${String(placement.maxHeight)}px`,
		top: `${String(placement.top)}px`,
		width: `${String(placement.width)}px`
	}
}

export function FloatingOverlay({
	'aria-label': ariaLabel,
	'aria-labelledby': ariaLabelledBy,
	alignment = 'start',
	anchorRef,
	children,
	className,
	id,
	minimumWidth = 288,
	onAnchorMissing,
	panelRef,
	role
}: FloatingOverlayProperties): JSX.Element | null {
	const configuredHost = useContext(OverlayHostContext)
	const [placement, setPlacement] = useState<FloatingOverlayPlacement | null>(null)

	const recalculate = useCallback((): void => {
		const anchor = anchorRef.current
		const panel = panelRef.current
		if (anchor === null || panel === null || !anchor.isConnected) {
			onAnchorMissing()
			return
		}
		const anchorRectangle = anchor.getBoundingClientRect()
		const panelRectangle = panel.getBoundingClientRect()
		const viewport = window.visualViewport
		setPlacement(
			calculateFloatingOverlayPlacement({
				alignment,
				anchor: anchorRectangle,
				minimumWidth,
				panel: {
					height: Math.max(panel.scrollHeight, panelRectangle.height),
					width: Math.max(panel.scrollWidth, panelRectangle.width)
				},
				viewport: {
					height: viewport?.height ?? window.innerHeight,
					left: viewport?.offsetLeft ?? 0,
					top: viewport?.offsetTop ?? 0,
					width: viewport?.width ?? window.innerWidth
				}
			})
		)
	}, [alignment, anchorRef, minimumWidth, onAnchorMissing, panelRef])

	useLayoutEffect(() => {
		recalculate()
		const panel = panelRef.current
		const anchor = anchorRef.current
		const observer = new ResizeObserver(recalculate)
		if (panel !== null) observer.observe(panel)
		if (anchor !== null) observer.observe(anchor)
		const viewport = window.visualViewport
		window.addEventListener('resize', recalculate)
		document.addEventListener('scroll', recalculate, true)
		viewport?.addEventListener('resize', recalculate)
		viewport?.addEventListener('scroll', recalculate)
		return () => {
			observer.disconnect()
			window.removeEventListener('resize', recalculate)
			document.removeEventListener('scroll', recalculate, true)
			viewport?.removeEventListener('resize', recalculate)
			viewport?.removeEventListener('scroll', recalculate)
		}
	}, [anchorRef, panelRef, recalculate])

	const host = configuredHost ?? (typeof document === 'undefined' ? null : document.body)
	if (host === null) return null
	return createPortal(
		<div
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledBy}
			className={className}
			data-side={placement?.side}
			id={id}
			ref={panelRef}
			role={role}
			style={placementStyle(placement)}
		>
			{children}
		</div>,
		host
	)
}
