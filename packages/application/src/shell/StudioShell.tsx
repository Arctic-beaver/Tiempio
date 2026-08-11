import type { JSX, ReactNode } from 'react'
import type { ApplicationTarget } from '../../../contracts/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioDrawer as StudioDrawerId, StudioViewId } from '../app/studio-state.js'
import { useCommands } from '../commands/CommandContext.js'
import { ActivityRail } from './ActivityRail.js'
import { ContextPanel } from './ContextPanel.js'
import { PlayPerformancePanel } from '../features/song-palette/PlayPerformancePanel.js'
import { LayersPanel } from './LayersPanel.js'
import { StudioDrawer } from './StudioDrawer.js'
import { TitleBar } from './TitleBar.js'

export interface StudioShellProperties {
	readonly activeDrawer: StudioDrawerId
	readonly activeView: StudioViewId
	readonly children: ReactNode
	readonly target: ApplicationTarget
}

export function StudioShell({
	activeDrawer,
	activeView,
	children,
	target
}: StudioShellProperties): JSX.Element {
	const { t } = useLocalization()
	const { execute } = useCommands()
	const closeDrawer = (): void => {
		execute('layout.close-drawer')
	}
	return (
		<main className="studio-shell app-window" data-application-target={target}>
			<TitleBar target={target} />
			<div className="studio-shell__body app-body">
				<ActivityRail activeView={activeView} />
				<div className="studio-shell__workspace workspace" data-testid="studio-workspace">
					{children}
				</div>
			</div>
			<StudioDrawer
				label={t('layers.title')}
				onClose={closeDrawer}
				open={activeDrawer === 'navigation'}
				side="left"
			>
				<div className="studio-drawer__navigation">
					<ActivityRail activeView={activeView} />
					<LayersPanel />
				</div>
			</StudioDrawer>
			<StudioDrawer
				label={t('context.title')}
				onClose={closeDrawer}
				open={activeDrawer === 'context'}
				side="right"
			>
				<ContextPanel />
			</StudioDrawer>
			<StudioDrawer
				label={t('songPalette.playDrawer')}
				onClose={closeDrawer}
				open={activeDrawer === 'play'}
				size="wide"
				side="right"
			>
				<PlayPerformancePanel />
			</StudioDrawer>
		</main>
	)
}
