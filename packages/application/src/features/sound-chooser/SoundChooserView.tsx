import {
	AudioLines,
	ChevronDown,
	ChevronUp,
	CircleDot,
	Headphones,
	Keyboard,
	Music2,
	SlidersHorizontal,
	Square,
	Waves
} from 'lucide-react'
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode
} from 'react'
import { useLocalization, type LocalizationKey } from '../../../../localization/src/index.js'
import { songPalette } from '../../../../music-theory/src/index.js'
import type { LayerPerformanceMapping, ProjectKey } from '../../../../project-core/src/index.js'
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

const defaultPerformance = Object.freeze({
	key: Object.freeze({ tonic: 9, mode: 'minor' as const }),
	octave: 2
})

type SoundMappingDockView = 'keys' | 'scale'

const dockViews = Object.freeze<readonly SoundMappingDockView[]>(['keys', 'scale'])
const keysTabId = 'sound-mapping-keys-tab'
const keysPanelId = 'sound-mapping-keys-panel'
const scaleTabId = 'sound-mapping-scale-tab'
const scalePanelId = 'sound-mapping-scale-panel'

export interface SoundChooserViewProperties {
	readonly initialPerformance?: LayerPerformanceMapping
	readonly layerId: string | null
	readonly model?: SoundChooserViewModel
	readonly onBack: () => void
	readonly onChoose: (performance: LayerPerformanceMapping) => void
}

