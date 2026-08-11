import { Headphones, Square } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { ScrollSurface } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import {
	type BeginnerChordSuggestion,
	type PerformanceLayout,
	type SongPalette
} from '../../../../music-theory/src/index.js'
import { PerformanceKeyboard } from '../../performance/PerformanceKeyboard.js'
import { useProjectSession } from '../../project/ProjectSessionContext.js'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import {
	availableSongPalettes,
	chordPreviewProgram,
	palettePreviewProgram
} from './song-palette-model.js'

export interface SongPalettePanelProperties {
	readonly onApplied?: () => void
	readonly ownerId: string
	readonly showApply?: boolean
	readonly variant?: 'panel' | 'setup'
}

function projectHasPitchedNotes(
	project: ReturnType<typeof useProjectSession>['snapshot']['project']
): boolean {
	return project.layers.some((layer) =>
		layer.clips.some((clip) => clip.kind === 'midi' && clip.notes.length > 0)
	)
}

export function SongPalettePanel({
	onApplied,
	ownerId,
	showApply = true,
	variant = 'panel'
}: SongPalettePanelProperties): JSX.Element {
	const { t } = useLocalization()
	const projectSession = useProjectSession()
	const controller = useApplicationRuntimeController()
	const preview = useSyncExternalStore(
		controller.previewCoordinator.subscribe,
		controller.previewCoordinator.getSnapshot,
		controller.previewCoordinator.getSnapshot
	)
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const current = projectSession.projections.transport.palette
	const [selected, setSelected] = useState<SongPalette>(current)
	const [octave, setOctave] = useState(2)
	const [rotation, setRotation] = useState(0)
	const [layout, setLayout] = useState<PerformanceLayout>('compact')
	const [chord, setChord] = useState<BeginnerChordSuggestion | null>(selected.chords[0] ?? null)
	const tonicMidi = (octave + 1) * 12 + selected.tonic

	useEffect(() => {
		return () => {
			controller.previewCoordinator.interrupt()
			controller.performanceInput.deactivate(ownerId)
		}
	}, [controller, ownerId])

	const startPalettePreview = (palette: SongPalette): void => {
		controller.previewCoordinator.start(
			'palette',
			palettePreviewProgram(palette, (octave + 1) * 12 + palette.tonic)
		)
	}
	const selectPalette = (palette: SongPalette): void => {
		controller.performanceInput.releaseAll()
		setSelected(palette)
		setRotation(0)
		setChord(palette.chords[0] ?? null)
		startPalettePreview(palette)
	}
	const auditionChord = (suggestion: BeginnerChordSuggestion): void => {
		setChord(suggestion)
		controller.previewCoordinator.start(
			'chord',
			chordPreviewProgram(selected, suggestion, tonicMidi)
		)
	}
	const applyPalette = (): void => {
		controller.previewCoordinator.interrupt()
		controller.performanceInput.releaseAll()
		const snapshot = projectSession.getSnapshot()
		projectSession.dispatch({
			type: 'transport.key.set',
			baseRevision: snapshot.revision,
			key: { tonic: selected.tonic, mode: selected.mode }
		})
		onApplied?.()
	}
	const activePreview = preview.active && (preview.kind === 'palette' || preview.kind === 'chord')
	return (
		<div className="song-palette-panel" data-variant={variant}>
			<aside className="song-palette-panel__catalog">
				<header>
					<strong>{t('songPalette.title')}</strong>
					<span>{t('songPalette.catalogHint')}</span>
				</header>
				<ScrollSurface className="song-palette-panel__list">
					{availableSongPalettes.map((palette) => (
						<button
							aria-current={
								palette.tonic === selected.tonic && palette.mode === selected.mode
									? 'true'
									: undefined
							}
							className="song-palette-panel__option"
							key={`${String(palette.tonic)}:${palette.mode}`}
							onClick={() => selectPalette(palette)}
							type="button"
						>
							<strong>{palette.name}</strong>
							<span>
								{t(
									palette.character === 'open'
										? 'songPalette.characterOpen'
										: 'songPalette.characterReflective'
								)}
							</span>
						</button>
					))}
				</ScrollSurface>
			</aside>
			<ScrollSurface className="song-palette-panel__detail">
				<header className="song-palette-panel__summary">
					<div>
						<span className="song-palette-panel__eyebrow">
							{t('songPalette.selected')}
						</span>
						<h2>{selected.name}</h2>
						<p>
							{t(
								selected.character === 'open'
									? 'songPalette.descriptionOpen'
									: 'songPalette.descriptionReflective',
								{ tonic: selected.tonicName }
							)}
						</p>
					</div>
					<button
						aria-pressed={preview.kind === 'palette' && preview.active}
						className="song-palette-panel__hear"
						disabled={!engine.available || engine.playing}
						onClick={() => {
							if (activePreview) controller.previewCoordinator.interrupt()
							else startPalettePreview(selected)
						}}
						type="button"
					>
						{activePreview ? (
							<Square aria-hidden="true" />
						) : (
							<Headphones aria-hidden="true" />
						)}
						{t(activePreview ? 'songPalette.stop' : 'songPalette.hear')}
					</button>
				</header>
				<PerformanceKeyboard
					chord={chord}
					layout={layout}
					octave={octave}
					onLayoutChange={setLayout}
					onOctaveChange={setOctave}
					onRotationChange={setRotation}
					ownerId={ownerId}
					palette={selected}
					rotation={rotation}
				/>
				<section
					className="song-palette-panel__chords"
					aria-label={t('songPalette.chords')}
				>
					{selected.chords.map((suggestion) => (
						<button
							aria-pressed={chord?.role === suggestion.role}
							className="song-palette-panel__chord"
							key={suggestion.role}
							onClick={() => auditionChord(suggestion)}
							type="button"
						>
							<strong>{t(`songPalette.chord.${suggestion.role}`)}</strong>
							<span>{suggestion.name}</span>
							<small>{suggestion.noteNames.join(' + ')}</small>
						</button>
					))}
				</section>
			</ScrollSurface>
			<footer className="song-palette-panel__footer">
				<div>
					<strong>{t('songPalette.keyboardChanges')}</strong>
					<span>
						{projectHasPitchedNotes(projectSession.snapshot.project)
							? t('songPalette.notesStay')
							: t('songPalette.changeLater')}
					</span>
				</div>
				{showApply ? (
					<button className="primary-action" onClick={applyPalette} type="button">
						{t('songPalette.use', { palette: selected.name })}
					</button>
				) : null}
			</footer>
		</div>
	)
}
