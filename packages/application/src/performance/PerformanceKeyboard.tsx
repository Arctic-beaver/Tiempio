import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Keyboard } from 'lucide-react'
import { useMemo, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react'
import { IconButton } from '../../../design-system/src/index.js'
import { useLocalization } from '../../../localization/src/index.js'
import {
	performanceMapping,
	type PerformanceLayout,
	type PerformanceRow,
	type SongPalette,
	type BeginnerChordSuggestion
} from '../../../music-theory/src/index.js'
import { useApplicationRuntimeController } from '../runtime/ApplicationRuntimeControllerContext.js'
import { PerformanceKeyControl } from './PerformanceKeyControl.js'
import { usePerformanceInputSurface } from './usePerformanceInputSurface.js'

export interface PerformanceKeyboardProperties {
	readonly chord?: BeginnerChordSuggestion | null
	readonly layout: PerformanceLayout
	readonly octave: number
	readonly onLayoutChange?: (layout: PerformanceLayout) => void
	readonly onOctaveChange?: (octave: number) => void
	readonly onRotationChange?: (rotation: number) => void
	readonly ownerId: string
	readonly palette: SongPalette
	readonly presentation?: 'panel' | 'strip'
	readonly rotation: number
}

const fullRows = Object.freeze<readonly PerformanceRow[]>(['upper', 'home', 'lower'])

export function PerformanceKeyboard({
	chord = null,
	layout,
	octave,
	onLayoutChange,
	onOctaveChange,
	onRotationChange,
	ownerId,
	palette,
	presentation = 'panel',
	rotation
}: PerformanceKeyboardProperties): JSX.Element {
	const { t } = useLocalization()
	const controller = useApplicationRuntimeController()
	const preview = useSyncExternalStore(
		controller.previewCoordinator.subscribe,
		controller.previewCoordinator.getSnapshot,
		controller.previewCoordinator.getSnapshot
	)
	const mapping = useMemo(
		() =>
			performanceMapping(palette, {
				layout,
				rotation,
				tonicMidi: (octave + 1) * 12 + palette.tonic
			}),
		[layout, octave, palette, rotation]
	)
	const surface = usePerformanceInputSurface(ownerId, mapping)
	const chordDegrees = new Set(chord?.degreeIndices ?? [])
	const changeOctave = (next: number): void => {
		if (onOctaveChange === undefined) return
		controller.performanceInput.releaseAll()
		onOctaveChange(next)
	}
	const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
		if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
			if (onOctaveChange !== undefined && event.code === 'ArrowUp' && octave < 6) {
				event.preventDefault()
				changeOctave(octave + 1)
				return
			}
			if (onOctaveChange !== undefined && event.code === 'ArrowDown' && octave > 1) {
				event.preventDefault()
				changeOctave(octave - 1)
				return
			}
		}
		surface.onKeyDown(event)
	}
	const renderRow = (row: PerformanceRow): JSX.Element => (
		<div className="performance-keyboard__row" data-row={row} key={row}>
			{mapping
				.filter((key) => key.row === row)
				.map((key) => (
					<PerformanceKeyControl
						chordTone={chordDegrees.has(key.degreeIndex)}
						key={key.code}
						keyMapping={key}
						ownerId={ownerId}
						previewHeld={preview.pitches.includes(key.midi)}
					/>
				))}
		</div>
	)
	return (
		<section
			{...surface}
			aria-label={t('songPalette.keyboard')}
			className={`performance-keyboard performance-keyboard--${presentation}`}
			data-layout={layout}
			data-presentation={presentation}
			onKeyDown={handleKeyDown}
		>
			{presentation === 'panel' ? (
				<header className="performance-keyboard__toolbar">
					{onRotationChange === undefined ? null : (
						<div className="performance-keyboard__rotation">
							<IconButton
								icon={<ChevronLeft />}
								label={t('songPalette.rotateLeft')}
								onClick={() => {
									controller.performanceInput.releaseAll()
									onRotationChange((rotation + 6) % 7)
								}}
								size="small"
							/>
							<span>{t('songPalette.rotate')}</span>
							<IconButton
								icon={<ChevronRight />}
								label={t('songPalette.rotateRight')}
								onClick={() => {
									controller.performanceInput.releaseAll()
									onRotationChange((rotation + 1) % 7)
								}}
								size="small"
							/>
						</div>
					)}
					{onOctaveChange === undefined ? null : (
						<div className="performance-keyboard__octave">
							<IconButton
								disabled={octave <= 1}
								icon={<ChevronDown />}
								label={t('songPalette.octaveDown')}
								onClick={() => changeOctave(octave - 1)}
								size="small"
							/>
							<strong>{t('songPalette.octave', { octave })}</strong>
							<IconButton
								disabled={octave >= 6}
								icon={<ChevronUp />}
								label={t('songPalette.octaveUp')}
								onClick={() => changeOctave(octave + 1)}
								size="small"
							/>
						</div>
					)}
					{onLayoutChange === undefined ? null : (
						<button
							aria-pressed={layout === 'full'}
							className="performance-keyboard__layout"
							onClick={() =>
								onLayoutChange(layout === 'compact' ? 'full' : 'compact')
							}
							type="button"
						>
							<Keyboard aria-hidden="true" />
							{t('songPalette.fullKeyboard')}
						</button>
					)}
				</header>
			) : null}
			<div className="performance-keyboard__keys">
				{layout === 'compact' ? renderRow('compact') : fullRows.map(renderRow)}
			</div>
			{presentation === 'panel' ? (
				<div className="performance-keyboard__legend">
					<span data-role="tonic">{t('songPalette.homeNote')}</span>
					<span data-role="chord">{t('songPalette.chordTone')}</span>
					<span data-role="palette">{t('songPalette.otherNote')}</span>
				</div>
			) : null}
		</section>
	)
}
