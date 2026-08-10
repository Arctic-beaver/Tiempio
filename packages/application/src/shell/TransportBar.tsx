import { Play, SkipBack, SkipForward } from 'lucide-react'
import type { JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'

export interface TransportBarProperties {
	readonly detailLabel?: string
	readonly detailValue?: string
	readonly mode?: 'audition' | 'preview' | 'project'
}

export function TransportBar({
	detailLabel = 'Key',
	detailValue = 'A minor',
	mode = 'project'
}: TransportBarProperties): JSX.Element {
	const { t } = useLocalization()
	const { projections } = useProjectSession()
	const compact = mode !== 'project'
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
				icon={<Play />}
				label={t('transport.play')}
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
					<div className="key-control">
						<span>{detailLabel}</span>
						<b>{detailValue}</b>
					</div>
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
