import { Plus } from 'lucide-react'
import type { JSX } from 'react'
import { TextButton } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import type { PianoRollViewModel } from './view-model.js'

export interface PianoRollViewProperties {
	readonly model: PianoRollViewModel
	readonly onAddNote: () => void
	readonly onDeleteNote: (noteId: string) => void
}

export function PianoRollView({
	model,
	onAddNote,
	onDeleteNote
}: PianoRollViewProperties): JSX.Element {
	const { t } = useLocalization()

	return (
		<section className="studio-view editor-view" data-testid="view-piano-roll">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('pianoRoll.subtitle')}</p>
					<h1>{t('pianoRoll.title')}</h1>
				</div>
				<TextButton icon={<Plus />} onClick={onAddNote}>
					{t('pianoRoll.addNote')}
				</TextButton>
			</header>
			<div className="piano-roll" role="group" aria-label={t('pianoRoll.title')}>
				<div className="piano-roll__keys" aria-hidden="true">
					{model.pitches.map((pitch) => (
						<span key={pitch}>{pitch}</span>
					))}
				</div>
				<div className="piano-roll__grid">
					<div aria-hidden="true" className="piano-roll__playhead" />
					{model.notes.map((note) => (
						<button
							aria-label={t('pianoRoll.noteAtBeat', {
								pitch: note.pitch,
								beat: note.beat + 1
							})}
							className="piano-roll__note"
							key={note.id}
							onClick={() => onDeleteNote(note.id)}
							style={
								{
									'--note-beat': note.beat,
									'--note-duration': note.duration,
									'--note-row': note.row
								} as React.CSSProperties
							}
							type="button"
						/>
					))}
				</div>
			</div>
			<p className="studio-hint">{t('pianoRoll.hint')}</p>
		</section>
	)
}
