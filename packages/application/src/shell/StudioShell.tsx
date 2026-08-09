import type { JSX, ReactNode } from 'react'
import type { ApplicationTarget } from '../../../contracts/src/index.js'
import { ScrollSurface } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioDrawer as StudioDrawerId, StudioViewId } from '../app/studio-state.js'
import { useCommands } from '../commands/CommandContext.js'
import { ActivityRail } from './ActivityRail.js'
import { ContextPanel } from './ContextPanel.js'
import { LayersPanel } from './LayersPanel.js'
import { StudioDrawer } from './StudioDrawer.js'
import { TitleBar } from './TitleBar.js'
import { TransportBar } from './TransportBar.js'

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
		<main className="studio-shell" data-application-target={target}>
			<TitleBar target={target} />
			<div className="studio-shell__body">
				<ActivityRail activeView={activeView} />
				<div className="studio-shell__work-area">
					<TransportBar />
					<div className="studio-shell__content-grid">
						<div className="studio-shell__layers">
							<LayersPanel />
						</div>
						<ScrollSurface
							className="studio-shell__workspace"
							data-testid="studio-workspace"
						>
							{children}
						</ScrollSurface>
						<div className="studio-shell__context">
							<ContextPanel />
						</div>
					</div>
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
		</main>
	)
}
