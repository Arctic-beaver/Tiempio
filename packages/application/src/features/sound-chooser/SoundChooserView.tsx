import { ArrowLeft, Play, Waves } from 'lucide-react'
import type { JSX } from 'react'
import { TextButton } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { soundChooserViewModel, type SoundChooserViewModel } from './view-model.js'

export interface SoundChooserViewProperties {
	readonly model?: SoundChooserViewModel
	readonly onBack: () => void
	readonly onChoose: (soundId: string) => void
}

export function SoundChooserView({
	model = soundChooserViewModel,
	onBack,
	onChoose
}: SoundChooserViewProperties): JSX.Element {
	const { t } = useLocalization()
	return (
		<section className="studio-view sound-chooser-view" data-testid="view-sound-chooser">
			<div className="sound-chooser-view__heading">
				<TextButton icon={<ArrowLeft />} onClick={onBack}>
					{t('common.back')}
				</TextButton>
				<div className="studio-view__intro">
					<p className="studio-eyebrow">Palette 01</p>
					<h1>{t('soundChooser.title')}</h1>
					<p className="studio-lede">{t('soundChooser.description')}</p>
				</div>
			</div>
			<div className="sound-chooser-view__grid">
				{model.sounds.map((sound) => (
					<article className="sound-card" data-color={sound.color} key={sound.id}>
						<div aria-hidden="true" className="sound-card__wave">
							<Waves />
						</div>
						<span>{t(sound.labelKey)}</span>
						<h2>{sound.name}</h2>
						<p>{sound.description}</p>
						<div className="sound-card__actions">
							<TextButton disabled icon={<Play />} title={t('common.notAvailable')}>
								{t('soundChooser.preview')}
							</TextButton>
							<TextButton onClick={() => onChoose(sound.id)} tone="accent">
								{t('common.add')}
							</TextButton>
						</div>
					</article>
				))}
			</div>
		</section>
	)
}
