import { Plus } from 'lucide-react'
import { useState, type JSX } from 'react'
import { TextButton } from '../../../../design-system/src/index.js'
import { useLocalization } from '../../../../localization/src/index.js'
import { pianoRollViewModel, type PianoRollViewModel } from './view-model.js'

export interface PianoRollViewProperties {
	readonly model?: PianoRollViewModel
}

export function PianoRollView({
	model = pianoRollViewModel
}: PianoRollViewProperties): JSX.Element {
	const { t } = useLocalization()
	const [notes, setNotes] = useState(model.notes)
	const addNote = (): void => {
		const noteNumber = notes.length + 1
		setNotes((current) => [
			...current,
			Object.freeze({
				id: `n${String(noteNumber)}`,
				pitch: 'C5',
				row: 0,
				beat: (noteNumber * 2) % 15,
				duration: 1
			})
		])
	}

	return (
		<section className="studio-view editor-view" data-testid="view-piano-roll">
			<header className="editor-view__heading">
				<div>
					<p className="studio-eyebrow">{t('pianoRoll.subtitle')}</p>
					<h1>{t('pianoRoll.title')}</h1>
				</div>
				<TextButton icon={<Plus />} onClick={addNote}>
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
					{notes.map((note) => (
						<button
							aria-label={`${note.pitch}, beat ${String(note.beat + 1)}`}
							className="piano-roll__note"
							key={note.id}
							onClick={() =>
								setNotes((current) => current.filter(({ id }) => id !== note.id))
							}
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
			<p className="studio-hint">
				Enter adds a note · Select a note and press Delete to remove it
			</p>
		</section>
	)
}
