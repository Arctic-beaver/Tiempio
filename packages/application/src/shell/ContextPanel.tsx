import { Equal, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState, type JSX } from 'react'
import { Select, SemanticSlider } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'

const soundOptions = Object.freeze([
	Object.freeze({ value: 'felt-signal', label: 'Felt Signal', description: 'Warm · soft edge' }),
	Object.freeze({
		value: 'clear-glass',
		label: 'Clear Glass',
		description: 'Clear · patient decay'
	}),
	Object.freeze({ value: 'low-ember', label: 'Low Ember', description: 'Deep · quiet movement' })
] as const)

export function ContextPanel(): JSX.Element {
	const { t } = useLocalization()
	const [sound, setSound] = useState<(typeof soundOptions)[number]['value']>('felt-signal')
	const [energy, setEnergy] = useState(68)
	return (
		<aside aria-label={t('context.title')} className="context-panel">
			<header>
				<span>
					<SlidersHorizontal aria-hidden="true" />
					{t('context.title')}
				</span>
				<small>Glass melody</small>
			</header>
			<div className="context-panel__section">
				<div className="context-panel__section-title">
					<Sparkles aria-hidden="true" />
					<h3>{t('context.sound')}</h3>
				</div>
				<Select
					label={t('context.feel')}
					onChange={setSound}
					options={soundOptions}
					value={sound}
				/>
			</div>
			<div className="context-panel__section">
				<div className="context-panel__section-title">
					<Equal aria-hidden="true" />
					<h3>{t('context.pattern')}</h3>
				</div>
				<SemanticSlider
					formatValue={(value) => `${String(value)}%`}
					label={t('context.velocity')}
					max={100}
					min={0}
					onChange={setEnergy}
					value={energy}
				/>
			</div>
			<div className="context-panel__note">
				<span aria-hidden="true">↗</span>
				<p>Changes stay gentle until the audio engine is connected.</p>
			</div>
		</aside>
	)
}
