import { ArrowLeft, Grid2X2, Undo2, Volume2 } from 'lucide-react'
import { useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'

export interface StudioTopBarProperties {
	readonly actions?: ReactNode
	readonly backLabel?: string
	readonly center: ReactNode
	readonly onBack?: () => void
	readonly subtitle?: string
	readonly title?: string
}

export function StudioTopBar({
	actions,
	backLabel,
	center,
	onBack,
	subtitle,
	title
}: StudioTopBarProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const { snapshot } = useProjectSession()
	const engineAvailable = engine.available
	return (
		<header className="topbar">
			<div className="top-left">
				{onBack === undefined ? (
					<Grid2X2 aria-hidden="true" className="topbar__grid" />
				) : null}
				{onBack === undefined ? null : (
					<button
						aria-label={backLabel ?? t('common.back')}
						className="icon-button topbar__back"
						onClick={onBack}
						type="button"
					>
						<ArrowLeft aria-hidden="true" />
					</button>
				)}
				<div>
					<div className="project-name">{title ?? snapshot.project.title}</div>
					<div className="subtle-label">{subtitle ?? t('project.savedLocally')}</div>
				</div>
			</div>
			{center}
			<div className="top-right">
				{actions ?? (
					<button
						aria-label={t('common.notAvailable')}
						className="icon-button topbar__undo"
						disabled
						type="button"
					>
						<Undo2 aria-hidden="true" />
					</button>
				)}
				<div
					aria-label={t(engineAvailable ? 'engine.available' : 'engine.unavailable')}
					className="audio-chip"
					data-availability={engineAvailable ? 'available' : 'unavailable'}
					role="status"
				>
					<span aria-hidden="true" className="status-dot" />
					<strong>
						{t(engineAvailable ? 'transport.sharedAudio' : 'transport.audioOffline')}
					</strong>
					<Volume2 aria-hidden="true" />
				</div>
			</div>
		</header>
	)
}
