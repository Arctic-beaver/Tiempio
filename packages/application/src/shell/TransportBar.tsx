import { AudioLines, Keyboard, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { Popover, SemanticSlider } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { SongPalettePopover } from '../features/song-palette/SongPalettePopover.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { usePresentationSettings } from '../providers/PresentationSettingsContext.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { transportBeatPresentation } from './transport-presentation.js'

export interface TransportBarProperties {
	readonly detailControl?: ReactNode
	readonly detailLabel?: string
	readonly detailValue?: string
	readonly meterDescription?: string
	readonly meterValue?: string
	readonly mode?: 'audition' | 'preview' | 'project'
}

function MetronomeControls({
	audible,
	available,
	beatCount,
	currentBeat,
	playing
}: {
	readonly audible: boolean
	readonly available: boolean
	readonly beatCount: number
	readonly currentBeat: number
	readonly playing: boolean
}): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const settings = usePresentationSettings()
	const [draftVolume, setDraftVolume] = useState<number | null>(null)
	return (
		<div
			className="transport__metronome"
			data-audible={audible || undefined}
			data-playing={playing || undefined}
		>
			<CommandIconButton
				className="icon-button transport__metronome-toggle"
				commandId="transport.toggle-metronome"
				icon={<AudioLines />}
				label={t(
					settings.metronomeEnabled
						? 'transport.metronomeDisable'
						: 'transport.metronomeEnable'
				)}
				selected={settings.metronomeEnabled}
			/>
			<div aria-hidden="true" className="transport__beat-indicator">
				{beatCount <= 8 ? (
					Array.from({ length: Math.max(1, beatCount) }, (_, index) => (
						<span
							className="transport__beat-dot"
							data-current={index === currentBeat - 1 || undefined}
							key={index}
						/>
					))
				) : (
					<span className="transport__beat-count">
						{currentBeat}/{beatCount}
					</span>
				)}
			</div>
			<div className="transport__metronome-volume">
				<Popover
					disabled={!available}
					icon={<Volume2 />}
					label={t('transport.metronomeVolume')}
				>
					<div className="transport__volume-panel">
						<SemanticSlider
							disabled={!available}
							formatValue={(value) => `${String(Math.round(value * 100))}%`}
							label={t('transport.metronomeVolume')}
							max={1}
							min={0}
							onChange={(value) => {
								setDraftVolume(value)
								controller.setMetronomeVolume(value)
							}}
							onCancel={() => {
								controller.setMetronomeVolume(settings.metronomeVolume)
								setDraftVolume(null)
							}}
							onCommit={(value) => {
								settings.setMetronomeVolume(value)
								setDraftVolume(null)
							}}
							step={0.05}
							value={draftVolume ?? settings.metronomeVolume}
						/>
					</div>
				</Popover>
			</div>
		</div>
	)
}

export function TransportBar({
	detailControl,
	detailLabel,
	detailValue,
	meterDescription,
	meterValue,
	mode = 'project'
}: TransportBarProperties): JSX.Element {
	const { t } = useLocalization()
	const { projections, snapshot } = useProjectSession()
	const settings = usePresentationSettings()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const compact = mode !== 'project'
	const projectDetailLabel = detailLabel ?? t('transport.songPalette')
	const projectDetailValue = detailValue ?? projections.transport.palette.name
	const beat = transportBeatPresentation(
		engine.tick,
		snapshot.project.transport.meterMap,
		snapshot.project.transport.ticksPerQuarter
	)
	const currentMeterValue = meterValue ?? `${String(beat.numerator)}/${String(beat.denominator)}`
	const currentMeterDescription =
		meterDescription ?? t('transport.beatsInBar', { beats: beat.numerator })
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
				<MetronomeControls
					audible={engine.available && engine.playing && settings.metronomeEnabled}
					available={engine.available}
					beatCount={beat.numerator}
					currentBeat={beat.beat}
					playing={engine.playing}
				/>
			)}
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
					{detailControl === undefined &&
					detailLabel === undefined &&
					detailValue === undefined ? (
						<div className="transport__palette">
							<SongPalettePopover />
						</div>
					) : (
						(detailControl ?? (
							<div className="key-control">
								<span>{projectDetailLabel}</span>
								<b>{projectDetailValue}</b>
							</div>
						))
					)}
					<CommandIconButton
						className="icon-button transport__keyboard"
						commandId="layout.open-play"
						icon={<Keyboard />}
						label={t('songPalette.openPlay')}
					/>
					<div
						aria-label={`${t('transport.meter')}: ${currentMeterValue}. ${currentMeterDescription}`}
						className="meter-control"
						title={currentMeterDescription}
					>
						<span>{t('transport.meter')}</span>
						<b>{currentMeterValue}</b>
						<small>{currentMeterDescription}</small>
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
