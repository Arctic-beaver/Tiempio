import { useEffect, useState, type JSX } from 'react'
import { ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type {
	BeginnerChordSuggestion,
	PerformanceLayout
} from '../../../../music-theory/src/index.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'

export function PlayPerformancePanel(): JSX.Element {
	const { t } = useLocalization()
	const { projections } = useProjectSession()
	const controller = useApplicationRuntimeController()
	const [layout, setLayout] = useState<PerformanceLayout>('full')
	const [octave, setOctave] = useState(projections.transport.octave)
	const [rotation, setRotation] = useState(0)
	const [chord, setChord] = useState<BeginnerChordSuggestion | null>(
		projections.transport.palette.chords[0] ?? null
	)
	useEffect(() => {
		return () => {
			controller.performanceInput.deactivate('project-play-drawer')
		}
	}, [controller])
	return (
		<ScrollSurface className="play-performance-panel">
			<header>
				<span>{t('songPalette.playCurrent')}</span>
				<h2>{projections.transport.palette.name}</h2>
				<p>{t('songPalette.playDescription')}</p>
			</header>
			<PerformanceKeyboard
				chord={chord}
				layout={layout}
				octave={octave}
				onLayoutChange={setLayout}
				onOctaveChange={setOctave}
				onRotationChange={setRotation}
				ownerId="project-play-drawer"
				palette={projections.transport.palette}
				rotation={rotation}
			/>
			<div className="play-performance-panel__chords">
				{projections.transport.palette.chords.map((suggestion) => (
					<button
						aria-pressed={chord?.role === suggestion.role}
						key={suggestion.role}
						onClick={() => setChord(suggestion)}
						type="button"
					>
						<strong>{t(`songPalette.chord.${suggestion.role}`)}</strong>
						<span>{suggestion.name}</span>
					</button>
				))}
			</div>
			<p className="play-performance-panel__hint">{t('songPalette.focusHint')}</p>
		</ScrollSurface>
	)
}
