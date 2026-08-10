import { Menu, Minus, PanelRight, Square, X } from 'lucide-react'
import { useState, type JSX } from 'react'
import type { ApplicationTarget } from '../../../contracts/src/index.js'
import { IconButton } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'

export interface TitleBarProperties {
	readonly target: ApplicationTarget
}

export function TitleBar({ target }: TitleBarProperties): JSX.Element {
	const { t } = useLocalization()
	const runtime = useApplicationRuntime()
	const { snapshot } = useProjectSession()
	const [maximized, setMaximized] = useState(false)
	const customChrome = runtime.windowChrome === 'custom'
	const minimize = (): void => {
		if (runtime.nativeWindow.availability === 'available')
			void runtime.nativeWindow.api.minimize()
	}
	const toggleMaximize = (): void => {
		if (runtime.nativeWindow.availability !== 'available') return
		void runtime.nativeWindow.api.toggleMaximize().then((result) => {
			if (result.ok) setMaximized(result.value.maximized)
		})
	}
	const close = (): void => {
		if (runtime.lifecycle.availability === 'available')
			void runtime.lifecycle.api.requestClose()
	}

	return (
		<header
			className="title-bar"
			data-target={target}
			data-window-chrome={runtime.windowChrome}
		>
			<div className="title-bar__compact-control title-bar__no-drag">
				<CommandIconButton
					commandId="layout.open-navigation"
					icon={<Menu />}
					label={t('layout.openNavigation')}
				/>
			</div>
			<div className="title-bar__identity">
				<strong>{t('app.name')}</strong>
				<span aria-hidden="true">/</span>
				<span>{snapshot.project.title}</span>
			</div>
			<span className="title-bar__target">
				{target === 'desktop' ? t('app.desktop') : t('app.web')}
			</span>
			<div className="title-bar__actions title-bar__no-drag">
				<div className="title-bar__context-control">
					<CommandIconButton
						commandId="layout.open-context"
						icon={<PanelRight />}
						label={t('layout.openContext')}
					/>
				</div>
				{customChrome ? (
					<div aria-label={t('window.controls')} className="title-bar__window-controls">
						<IconButton
							icon={<Minus />}
							label={t('window.minimize')}
							onClick={minimize}
						/>
						<IconButton
							icon={<Square />}
							label={maximized ? t('window.restore') : t('window.maximize')}
							onClick={toggleMaximize}
						/>
						<IconButton
							icon={<X />}
							label={t('window.close')}
							onClick={close}
							tone="danger"
						/>
					</div>
				) : null}
			</div>
		</header>
	)
}
