import { CircleStop, Pause, Play, Repeat2, Settings2, Volume2 } from 'lucide-react'
import type { JSX } from 'react'
import { IconButton, Popover, Select, Tooltip } from '../../../design-system/src/index.js'
import {
	useLocalization,
	type LocalizationKey,
	type SupportedLocale
} from '../../../localization/src/index.js'
import { useCommands } from '../commands/CommandContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import {
	usePresentationSettings,
	type PresentationSettingsContextValue,
	type SettingsPersistenceState
} from '../providers/PresentationSettingsContext.js'

const themeValues = Object.freeze(['system', 'light', 'dark'] as const)
const localeValues = Object.freeze(['en', 'ru', 'es'] as const)
const persistenceLabelKeys: Readonly<Record<SettingsPersistenceState, LocalizationKey>> =
	Object.freeze({
		'session-only': 'settings.sessionOnly',
		loading: 'settings.loading',
		saved: 'settings.saved',
		failed: 'settings.failed'
	})

export function TransportBar(): JSX.Element {
	const { t } = useLocalization()
	const settings = usePresentationSettings()
	const { execute, looping, playing } = useCommands()
	const { projections } = useProjectSession()
	return (
		<div aria-label={t('transport.toolbar')} className="transport-bar" role="toolbar">
			<div className="transport-bar__primary">
				<Tooltip content={playing ? t('transport.pause') : t('transport.play')}>
					<IconButton
						icon={playing ? <Pause /> : <Play />}
						label={playing ? t('transport.pause') : t('transport.play')}
						onClick={() => execute('transport.toggle-playback')}
						tone="accent"
					/>
				</Tooltip>
				<Tooltip content={t('transport.stop')}>
					<IconButton
						icon={<CircleStop />}
						label={t('transport.stop')}
						onClick={() => execute('transport.stop')}
					/>
				</Tooltip>
			</div>
			<div className="transport-bar__position">
				<span>{t('transport.position')}</span>
				<strong>01 · 01 · 000</strong>
			</div>
			<button className="transport-bar__tempo" type="button">
				<span>{t('transport.tempo')}</span>
				<strong>{projections.transport.bpm}</strong>
			</button>
			<Tooltip content={t('transport.loop')}>
				<IconButton
					icon={<Repeat2 />}
					label={t('transport.loop')}
					onClick={() => execute('transport.toggle-loop')}
					selected={looping}
				/>
			</Tooltip>
			<div className="transport-bar__spacer" />
			<div className="transport-bar__audio" role="status">
				<Volume2 aria-hidden="true" />
				<span>{t('transport.audioShared')}</span>
			</div>
			<Popover icon={<Settings2 />} label={t('common.settings')}>
				<div className="settings-popover">
					<Select
						label={t('common.theme')}
						onChange={settings.setColorScheme}
						options={themeValues.map((value) => ({
							value,
							label: t(`common.${value}`)
						}))}
						value={settings.colorScheme}
					/>
					<Select<SupportedLocale>
						label={t('common.language')}
						onChange={settings.setLocale}
						options={localeValues.map((value) => ({
							value,
							label:
								value === 'en' ? 'English' : value === 'ru' ? 'Русский' : 'Español'
						}))}
						value={settings.locale}
					/>
					<SettingsStatus settings={settings} />
				</div>
			</Popover>
		</div>
	)
}

function SettingsStatus({ settings }: { settings: PresentationSettingsContextValue }): JSX.Element {
	const { t } = useLocalization()
	return (
		<small className="settings-popover__status" data-state={settings.persistenceState}>
			{t(persistenceLabelKeys[settings.persistenceState])}
		</small>
	)
}
