import { FolderOpen, Home, Plus, Settings, Waves } from 'lucide-react'
import type { JSX } from 'react'
import { Popover, Select } from '../../../design-system/src/index.js'
import { useLocalization, type SupportedLocale } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { usePresentationSettings } from '../providers/PresentationSettingsContext.js'

const themeValues = Object.freeze(['system', 'light', 'dark'] as const)
const localeValues = Object.freeze(['en', 'ru', 'es'] as const)

export interface ActivityRailProperties {
	readonly activeView: StudioViewId
}

export function ActivityRail({ activeView }: ActivityRailProperties): JSX.Element {
	const { t } = useLocalization()
	const settings = usePresentationSettings()
	return (
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
				<button
					aria-label={t('home.openProject')}
					className="rail-button"
					disabled
					title={t('common.notAvailable')}
					type="button"
				>
					<FolderOpen aria-hidden="true" />
				</button>
			</div>
			<div className="activity-rail__settings">
				<Popover icon={<Settings />} label={t('common.settings')} placement="start">
					<div className="settings-popover">
						<Select
							label={t('common.theme')}
							onChange={settings.setColorScheme}
							options={themeValues.map((value) => ({
								value,
								label: t(`common.${value}`)
							}))}
							value={settings.colorScheme}
						/>
						<Select<SupportedLocale>
							label={t('common.language')}
							onChange={settings.setLocale}
							options={localeValues.map((value) => ({
								value,
								label:
									value === 'en'
										? 'English'
										: value === 'ru'
											? 'Русский'
											: 'Español'
							}))}
							value={settings.locale}
						/>
					</div>
				</Popover>
			</div>
		</nav>
	)
}
