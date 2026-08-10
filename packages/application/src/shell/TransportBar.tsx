import { CircleStop, Play, Repeat2, Settings2, Volume2 } from 'lucide-react'
import type { JSX } from 'react'
import { Popover, Select } from '../../../design-system/src/index.js'
import {
	useLocalization,
	type LocalizationKey,
	type SupportedLocale
} from '../../../localization/src/index.js'
import { CommandIconButton } from '../commands/CommandIconButton.js'
import { useCommands } from '../commands/CommandContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
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
	const { looping } = useCommands()
	const { projections } = useProjectSession()
	const runtime = useApplicationRuntime()
	const engineAvailable = runtime.engine.availability === 'available'
	return (
		<div aria-label={t('transport.toolbar')} className="transport-bar" role="toolbar">
			<div className="transport-bar__primary">
				<CommandIconButton
					commandId="transport.toggle-playback"
					icon={<Play />}
					label={t('transport.play')}
					tone="accent"
				/>
				<CommandIconButton
					commandId="transport.stop"
					icon={<CircleStop />}
					label={t('transport.stop')}
				/>
			</div>
			<div className="transport-bar__position">
				<span>{t('transport.position')}</span>
				<strong>01 · 01 · 000</strong>
			</div>
			<div className="transport-bar__tempo">
				<span>{t('transport.tempo')}</span>
				<strong>{projections.transport.bpm}</strong>
			</div>
			<CommandIconButton
				commandId="transport.toggle-loop"
				icon={<Repeat2 />}
				label={t('transport.loop')}
				selected={looping}
			/>
			<div className="transport-bar__spacer" />
			<div
				className="transport-bar__audio"
				data-availability={engineAvailable ? 'available' : 'unavailable'}
				role="status"
			>
				<Volume2 aria-hidden="true" />
				<span>{t(engineAvailable ? 'engine.available' : 'engine.unavailable')}</span>
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
