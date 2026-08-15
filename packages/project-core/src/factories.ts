import { cloneAndFreeze } from './immutable.js'
import {
	assetId,
	defaultTicksPerQuarter,
	drumEventId,
	engineModelVersion,
	layerId,
	midiPitch,
	noteId,
	projectId,
	projectSchemaVersion,
	projectTick,
	sectionId,
	songInstanceId,
	type AssetId,
	type DrumMaterial,
	type DrumEvent,
	type LayerId,
	type MidiMaterial,
	type MidiNote,
	type ProjectAssetReference,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectLayer,
	type ProjectRole,
	type ProjectSection,
	type SongInstance,
	type SongInstanceId,
	type SectionId,
	type SemanticSynthMacros,
	type LayerPerformanceMapping,
	type SynthPresetId
} from './model.js'
import { createCleanPulseDrumSource, createSynthInstrument } from './presets.js'

export interface CreateProjectInput {
	readonly projectId: ProjectId | string
	readonly title: string
}

export function createProject(input: CreateProjectInput): ProjectDocument {
	return cloneAndFreeze({
		schemaVersion: projectSchemaVersion,
		engineModelVersion,
		projectId:
			typeof input.projectId === 'string' ? projectId(input.projectId) : input.projectId,
		title: input.title,
		transport: {
			ticksPerQuarter: defaultTicksPerQuarter,
			tempoMap: [{ tick: projectTick(0), bpm: 108 }],
			meterMap: [{ tick: projectTick(0), numerator: 4, denominator: 4 }],
			key: { tonic: 9, mode: 'minor' },
			loop: {
				enabled: true,
				startTick: projectTick(0),
				endTick: projectTick(defaultTicksPerQuarter * 16)
			}
		},
		sections: [],
		song: { instances: [] },
		layers: [],
		assets: []
	})
}

export interface CreateLayerInput {
	readonly assetId?: AssetId
	readonly id: LayerId | string
	readonly name: string
	readonly presetId?: SynthPresetId
	readonly role: ProjectRole
	readonly synth?: {
		readonly macros: SemanticSynthMacros
		readonly performance: LayerPerformanceMapping
		readonly presetId: SynthPresetId
	}
}

export function createLayer(input: CreateLayerInput): ProjectLayer {
	const id = typeof input.id === 'string' ? layerId(input.id) : input.id
	if (input.role === 'reference' && input.assetId === undefined) {
		throw new TypeError('A reference layer requires an asset ID.')
	}
	const source =
		input.role === 'rhythm'
			? createCleanPulseDrumSource()
			: input.role === 'reference'
				? ({ type: 'reference', assetId: input.assetId as AssetId } as const)
				: ({
						type: 'synth',
						instrument: createSynthInstrument(
							input.synth?.presetId ??
								input.presetId ??
								(input.role === 'harmony'
									? 'pad.warm'
									: input.role === 'melody'
										? 'lead.glass'
										: 'bass.deep'),
							input.synth?.macros
						),
						performance: input.synth?.performance ?? {
							key: { tonic: 9, mode: 'minor' },
							octave: 2
						}
					} as const)
	return cloneAndFreeze({
		id,
		role: input.role,
		name: input.name,
		gain: 1,
		pan: 0,
		muted: false,
		solo: false,
		exportIncluded: input.role !== 'reference',
		source,
		material:
			input.role === 'rhythm'
				? createDrumMaterial({ materialLengthTicks: 0 })
				: input.role === 'reference'
					? {
							kind: 'reference' as const,
							materialLengthTicks: projectTick(0),
							tailRestTicks: projectTick(0)
						}
					: createMidiMaterial({ materialLengthTicks: 0 })
	})
}

export interface CreateSectionInput {
	readonly id: SectionId | string
	readonly lengthTicks: number
	readonly name: string
	readonly parentSectionId?: SectionId | null
	readonly startTick: number
}

