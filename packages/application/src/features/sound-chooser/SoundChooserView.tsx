import { AudioLines, CircleDot, Headphones, Music2, Square, Waves } from 'lucide-react'
import {
	useEffect,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type JSX,
	type ReactNode
} from 'react'
import { useLocalization, type LocalizationKey } from '../../../../localization/src/index.js'
import { songPalette, type SongPalette } from '../../../../music-theory/src/index.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { soundDemoProgram } from './sound-demo-model.js'
import { SoundWaveform } from './SoundWaveform.js'
import { soundChooserViewModel, type SoundChooserViewModel } from './view-model.js'

const categories: readonly {
	readonly count: string
	readonly icon: ReactNode
	readonly name: string
}[] = Object.freeze([
	Object.freeze({ name: 'Bass', count: '06', icon: <CircleDot /> }),
	Object.freeze({ name: 'Lead', count: '07', icon: <Waves /> }),
	Object.freeze({ name: 'Pad', count: '05', icon: <AudioLines /> }),
	Object.freeze({ name: 'Pluck', count: '04', icon: <Music2 /> }),
	Object.freeze({ name: 'Texture', count: '05', icon: <Waves /> })
])

const presets: readonly {
	readonly descriptionKey: LocalizationKey
	readonly name: string
}[] = Object.freeze([
	Object.freeze({ name: 'Deep', descriptionKey: 'soundChooser.presetDeep' }),
	Object.freeze({ name: 'Punchy', descriptionKey: 'soundChooser.presetPunchy' }),
	Object.freeze({ name: 'Warm', descriptionKey: 'soundChooser.presetWarm' }),
	Object.freeze({ name: 'Dirty', descriptionKey: 'soundChooser.presetDirty' }),
	Object.freeze({ name: 'Soft', descriptionKey: 'soundChooser.presetSoft' }),
	Object.freeze({ name: 'Retro', descriptionKey: 'soundChooser.presetRetro' })
])

const axes = Object.freeze([
	Object.freeze({ left: 'Dark', right: 'Bright', value: '34%' }),
	Object.freeze({ left: 'Soft', right: 'Hard', value: '42%' }),
	Object.freeze({ left: 'Clean', right: 'Dirty', value: '22%' }),
	Object.freeze({ left: 'Short', right: 'Long', value: '58%' })
])

const defaultPalette = songPalette({ tonic: 9, mode: 'minor' })

export interface SoundChooserViewProperties {
	readonly model?: SoundChooserViewModel
	readonly onBack: () => void
	readonly onChoose: () => void
	readonly palette?: SongPalette
}

export function SoundChooserView({
	model = soundChooserViewModel,
	onBack,
	onChoose,
	palette = defaultPalette
}: SoundChooserViewProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const preview = useSyncExternalStore(
		controller.previewCoordinator.subscribe,
		controller.previewCoordinator.getSnapshot,
		controller.previewCoordinator.getSnapshot
	)
	const performanceOwnerId = 'sound-chooser'
	const [octave, setOctave] = useState(2)
	const [rotation, setRotation] = useState(0)
	const soundDemoActive = preview.active && preview.kind === 'sound'
	useEffect(() => {
		return () => {
			if (controller.previewCoordinator.getSnapshot().kind === 'sound') {
				controller.previewCoordinator.interrupt()
			}
		}
	}, [controller])
	const toggleSoundDemo = (): void => {
		if (soundDemoActive) {
			controller.previewCoordinator.interrupt()
			return
		}
		controller.previewCoordinator.start('sound', soundDemoProgram(palette, octave, rotation))
	}
	return (
		<section
			className="studio-view sound-chooser-view"
			data-sound-count={model.sounds.length}
			data-testid="view-sound-chooser"
		>
			<StudioTopBar
				center={<div aria-hidden="true" />}
				onBack={onBack}
				subtitle={t('soundChooser.subtitle')}
				title={t('soundChooser.title')}
			/>
			<div className="chooser-layout">
				<aside className="chooser-categories">
					<div className="chooser-kicker">{t('soundChooser.instrument')}</div>
					{categories.map((category, index) => (
						<button
							aria-current={index === 0 ? 'true' : undefined}
							className={`category-row${index === 0 ? ' active' : ''}`}
							disabled={index !== 0}
							key={category.name}
							title={index === 0 ? undefined : t('common.notAvailable')}
							type="button"
						>
							<span aria-hidden="true">{category.icon}</span>
							<strong>{category.name}</strong>
							<span>{category.count}</span>
						</button>
					))}
				</aside>
				<div className="sound-stage">
					<div className="sound-title">
						<div>
							<h1>Deep Bass</h1>
							<p>{t('soundChooser.deepBassDescription')}</p>
						</div>
						<button className="primary-action" onClick={onChoose} type="button">
							{t('soundChooser.useSound')}
						</button>
					</div>
					<div className="audition">
						<div className="audition__header">
							<span className="audition-label">{t('soundChooser.auditionHint')}</span>
							<button
								aria-label={t(
									soundDemoActive
										? 'soundChooser.stopDemoAria'
										: 'soundChooser.hearSoundAria',
									{ palette: palette.name, sound: 'Deep Bass' }
								)}
								aria-pressed={soundDemoActive}
								className="sound-demo-action"
								disabled={!engine.available || engine.playing}
								onClick={toggleSoundDemo}
								type="button"
							>
								{soundDemoActive ? (
									<Square aria-hidden="true" />
								) : (
									<Headphones aria-hidden="true" />
								)}
								{t(
									soundDemoActive
										? 'soundChooser.stopDemo'
										: 'soundChooser.hearSound'
								)}
							</button>
						</div>
						<SoundWaveform ownerId={performanceOwnerId} />
					</div>
					<div className="preset-lines">
						{presets.map((preset, index) => (
							<button
								aria-current={index === 0 ? 'true' : undefined}
								className={`preset-row${index === 0 ? ' active' : ''}`}
								disabled
								key={preset.name}
								title={t('common.notAvailable')}
								type="button"
							>
								<span className="tone-dot" />
								<span>
									<strong>{preset.name}</strong>{' '}
									<small>{t(preset.descriptionKey)}</small>
								</span>
								<span aria-hidden="true">↗</span>
							</button>
						))}
					</div>
					<PerformanceKeyboard
						layout="compact"
						octave={octave}
						onOctaveChange={setOctave}
						onRotationChange={setRotation}
						ownerId={performanceOwnerId}
						palette={palette}
						rotation={rotation}
					/>
				</div>
				<aside className="semantic-panel">
					<h2>{t('soundChooser.fineTune')}</h2>
					{axes.map((axis) => (
						<div className="semantic-row" key={axis.left}>
							<div className="semantic-labels">
								<span>{axis.left}</span>
								<span>{axis.right}</span>
							</div>
							<div
								className="semantic-line"
								style={{ '--semantic-value': axis.value } as CSSProperties}
							/>
						</div>
					))}
					<p className="semantic-help">{t('soundChooser.semanticHelp')}</p>
				</aside>
			</div>
		</section>
	)
}
