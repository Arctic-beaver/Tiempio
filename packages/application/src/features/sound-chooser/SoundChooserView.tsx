import { AudioLines, CircleDot, Music2, Waves } from 'lucide-react'
import { useState, type CSSProperties, type JSX, type ReactNode } from 'react'
import { useLocalization, type LocalizationKey } from '../../../../localization/src/index.js'
import { songPalette, type SongPalette } from '../../../../music-theory/src/index.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { StudioTopBar } from '../../shell/StudioTopBar.js'
import { TransportBar } from '../../shell/TransportBar.js'
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
	palette = songPalette({ tonic: 9, mode: 'minor' })
}: SoundChooserViewProperties): JSX.Element {
	const { t } = useLocalization()
	const performanceOwnerId = 'sound-chooser'
	const [octave, setOctave] = useState(2)
	const [rotation, setRotation] = useState(0)
	return (
		<section
			className="studio-view sound-chooser-view"
			data-sound-count={model.sounds.length}
			data-testid="view-sound-chooser"
		>
			<StudioTopBar
				center={<TransportBar mode="audition" />}
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
						<span className="audition-label">{t('soundChooser.auditionHint')}</span>
						<svg
							aria-hidden="true"
							className="wave"
							preserveAspectRatio="none"
							viewBox="0 0 800 100"
						>
							<path d="M0 50 C25 18 46 82 71 50 S118 18 143 50 189 82 214 50 260 18 286 50 332 82 357 50 403 18 429 50 475 82 500 50 546 18 572 50 618 82 643 50 689 18 715 50 761 82 800 50" />
							<path
								d="M0 50 C38 36 61 64 99 50 S160 36 198 50 259 64 297 50 358 36 396 50 457 64 495 50 556 36 594 50 655 64 693 50 754 36 800 50"
								opacity=".28"
							/>
						</svg>
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
