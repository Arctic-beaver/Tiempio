import { lazy, Suspense, type JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { HomeView } from '../features/home/HomeView.js'
import { useHomeActions } from '../features/home/useHomeActions.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import type { StudioViewId } from './studio-state.js'

const EditorSurface = lazy(() => import('./surfaces/EditorSurface.js'))
const WorkflowSurface = lazy(() => import('./surfaces/WorkflowSurface.js'))

export interface ActiveStudioViewProperties {
	readonly activeView: StudioViewId
}

function LazyViewFallback(): JSX.Element {
	const { t } = useLocalization()
	return (
		<section
			aria-busy="true"
			aria-live="polite"
			className="studio-view"
			data-testid="view-loading"
			role="status"
		>
			<p className="studio-kicker">{t('common.loading')}</p>
		</section>
	)
}

export function ActiveStudioView({ activeView }: ActiveStudioViewProperties): JSX.Element {
	const { projections } = useProjectSession()
	const home = useHomeActions()

	if (activeView === 'home') {
		return (
			<HomeView
				model={projections.home}
				onCreate={home.createProject}
				onStartWithSound={home.startWithSound}
			/>
		)
	}
	return (
		<Suspense fallback={<LazyViewFallback />}>
			{activeView === 'first-layer' || activeView === 'sound-chooser' ? (
				<WorkflowSurface activeView={activeView} />
			) : (
				<EditorSurface activeView={activeView} />
			)}
		</Suspense>
	)
}
