import { cloneAndFreeze } from './immutable.js'
import {
	assetId,
	clipId,
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
	type AssetId,
	type ClipId,
	type DrumClip,
	type DrumEvent,
	type LayerId,
	type MidiClip,
	type MidiNote,
	type ProjectAssetReference,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectLayer,
	type ProjectRole,
	type ProjectSection,
	type SectionId
} from './model.js'
import { createDeepBassInstrument } from './presets.js'

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
		layers: [],
		assets: []
	})
}

export interface CreateLayerInput {
	readonly assetId?: AssetId
	readonly id: LayerId | string
	readonly name: string
	readonly role: ProjectRole
}

export function createLayer(input: CreateLayerInput): ProjectLayer {
	const id = typeof input.id === 'string' ? layerId(input.id) : input.id
	if (input.role === 'reference' && input.assetId === undefined) {
		throw new TypeError('A reference layer requires an asset ID.')
	}
	const source =
		input.role === 'rhythm'
			? ({
					type: 'drum',
					kitId: 'drums.basic',
					kitRevision: 1,
					patchModelVersion: 1
				} as const)
			: input.role === 'reference'
				? ({ type: 'reference', assetId: input.assetId as AssetId } as const)
				: ({
						type: 'synth',
						instrument: createDeepBassInstrument(),
						performance: { key: { tonic: 9, mode: 'minor' }, octave: 2 }
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
		clips: []
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

export interface CreateMidiClipInput {
	readonly id: ClipId | string
	readonly lengthTicks: number
	readonly loop?: boolean
	readonly notes?: readonly MidiNote[]
	readonly sectionId?: SectionId | null
	readonly startTick: number
}

export function createMidiClip(input: CreateMidiClipInput): MidiClip {
	return cloneAndFreeze({
		kind: 'midi',
		id: typeof input.id === 'string' ? clipId(input.id) : input.id,
		startTick: projectTick(input.startTick),
		lengthTicks: projectTick(input.lengthTicks),
		sectionId: input.sectionId ?? null,
		loop: input.loop ?? true,
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

export interface CreateDrumClipInput {
	readonly events?: readonly DrumEvent[]
	readonly id: ClipId | string
	readonly lengthTicks: number
	readonly loop?: boolean
	readonly sectionId?: SectionId | null
	readonly startTick: number
	readonly stepCount?: number
	readonly stepsPerQuarter?: 1 | 2 | 4 | 8
}

export function createDrumClip(input: CreateDrumClipInput): DrumClip {
	return cloneAndFreeze({
		kind: 'drum',
		id: typeof input.id === 'string' ? clipId(input.id) : input.id,
		startTick: projectTick(input.startTick),
		lengthTicks: projectTick(input.lengthTicks),
		sectionId: input.sectionId ?? null,
		loop: input.loop ?? true,
		pattern: {
			stepCount: input.stepCount ?? 16,
			stepsPerQuarter: input.stepsPerQuarter ?? 4
		},
		events: input.events ?? []
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