export function SoundChooserView({
	initialPerformance = defaultPerformance,
	layerId,
	model = soundChooserViewModel,
	onBack,
	onChoose
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
	const [dockView, setDockView] = useState<SoundMappingDockView>('keys')
	const [key, setKey] = useState<ProjectKey>(() => ({ ...initialPerformance.key }))
	const [octave, setOctave] = useState(initialPerformance.octave)
	const dockTabRefs = useRef(new Map<SoundMappingDockView, HTMLButtonElement>())
	const palette = useMemo(() => songPalette(key), [key])
	const rootOptions = useMemo(
		() =>
			Array.from({ length: 12 }, (_, tonic) => ({
				tonic,
				label: songPalette({ tonic, mode: key.mode }).tonicName
			})),
		[key.mode]
	)
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
		if (layerId !== null) {
			controller.previewCoordinator.start(
				'sound',
				layerId,
				soundDemoProgram(palette, octave, 0)
			)
		}
	}
	const releaseForMappingChange = (): void => {
		controller.previewCoordinator.interrupt()
		controller.performanceInput.releaseAll()
	}
	const selectDockView = (next: SoundMappingDockView): void => {
		if (next === dockView) return
		controller.performanceInput.releaseAll()
		setDockView(next)
	}
	const handleDockTabKeyDown = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		current: SoundMappingDockView
	): void => {
		const currentIndex = dockViews.indexOf(current)
		let nextIndex: number | null = null
		if (event.code === 'ArrowDown') nextIndex = (currentIndex + 1) % dockViews.length
		if (event.code === 'ArrowUp') {
			nextIndex = (currentIndex + dockViews.length - 1) % dockViews.length
		}
		if (event.code === 'Home') nextIndex = 0
		if (event.code === 'End') nextIndex = dockViews.length - 1
		if (nextIndex === null) return
		event.preventDefault()
		const next = dockViews[nextIndex]
		if (next === undefined) return
		selectDockView(next)
		dockTabRefs.current.get(next)?.focus()
	}
	const choose = (): void => {
		controller.previewCoordinator.interrupt()
		controller.performanceInput.releaseAll()
		onChoose({ key: { ...key }, octave })
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
					<div className="sound-mapping-dock" data-view={dockView}>
						<div
							aria-labelledby={keysTabId}
							className="sound-mapping-dock__panel"
							hidden={dockView !== 'keys'}
							id={keysPanelId}
							role="tabpanel"
						>
							<PerformanceKeyboard
								layout="compact"
								layerId={layerId}
								octave={octave}
								ownerId={performanceOwnerId}
								palette={palette}
								presentation="strip"
								rotation={0}
							/>
						</div>
						<div
							aria-labelledby={scaleTabId}
							className="sound-mapping-dock__panel sound-mapping-dock__panel--scale"
							hidden={dockView !== 'scale'}
							id={scalePanelId}
							role="tabpanel"
						>
							<div className="sound-scale-builder">
								<div
									aria-label={t('soundChooser.rootNote')}
									className="sound-scale-builder__group sound-scale-builder__group--roots"
									role="group"
								>
									<span>{t('soundChooser.rootNote')}</span>
									<div className="sound-scale-builder__roots">
										{rootOptions.map((option) => (
											<button
												aria-pressed={key.tonic === option.tonic}
												key={option.tonic}
												onClick={() => {
													releaseForMappingChange()
													setKey({ ...key, tonic: option.tonic })
												}}
												type="button"
											>
												{option.label}
											</button>
										))}
									</div>
								</div>
								<div
									aria-label={t('soundChooser.scaleType')}
									className="sound-scale-builder__group"
									role="group"
								>
									<span>{t('soundChooser.scaleType')}</span>
									<div className="sound-scale-builder__segments">
										{(['major', 'minor'] as const).map((mode) => (
											<button
												aria-pressed={key.mode === mode}
												key={mode}
												onClick={() => {
													releaseForMappingChange()
													setKey({ ...key, mode })
												}}
												type="button"
											>
												{t(
													mode === 'major'
														? 'soundChooser.major'
														: 'soundChooser.minor'
												)}
											</button>
										))}
									</div>
								</div>
								<div className="sound-scale-builder__group">
									<span>{t('songPalette.octave', { octave })}</span>
									<div className="sound-scale-builder__octave">
										<button
											aria-label={t('songPalette.octaveDown')}
											disabled={octave <= 1}
											onClick={() => {
												releaseForMappingChange()
												setOctave(octave - 1)
											}}
											type="button"
										>
											<ChevronDown aria-hidden="true" />
										</button>
										<strong>{octave}</strong>
										<button
											aria-label={t('songPalette.octaveUp')}
											disabled={octave >= 6}
											onClick={() => {
												releaseForMappingChange()
												setOctave(octave + 1)
											}}
											type="button"
										>
											<ChevronUp aria-hidden="true" />
										</button>
									</div>
								</div>
							</div>
						</div>
						<aside className="sound-mapping-dock__actions">
							<div
								aria-label={t('soundChooser.mappingControls')}
								aria-orientation="vertical"
								className="sound-mapping-dock__tabs"
								role="tablist"
							>
								<button
									aria-controls={keysPanelId}
									aria-selected={dockView === 'keys'}
									id={keysTabId}
									onClick={() => selectDockView('keys')}
									onKeyDown={(event) => handleDockTabKeyDown(event, 'keys')}
									ref={(element) => {
										if (element === null) dockTabRefs.current.delete('keys')
										else dockTabRefs.current.set('keys', element)
									}}
									role="tab"
									tabIndex={dockView === 'keys' ? 0 : -1}
									type="button"
								>
									<Keyboard aria-hidden="true" />
									<span>
										<strong>{t('soundChooser.keysTab')}</strong>
										<small>A S D F G H J</small>
									</span>
								</button>
								<button
									aria-controls={scalePanelId}
									aria-selected={dockView === 'scale'}
									id={scaleTabId}
									onClick={() => selectDockView('scale')}
									onKeyDown={(event) => handleDockTabKeyDown(event, 'scale')}
									ref={(element) => {
										if (element === null) dockTabRefs.current.delete('scale')
										else dockTabRefs.current.set('scale', element)
									}}
									role="tab"
									tabIndex={dockView === 'scale' ? 0 : -1}
									type="button"
								>
									<SlidersHorizontal aria-hidden="true" />
									<span>
										<strong>{t('soundChooser.scaleTab')}</strong>
										<small>
											{t('soundChooser.mappingSummary', {
												palette: palette.name,
												octave
											})}
										</small>
									</span>
								</button>
							</div>
							<button
								className="primary-action sound-mapping-dock__use"
								onClick={choose}
								type="button"
							>
								{t('soundChooser.useSound')}
							</button>
						</aside>
					</div>
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
