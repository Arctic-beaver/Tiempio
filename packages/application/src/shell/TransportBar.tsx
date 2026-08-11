import { Keyboard, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useSyncExternalStore, type JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { SongPalettePopover } from '../features/song-palette/SongPalettePopover.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'

export interface TransportBarProperties {
	readonly detailLabel?: string
	readonly detailValue?: string
	readonly meterDescription?: string
	readonly meterValue?: string
	readonly mode?: 'audition' | 'preview' | 'project'
}

export function TransportBar({
	detailLabel,
	detailValue,
	meterDescription,
	meterValue,
	mode = 'project'
}: TransportBarProperties): JSX.Element {
	const { t } = useLocalization()
	const { projections } = useProjectSession()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const compact = mode !== 'project'
	const projectDetailLabel = detailLabel ?? t('transport.songPalette')
	const projectDetailValue = detailValue ?? projections.transport.palette.name
	return (
		<div aria-label={t('transport.toolbar')} className="transport" role="toolbar">
			{compact ? null : (
				<button
					aria-label={t('transport.previous')}
					className="icon-button transport__skip"
					disabled
					type="button"
				>
					<SkipBack aria-hidden="true" />
				</button>
			)}
			<CommandIconButton
				className="icon-button play-button"
				commandId="transport.toggle-playback"
				icon={engine.playing ? <Pause /> : <Play />}
				label={t(engine.playing ? 'transport.pause' : 'transport.play')}
				selected={engine.playing}
			/>
			{compact ? null : (
				<button
					aria-label={t('transport.next')}
					className="icon-button transport__skip"
					disabled
					type="button"
				>
					<SkipForward aria-hidden="true" />
				</button>
			)}
			{mode === 'project' ? (
				<>
					<div className="tempo">
						<span>{t('transport.tempo')}</span>
						<b>{projections.transport.bpm}</b>
					</div>
					{detailLabel === undefined && detailValue === undefined ? (
						<div className="transport__palette">
							<SongPalettePopover />
						</div>
					) : (
						<div className="key-control">
							<span>{projectDetailLabel}</span>
							<b>{projectDetailValue}</b>
						</div>
					)}
					<CommandIconButton
						className="icon-button transport__keyboard"
						commandId="layout.open-play"
						icon={<Keyboard />}
						label={t('songPalette.openPlay')}
					/>
					{meterValue === undefined ? null : (
						<div
							aria-label={`${t('transport.meter')}: ${meterValue}. ${meterDescription ?? ''}`}
							className="meter-control"
							title={meterDescription}
						>
							<span>{t('transport.meter')}</span>
							<b>{meterValue}</b>
						</div>
					)}
				</>
			) : (
				<div className="key-control transport__mode">
					<span>{mode === 'audition' ? 'Audition' : 'Preview'}</span>
					<b>{mode === 'audition' ? 'A2' : 'Loop'}</b>
				</div>
			)}
		</div>
	)
}
