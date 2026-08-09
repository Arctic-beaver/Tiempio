import { X } from 'lucide-react'
import { useEffect, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'

export interface StudioDrawerProperties {
	readonly children: ReactNode
	readonly label: string
	readonly onClose: () => void
	readonly open: boolean
	readonly side: 'left' | 'right'
}

export function StudioDrawer({
	children,
	label,
	onClose,
	open,
	side
}: StudioDrawerProperties): JSX.Element | null {
	const { t } = useLocalization()
	const panelReference = useRef<HTMLDivElement>(null)
	const restoreFocusReference = useRef<HTMLElement | null>(null)

	useEffect(() => {
		if (!open) return
		restoreFocusReference.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		const animationFrame = requestAnimationFrame(() => {
			panelReference.current
				?.querySelector<HTMLElement>('button, [href], input, [tabindex="0"]')
				?.focus()
		})
		return () => {
			cancelAnimationFrame(animationFrame)
			restoreFocusReference.current?.focus()
		}
	}, [open])

	const trapFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
		if (event.key !== 'Tab') return
		const focusable = [
			...(panelReference.current?.querySelectorAll<HTMLElement>(
				'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]'
			) ?? [])
		]
		const first = focusable[0]
		const last = focusable.at(-1)
		if (first === undefined || last === undefined) return
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	}

	if (!open) return null
	return (
		<div className="studio-drawer" data-side={side}>
			<button
				aria-label={t('layout.closeDrawer')}
				className="studio-drawer__backdrop"
				onClick={onClose}
				type="button"
			/>
			<div
				aria-label={label}
				aria-modal="true"
				className="studio-drawer__panel"
				onKeyDown={trapFocus}
				ref={panelReference}
				role="dialog"
			>
				<header className="studio-drawer__header">
					<strong>{label}</strong>
					<IconButton
						icon={<X />}
						label={t('common.close')}
						onClick={onClose}
						size="small"
					/>
				</header>
				{children}
			</div>
		</div>
	)
}
