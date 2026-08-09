import { CircleStop, Pause, Play, Repeat2, Settings2, Volume2 } from 'lucide-react'
import { useState, type JSX } from 'react'
import { IconButton, Popover, Select, Tooltip } from '../../../design-system/src/index.js'
import { useLocalization, type SupportedLocale } from '../../../localization/src/index.js'
import {
	usePresentationSettings,
	type PresentationSettingsContextValue
} from '../providers/PresentationSettingsContext.js'

const themeValues = Object.freeze(['system', 'light', 'dark'] as const)
const localeValues = Object.freeze(['en', 'ru'] as const)

export function TransportBar(): JSX.Element {
	const { t } = useLocalization()
	const settings = usePresentationSettings()
	const [playing, setPlaying] = useState(false)
	return (
		<div aria-label="Transport" className="transport-bar" role="toolbar">
			<div className="transport-bar__primary">
				<Tooltip content={playing ? t('transport.pause') : t('transport.play')}>
					<IconButton
						icon={playing ? <Pause /> : <Play />}
						label={playing ? t('transport.pause') : t('transport.play')}
						onClick={() => setPlaying((current) => !current)}
						tone="accent"
					/>
				</Tooltip>
				<Tooltip content={t('transport.stop')}>
					<IconButton
						icon={<CircleStop />}
						label={t('transport.stop')}
						onClick={() => setPlaying(false)}
					/>
				</Tooltip>
			</div>
			<div className="transport-bar__position">
				<span>{t('transport.position')}</span>
				<strong>01 · 01 · 000</strong>
			</div>
			<button className="transport-bar__tempo" type="button">
				<span>{t('transport.tempo')}</span>
				<strong>108</strong>
			</button>
			<Tooltip content={t('transport.loop')}>
				<IconButton icon={<Repeat2 />} label={t('transport.loop')} selected />
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
							label: value === 'en' ? 'English' : 'Русский'
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
	return (
		<small className="settings-popover__status" data-state={settings.persistenceState}>
			{settings.persistenceState === 'session-only'
				? 'Saved for this session'
				: settings.persistenceState}
		</small>
	)
}
