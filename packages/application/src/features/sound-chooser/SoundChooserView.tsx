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
import { SemanticSlider } from '../../../../design-system/src/index.js'
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
import { useLocalization } from '../../../../localization/src/index.js'
import { songPalette } from '../../../../music-theory/src/index.js'
import type {
	LayerPerformanceMapping,
	ProjectKey,
	SemanticSynthMacrosV2,
	SoundFamily,
	SynthMacroId,
	SynthPresetId
} from '../../../../project-core/src/index.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { soundDemoProgram } from './sound-demo-model.js'
import { SoundWaveform } from './SoundWaveform.js'
import { soundChooserViewModel, type SoundChooserViewModel } from './view-model.js'

const categoryIcons = Object.freeze({
	bass: <CircleDot />,
	lead: <Waves />,
	pad: <AudioLines />,
	pluck: <Music2 />,
	texture: <Waves />
} as const satisfies Readonly<Record<SoundFamily, ReactNode>>)

const axes = Object.freeze([
	Object.freeze({ id: 'brightness', left: 'Dark', right: 'Bright' }),
	Object.freeze({ id: 'hardness', left: 'Soft', right: 'Hard' }),
	Object.freeze({ id: 'dirt', left: 'Clean', right: 'Dirty' }),
	Object.freeze({ id: 'length', left: 'Short', right: 'Long' })
] as const satisfies readonly {
	readonly id: SynthMacroId
	readonly left: string
	readonly right: string
}[])

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
	readonly onCommitMacro: (macro: SynthMacroId, value: number) => void
	readonly onSelectPreset: (presetId: SynthPresetId) => void
	readonly selectedMacros: SemanticSynthMacrosV2
	readonly selectedPresetId: SynthPresetId
}

export function SoundChooserView({
	initialPerformance = defaultPerformance,
	layerId,
	model = soundChooserViewModel,
	onBack,
	onChoose,
	onCommitMacro,
	onSelectPreset,
	selectedMacros,
	selectedPresetId
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
	const [macroPreview, setMacroPreview] = useState<Partial<Record<SynthMacroId, number>>>({})
	const dockTabRefs = useRef(new Map<SoundMappingDockView, HTMLButtonElement>())
	const activeFamily =
		model.families.find((family) =>
			family.presets.some((preset) => preset.id === selectedPresetId)
		) ?? model.families[0]
	const activePreset =
		activeFamily?.presets.find((preset) => preset.id === selectedPresetId) ??
		activeFamily?.presets[0]
	const soundName =
		activeFamily === undefined || activePreset === undefined
			? 'Sound'
			: `${activePreset.name} ${activeFamily.name}`
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
	const selectPreset = (presetId: SynthPresetId): void => {
		releaseForMappingChange()
		setMacroPreview({})
		onSelectPreset(presetId)
	}
	const soundCount = model.families.reduce((total, family) => total + family.presets.length, 0)
	return (
		<section
			className="studio-view sound-chooser-view"
			data-sound-count={soundCount}
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
					{model.families.map((category) => {
						const active = category.id === activeFamily?.id
						const firstPreset = category.presets[0]
						return (
							<button
								aria-current={active ? 'true' : undefined}
								className={`category-row${active ? ' active' : ''}`}
								disabled={firstPreset === undefined}
								key={category.id}
								onClick={() => {
									if (firstPreset !== undefined) selectPreset(firstPreset.id)
								}}
								type="button"
							>
								<span aria-hidden="true">{categoryIcons[category.id]}</span>
								<strong>{category.name}</strong>
								<span>{String(category.presets.length).padStart(2, '0')}</span>
							</button>
						)
					})}
				</aside>
				<div className="sound-stage">
					<div className="sound-title">
						<div>
							<h1>{soundName}</h1>
							<p>
								{activePreset === undefined
									? t('soundChooser.description')
									: t(activePreset.descriptionKey)}
							</p>
						</div>
						<button
							className="primary-action sound-title__use"
							onClick={choose}
							type="button"
						>
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
									{ palette: palette.name, sound: soundName }
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
						{(activeFamily?.presets ?? []).map((preset) => {
							const active = preset.id === selectedPresetId
							return (
								<button
									aria-current={active ? 'true' : undefined}
									className={`preset-row${active ? ' active' : ''}`}
									key={preset.id}
									onClick={() => selectPreset(preset.id)}
									type="button"
								>
									<span className="tone-dot" />
									<span>
										<strong>{preset.name}</strong>{' '}
										<small>{t(preset.descriptionKey)}</small>
									</span>
									<span aria-hidden="true">↗</span>
								</button>
							)
						})}
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
								keyboardCapture="document"
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
						<aside className="sound-mapping-dock__switcher">
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
						</aside>
					</div>
				</div>
				<aside className="semantic-panel">
					<h2>{t('soundChooser.fineTune')}</h2>
					{axes.map((axis) => {
						const value =
							macroPreview[axis.id] ?? Math.round(selectedMacros[axis.id] * 100)
						return (
							<div
								className="semantic-row"
								key={axis.id}
								style={{ '--semantic-value': `${String(value)}%` } as CSSProperties}
							>
								<SemanticSlider
									formatValue={() => axis.right}
									label={axis.left}
									max={100}
									min={0}
									onChange={(nextValue) =>
										setMacroPreview((current) => ({
											...current,
											[axis.id]: nextValue
										}))
									}
									onCommit={(nextValue) => {
										releaseForMappingChange()
										onCommitMacro(axis.id, nextValue / 100)
										setMacroPreview((current) => ({
											...current,
											[axis.id]: undefined
										}))
									}}
									value={value}
								/>
							</div>
						)
					})}
					<p className="semantic-help">{t('soundChooser.semanticHelp')}</p>
				</aside>
			</div>
		</section>
	)
}
