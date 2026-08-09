import { X } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
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
