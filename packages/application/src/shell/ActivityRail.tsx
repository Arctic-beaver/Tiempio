import { AudioWaveform, Drum, Home, ListMusic, SlidersHorizontal } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { IconButton, Tooltip } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'
import { useCommands } from '../commands/CommandContext.js'
import { activityCommandDefinitions, type CommandId } from '../commands/command-registry.js'

const activityIcons: Readonly<Partial<Record<CommandId, ReactNode>>> = Object.freeze({
	'studio.home': <Home />,
	'studio.piano-roll': <AudioWaveform />,
	'studio.drums': <Drum />,
	'studio.arrangement': <ListMusic />,
	'studio.sound-sculpt': <SlidersHorizontal />
})

export interface ActivityRailProperties {
	readonly activeView: StudioViewId
}

export function ActivityRail({ activeView }: ActivityRailProperties): JSX.Element {
	const { t } = useLocalization()
	const { execute } = useCommands()
	return (
		<nav aria-label={t('nav.studio')} className="activity-rail">
			<div aria-hidden="true" className="activity-rail__mark">
				T
			</div>
			<div className="activity-rail__items">
				{activityCommandDefinitions.map((command) => (
					<Tooltip content={t(command.labelKey)} key={command.id} placement="right">
						<IconButton
							icon={activityIcons[command.id]}
							label={t(command.labelKey)}
							onClick={() => execute(command.id)}
							selected={activeView === command.view}
						/>
					</Tooltip>
				))}
			</div>
			<span aria-label={t('engine.ready')} className="activity-rail__status" role="status" />
		</nav>
	)
}
