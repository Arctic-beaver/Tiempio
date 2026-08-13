import { FolderOpen, Home, Plus, Settings, Waves } from 'lucide-react'
import { lazy, Suspense, useState, type JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'

const SettingsDialog = lazy(() => import('../features/settings/SettingsDialog.js'))

export interface ActivityRailProperties {
	readonly activeView: StudioViewId
}

export function ActivityRail({ activeView }: ActivityRailProperties): JSX.Element {
	const { t } = useLocalization()
	const [settingsOpen, setSettingsOpen] = useState(false)
	return (
		<>
			<nav aria-label={t('nav.studio')} className="activity-rail nav-rail">
				<div className="activity-rail__items">
					<CommandIconButton
						className="rail-button"
						commandId="studio.home"
						icon={<Home />}
						label={t('nav.home')}
						selected={activeView === 'home'}
						tooltipPlacement="right"
					/>
					<CommandIconButton
						className="rail-button"
						commandId="studio.first-layer"
						icon={<Plus />}
						label={t('layers.add')}
						selected={activeView === 'first-layer'}
						tooltipPlacement="right"
					/>
					<CommandIconButton
						className="rail-button"
						commandId="studio.sound-chooser"
						icon={<Waves />}
						label={t('soundChooser.title')}
						selected={activeView === 'sound-chooser'}
						tooltipPlacement="right"
					/>
					<CommandIconButton
						className="rail-button"
						commandId="project.open"
						icon={<FolderOpen />}
						label={t('home.openProject')}
						tooltipPlacement="right"
					/>
				</div>
				<div className="activity-rail__settings">
					<button
						aria-label={t('common.settings')}
						className="rail-button"
						onClick={() => setSettingsOpen(true)}
						type="button"
					>
						<Settings aria-hidden="true" />
					</button>
				</div>
			</nav>
			<Suspense fallback={null}>
				{settingsOpen ? (
					<SettingsDialog onClose={() => setSettingsOpen(false)} open />
				) : null}
			</Suspense>
		</>
	)
}