export function createSection(input: CreateSectionInput): ProjectSection {
	return cloneAndFreeze({
		id: typeof input.id === 'string' ? sectionId(input.id) : input.id,
		name: input.name,
		startTick: projectTick(input.startTick),
		lengthTicks: projectTick(input.lengthTicks),
		parentSectionId: input.parentSectionId ?? null
	})
}

export interface CreateMidiNoteInput {
	readonly durationTicks: number
	readonly id: string
	readonly pitch: number
	readonly startTick: number
	readonly velocity?: number
}

export function createMidiNote(input: CreateMidiNoteInput): MidiNote {
	return cloneAndFreeze({
		id: noteId(input.id),
		pitch: midiPitch(input.pitch),
		startTick: projectTick(input.startTick),
		durationTicks: projectTick(input.durationTicks),
		velocity: input.velocity ?? 96
	})
}

export interface CreateMidiMaterialInput {
	readonly materialLengthTicks: number
	readonly notes?: readonly MidiNote[]
	readonly tailRestTicks?: number
}

export function createMidiMaterial(input: CreateMidiMaterialInput): MidiMaterial {
	return cloneAndFreeze({
		kind: 'midi',
		materialLengthTicks: projectTick(input.materialLengthTicks),
		tailRestTicks: projectTick(input.tailRestTicks ?? 0),
		notes: input.notes ?? []
	})
}

export interface CreateDrumEventInput {
	readonly id: string
	readonly instrument: DrumEvent['instrument']
	readonly step: number
	readonly velocity?: number
}

export function createDrumEvent(input: CreateDrumEventInput): DrumEvent {
	return cloneAndFreeze({
		id: drumEventId(input.id),
		instrument: input.instrument,
		step: input.step,
		velocity: input.velocity ?? 112
	})
}

export interface CreateDrumMaterialInput {
	readonly character?: DrumMaterial['character']
	readonly density?: number
	readonly events?: readonly DrumEvent[]
	readonly materialLengthTicks: number
	readonly stepCount?: number
	readonly stepsPerQuarter?: 1 | 2 | 4 | 8
	readonly swing?: number
	readonly tailRestTicks?: number
}

export function createDrumMaterial(input: CreateDrumMaterialInput): DrumMaterial {
	return cloneAndFreeze({
		kind: 'drum',
		materialLengthTicks: projectTick(input.materialLengthTicks),
		tailRestTicks: projectTick(input.tailRestTicks ?? 0),
		character: input.character ?? 'custom',
		density: input.density ?? 0.38,
		swing: input.swing ?? 0.08,
		pattern: {
			stepCount: input.stepCount ?? 16,
			stepsPerQuarter: input.stepsPerQuarter ?? 4
		},
		events: input.events ?? []
	})
}

export interface CreateSongInstanceInput {
	readonly durationTicks: number
	readonly id: SongInstanceId | string
	readonly sourceLayerId: LayerId
	readonly sourceOffsetTicks?: number
	readonly startTick: number
}

export function createSongInstance(input: CreateSongInstanceInput): SongInstance {
	return cloneAndFreeze({
		id: typeof input.id === 'string' ? songInstanceId(input.id) : input.id,
		sourceLayerId: input.sourceLayerId,
		startTick: projectTick(input.startTick),
		durationTicks: projectTick(input.durationTicks),
		sourceOffsetTicks: projectTick(input.sourceOffsetTicks ?? 0)
	})
}

export interface CreateAssetReferenceInput {
	readonly byteLength: number
	readonly contentHash: string
	readonly id: AssetId | string
	readonly mediaType: string
}

export function createAssetReference(input: CreateAssetReferenceInput): ProjectAssetReference {
	return cloneAndFreeze({
		id: typeof input.id === 'string' ? assetId(input.id) : input.id,
		contentHash: input.contentHash,
		mediaType: input.mediaType,
		byteLength: input.byteLength
	})
}

export function projectKey(tonic: number, mode: ProjectKey['mode']): ProjectKey {
	return cloneAndFreeze({ tonic, mode })
}
