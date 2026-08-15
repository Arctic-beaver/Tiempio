import {
	assertValidProject,
	createDrumMaterial,
	createDrumEvent,
	createLayer,
	createMidiMaterial,
	createMidiNote,
	createProject,
	createSection,
	createSongInstance,
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

function tonalLayer(id: string, name: string, role: 'bass' | 'harmony' | 'melody'): ProjectLayer {
	const layer = createLayer({ id, name, role })
	return {
		...layer,
		material: createMidiMaterial({
			materialLengthTicks: barTicks,
			notes: [
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
		})
	}
}

function drumLayer(): ProjectLayer {
	const layer = createLayer({ id: 'layer.drums', name: 'Soft drums', role: 'rhythm' })
	return {
		...layer,
		material: createDrumMaterial({
			materialLengthTicks: barTicks,
			events: [
				createDrumEvent({
					id: 'event.drums.kick-one',
					instrument: 'kick',
					step: 0
				}),
				createDrumEvent({
					id: 'event.drums.kick-two',
					instrument: 'kick',
					step: 8
				}),
				createDrumEvent({
					id: 'event.drums.snare',
					instrument: 'clap',
					step: 4
				}),
				createDrumEvent({
					id: 'event.drums.hat',
					instrument: 'closedHat',
					step: 2
				})
			]
		})
	}
}

function instancesFor(
	layer: ProjectLayer,
	sections: readonly ProjectSection[]
): ReturnType<typeof createSongInstance>[] {
	return sections.map((projectSection) =>
		createSongInstance({
			id: `instance.${layer.id}.${projectSection.id}`,
			sourceLayerId: layer.id,
			startTick: projectSection.startTick,
			durationTicks: projectSection.lengthTicks
		})
	)
}

export function createSeedProject(): ProjectDocument {
	const project = createProject({ projectId: 'project.velvet-morning', title: 'Velvet Morning' })
	const intro = section('section.intro', 'Intro', 0, 8)
	const main = section('section.main', 'Main', 8, 16)
	const breakSection = section('section.break', 'Break', 24, 8)
	const outro = section('section.outro', 'Outro', 32, 8)
	const melody = tonalLayer('layer.melody', 'Glass melody', 'melody')
	const chords = tonalLayer('layer.chords', 'Warm chords', 'harmony')
	const bass = tonalLayer('layer.bass', 'Low pulse', 'bass')
	const drums = drumLayer()
	return assertValidProject({
		...project,
		sections: [intro, main, breakSection, outro],
		layers: [melody, chords, bass, drums],
		song: {
			instances: [
				...instancesFor(melody, [main, breakSection]),
				...instancesFor(chords, [intro, main, breakSection, outro]),
				...instancesFor(bass, [main, outro]),
				...instancesFor(drums, [intro, main, outro])
			]
		}
	})
}
