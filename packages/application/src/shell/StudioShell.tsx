import type { JSX, ReactNode } from 'react'
import type { ApplicationTarget } from '../../../contracts/src/index.js'
import { ScrollSurface } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import type { StudioDrawer as StudioDrawerId, StudioViewId } from '../app/studio-state.js'
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
	readonly onCloseDrawer: () => void
	readonly onNavigate: (view: StudioViewId) => void
	readonly onOpenDrawer: (drawer: Exclude<StudioDrawerId, null>) => void
	readonly target: ApplicationTarget
}

export function StudioShell({
	activeDrawer,
	activeView,
	children,
	onCloseDrawer,
	onNavigate,
	onOpenDrawer,
	target
}: StudioShellProperties): JSX.Element {
	const { t } = useLocalization()
	const navigate = (view: StudioViewId): void => {
		onNavigate(view)
		onCloseDrawer()
	}
	return (
		<main className="studio-shell" data-application-target={target}>
			<TitleBar
				onOpenContext={() => onOpenDrawer('context')}
				onOpenNavigation={() => onOpenDrawer('navigation')}
				target={target}
			/>
			<div className="studio-shell__body">
				<ActivityRail activeView={activeView} onNavigate={navigate} />
				<div className="studio-shell__work-area">
					<TransportBar />
					<div className="studio-shell__content-grid">
						<div className="studio-shell__layers">
							<LayersPanel
								activeView={activeView}
								onAdd={() => navigate('first-layer')}
								onNavigate={navigate}
							/>
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
				onClose={onCloseDrawer}
				open={activeDrawer === 'navigation'}
				side="left"
			>
				<div className="studio-drawer__navigation">
					<ActivityRail activeView={activeView} onNavigate={navigate} />
					<LayersPanel
						activeView={activeView}
						onAdd={() => navigate('first-layer')}
						onNavigate={navigate}
					/>
				</div>
			</StudioDrawer>
			<StudioDrawer
				label={t('context.title')}
				onClose={onCloseDrawer}
				open={activeDrawer === 'context'}
				side="right"
			>
				<ContextPanel />
			</StudioDrawer>
		</main>
	)
}
