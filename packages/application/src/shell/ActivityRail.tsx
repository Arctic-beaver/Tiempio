import { AudioWaveform, Drum, Home, ListMusic, SlidersHorizontal } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { activityCommandDefinitions, type CommandId } from '../commands/command-registry.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'

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
	const runtime = useApplicationRuntime()
	const engineAvailable = runtime.engine.availability === 'available'
	return (
		<nav aria-label={t('nav.studio')} className="activity-rail">
			<div aria-hidden="true" className="activity-rail__mark">
				T
			</div>
			<div className="activity-rail__items">
				{activityCommandDefinitions.map((command) => (
					<CommandIconButton
						commandId={command.id}
						icon={activityIcons[command.id]}
						key={command.id}
						label={t(command.labelKey)}
						selected={activeView === command.view}
						tooltipPlacement="right"
					/>
				))}
			</div>
			<span
				aria-label={t(engineAvailable ? 'engine.available' : 'engine.unavailable')}
				className="activity-rail__status"
				data-availability={engineAvailable ? 'available' : 'unavailable'}
				role="status"
			/>
		</nav>
	)
}
