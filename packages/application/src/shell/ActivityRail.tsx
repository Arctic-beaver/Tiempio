import { AudioWaveform, Drum, Home, ListMusic, SlidersHorizontal } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { IconButton, Tooltip } from '../../../design-system/src/index.js'
import { useLocalization, type LocalizationKey } from '../../../localization/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'

interface ActivityItem {
	readonly icon: ReactNode
	readonly id: StudioViewId
	readonly labelKey: LocalizationKey
}

const activityItems: readonly ActivityItem[] = Object.freeze([
	Object.freeze({ id: 'home', labelKey: 'nav.home', icon: <Home /> }),
	Object.freeze({ id: 'piano-roll', labelKey: 'nav.piano', icon: <AudioWaveform /> }),
	Object.freeze({ id: 'drums', labelKey: 'nav.drums', icon: <Drum /> }),
	Object.freeze({ id: 'arrangement', labelKey: 'nav.arrangement', icon: <ListMusic /> }),
	Object.freeze({ id: 'sound-sculpt', labelKey: 'nav.soundSculpt', icon: <SlidersHorizontal /> })
])

export interface ActivityRailProperties {
	readonly activeView: StudioViewId
	readonly onNavigate: (view: StudioViewId) => void
}

export function ActivityRail({ activeView, onNavigate }: ActivityRailProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<nav aria-label="Studio" className="activity-rail">
			<div aria-hidden="true" className="activity-rail__mark">
				T
			</div>
			<div className="activity-rail__items">
				{activityItems.map((item) => (
					<Tooltip content={t(item.labelKey)} key={item.id} placement="right">
						<IconButton
							icon={item.icon}
							label={t(item.labelKey)}
							onClick={() => onNavigate(item.id)}
							selected={activeView === item.id}
						/>
					</Tooltip>
				))}
			</div>
			<span
				aria-label="Audio engine status: ready"
				className="activity-rail__status"
				role="status"
			/>
		</nav>
	)
}
