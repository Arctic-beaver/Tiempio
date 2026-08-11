import { ArrowLeft, Grid2X2, RefreshCw, Volume2 } from 'lucide-react'
import { useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { ProjectHistoryControls } from '../commands/ProjectHistoryControls.js'
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
	const engineConnecting =
		!engineAvailable &&
		(engine.health?.backendState === 'starting' || engine.health?.backendState === 'restarting')
	const engineStatusKey = engineAvailable
		? 'transport.sharedAudio'
		: engineConnecting
			? 'transport.audioConnecting'
			: 'transport.audioOffline'
	const engineLabelKey = engineAvailable
		? 'engine.available'
		: engineConnecting
			? 'engine.connecting'
			: 'engine.unavailable'
	const audioStatus = (
		<>
			<span aria-hidden="true" className="status-dot" />
			<strong>
				{t(
					!engineAvailable && !engineConnecting ? 'transport.audioRetry' : engineStatusKey
				)}
			</strong>
			{!engineAvailable && !engineConnecting ? (
				<RefreshCw aria-hidden="true" />
			) : (
				<Volume2 aria-hidden="true" />
			)}
		</>
	)
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
				{actions ?? <ProjectHistoryControls />}
				{!engineAvailable && !engineConnecting ? (
					<button
						aria-label={t('engine.retry')}
						className="audio-chip audio-chip--action"
						data-availability="unavailable"
						onClick={() => void controller.retryAudio()}
						type="button"
					>
						{audioStatus}
					</button>
				) : (
					<div
						aria-label={t(engineLabelKey)}
						className="audio-chip"
						data-availability={engineAvailable ? 'available' : 'pending'}
						role="status"
					>
						{audioStatus}
					</div>
				)}
			</div>
		</header>
	)
}
