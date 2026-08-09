import { Menu, PanelRight } from 'lucide-react'
import type { JSX } from 'react'
import { IconButton } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import type { ApplicationTarget } from '../../../contracts/src/index.js'

export interface TitleBarProperties {
	readonly onOpenContext: () => void
	readonly onOpenNavigation: () => void
	readonly target: ApplicationTarget
}

export function TitleBar({
	onOpenContext,
	onOpenNavigation,
	target
}: TitleBarProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<header className="title-bar" data-target={target}>
			<div className="title-bar__compact-control title-bar__no-drag">
				<IconButton
					icon={<Menu />}
					label={t('layout.openNavigation')}
					onClick={onOpenNavigation}
				/>
			</div>
			<div className="title-bar__identity">
				<strong>{t('app.name')}</strong>
				<span aria-hidden="true">/</span>
				<span>Velvet Morning</span>
			</div>
			<span className="title-bar__target">
				{target === 'desktop' ? t('app.desktop') : t('app.web')}
			</span>
			<div className="title-bar__context-control title-bar__no-drag">
				<IconButton
					icon={<PanelRight />}
					label={t('layout.openContext')}
					onClick={onOpenContext}
				/>
			</div>
		</header>
	)
}
