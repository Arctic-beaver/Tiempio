import {
	assertValidProject,
	createDrumClip,
	createDrumEvent,
	createLayer,
	createMidiClip,
	createMidiNote,
	createProject,
	createSection,
	defaultTicksPerQuarter,
	type ProjectDocument,
	type ProjectLayer,
	type ProjectSection
} from '../../../project-core/src/index.js'

const barTicks = defaultTicksPerQuarter * 4

function section(id: string, name: string, startBar: number, barCount: number): ProjectSection {
	return createSection({
		id,
		name,
		startTick: startBar * barTicks,
		lengthTicks: barCount * barTicks
	})
}

function tonalLayer(
	id: string,
	name: string,
	role: 'bass' | 'harmony' | 'melody',
	sections: readonly ProjectSection[]
): ProjectLayer {
	const layer = createLayer({ id, name, role })
	return {
		...layer,
		clips: sections.map((projectSection, index) =>
			createMidiClip({
				id: `clip.${id}.${projectSection.id}`,
				startTick: projectSection.startTick,
				lengthTicks: projectSection.lengthTicks,
				sectionId: projectSection.id,
				notes:
					index === 0
						? [
								createMidiNote({
									id: `note.${id}.one`,
									pitch: role === 'bass' ? 36 : 60,
									startTick: 0,
									durationTicks: defaultTicksPerQuarter * 2
								}),
								createMidiNote({
									id: `note.${id}.two`,
									pitch: role === 'bass' ? 40 : 64,
									startTick: defaultTicksPerQuarter * 2,
									durationTicks: defaultTicksPerQuarter
								})
							]
						: []
			})
		)
	}
}

function drumLayer(sections: readonly ProjectSection[]): ProjectLayer {
	const layer = createLayer({ id: 'layer.drums', name: 'Soft drums', role: 'rhythm' })
	return {
		...layer,
		clips: sections.map((projectSection, sectionIndex) =>
			createDrumClip({
				id: `clip.drums.${projectSection.id}`,
				startTick: projectSection.startTick,
				lengthTicks: projectSection.lengthTicks,
				sectionId: projectSection.id,
				events: [
					createDrumEvent({
						id: `event.drums.${String(sectionIndex)}.kick-one`,
						instrument: 'kick',
						step: 0
					}),
					createDrumEvent({
						id: `event.drums.${String(sectionIndex)}.kick-two`,
						instrument: 'kick',
						step: 8
					}),
					createDrumEvent({
						id: `event.drums.${String(sectionIndex)}.snare`,
						instrument: 'snare',
						step: 4
					}),
					createDrumEvent({
						id: `event.drums.${String(sectionIndex)}.hat`,
						instrument: 'hat',
						step: 2
					})
				]
			})
		)
	}
}

export function createSeedProject(): ProjectDocument {
	const project = createProject({ projectId: 'project.velvet-morning', title: 'Velvet Morning' })
	const intro = section('section.intro', 'Intro', 0, 8)
	const main = section('section.main', 'Main', 8, 16)
	const breakSection = section('section.break', 'Break', 24, 8)
	const outro = section('section.outro', 'Outro', 32, 8)
	return assertValidProject({
		...project,
		sections: [intro, main, breakSection, outro],
		layers: [
			tonalLayer('layer.melody', 'Glass melody', 'melody', [main, breakSection]),
			tonalLayer('layer.chords', 'Warm chords', 'harmony', [
				intro,
				main,
				breakSection,
				outro
			]),
			tonalLayer('layer.bass', 'Low pulse', 'bass', [main, outro]),
			drumLayer([intro, main, outro])
		]
	})
}
