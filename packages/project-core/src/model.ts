export const projectCoreVersion = 2 as const
export const projectSchemaVersion = 2 as const
export const previousProjectSchemaVersion = 1 as const
export const legacyProjectSchemaVersion = 0 as const
export const engineModelVersion = 1 as const
export const patchModelVersion = 1 as const
export const macroMappingVersion = 1 as const
export const defaultTicksPerQuarter = 960 as const

export const projectLimits = Object.freeze({
	maxAssets: 256,
	maxClipsPerLayer: 512,
	maxDepth: 24,
	maxDrumEventsPerClip: 4096,
	maxIdLength: 128,
	maxLayers: 128,
	maxNameLength: 128,
	maxNodes: 200_000,
	maxNotesPerClip: 8192,
	maxObjectKeys: 64,
	maxSections: 256,
	maxTextLength: 512,
	maxTick: Number.MAX_SAFE_INTEGER - defaultTicksPerQuarter * 16
})

declare const projectIdBrand: unique symbol
declare const layerIdBrand: unique symbol
declare const clipIdBrand: unique symbol
declare const noteIdBrand: unique symbol
declare const drumEventIdBrand: unique symbol
declare const sectionIdBrand: unique symbol
declare const assetIdBrand: unique symbol
declare const projectTickBrand: unique symbol
declare const midiPitchBrand: unique symbol

export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' }
export type LayerId = string & { readonly [layerIdBrand]: 'LayerId' }
export type ClipId = string & { readonly [clipIdBrand]: 'ClipId' }
export type NoteId = string & { readonly [noteIdBrand]: 'NoteId' }
export type DrumEventId = string & { readonly [drumEventIdBrand]: 'DrumEventId' }
export type SectionId = string & { readonly [sectionIdBrand]: 'SectionId' }
export type AssetId = string & { readonly [assetIdBrand]: 'AssetId' }
export type ProjectTick = number & { readonly [projectTickBrand]: 'ProjectTick' }
export type MidiPitch = number & { readonly [midiPitchBrand]: 'MidiPitch' }

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

export function isOpaqueId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= projectLimits.maxIdLength &&
		opaqueIdPattern.test(value)
	)
}

function opaqueId<Value extends string>(name: string, value: string): Value {
	if (!isOpaqueId(value)) {
		throw new RangeError(
			`${name} must be 1-${String(projectLimits.maxIdLength)} characters using letters, digits, dot, underscore, colon or hyphen.`
		)
	}
	return value as Value
}

export function projectId(value: string): ProjectId {
	return opaqueId<ProjectId>('ProjectId', value)
}

export function layerId(value: string): LayerId {
	return opaqueId<LayerId>('LayerId', value)
}

export function clipId(value: string): ClipId {
	return opaqueId<ClipId>('ClipId', value)
}

export function noteId(value: string): NoteId {
	return opaqueId<NoteId>('NoteId', value)
}

export function drumEventId(value: string): DrumEventId {
	return opaqueId<DrumEventId>('DrumEventId', value)
}

export function sectionId(value: string): SectionId {
	return opaqueId<SectionId>('SectionId', value)
}

export function assetId(value: string): AssetId {
	return opaqueId<AssetId>('AssetId', value)
}

export function projectTick(value: number): ProjectTick {
	if (!Number.isSafeInteger(value) || value < 0 || value > projectLimits.maxTick) {
		throw new RangeError(
			`ProjectTick must be a non-negative safe integer at most ${String(projectLimits.maxTick)}.`
		)
	}
	return value as ProjectTick
}

export function midiPitch(value: number): MidiPitch {
	if (!Number.isInteger(value) || value < 0 || value > 127) {
		throw new RangeError('MidiPitch must be an integer from 0 to 127.')
	}
	return value as MidiPitch
}

export type ProjectRole = 'rhythm' | 'bass' | 'harmony' | 'melody' | 'custom' | 'reference'

export type KeyMode = 'major' | 'minor'
export type DrumInstrument = 'kick' | 'snare' | 'hat' | 'clap'
export type BassPresetId = 'bass.deep'
export type BassMacroId = 'brightness' | 'hardness' | 'dirt' | 'length' | 'width'

export interface ProjectKey {
	readonly mode: KeyMode
	readonly tonic: number
}

export interface TempoPoint {
	readonly bpm: number
	readonly tick: ProjectTick
}

export interface MeterPoint {
	readonly denominator: 1 | 2 | 4 | 8 | 16
	readonly numerator: number
	readonly tick: ProjectTick
}

export interface ProjectLoop {
	readonly enabled: boolean
	readonly endTick: ProjectTick
	readonly startTick: ProjectTick
}

export interface ProjectTransport {
	readonly key: ProjectKey
	readonly loop: ProjectLoop
	readonly meterMap: readonly MeterPoint[]
	readonly tempoMap: readonly TempoPoint[]
	readonly ticksPerQuarter: typeof defaultTicksPerQuarter
}

export interface SemanticBassMacrosV1 {
	readonly brightness: number
	readonly dirt: number
	readonly hardness: number
	readonly length: number
	readonly width: number
}

export interface ResolvedBassPatchV1 {
	readonly amplifier: {
		readonly attackMs: number
		readonly decayMs: number
		readonly releaseMs: number
		readonly sustain: number
	}
	readonly drive: number
	readonly filter: {
		readonly cutoffHz: number
		readonly envelopeAmount: number
		readonly resonance: number
	}
	readonly oscillator: {
		readonly detuneCents: number
		readonly subLevel: number
		readonly waveform: 'saw'
	}
	readonly outputGain: number
	readonly patchModelVersion: typeof patchModelVersion
	readonly stereoWidth: number
	readonly voice: 'subtractive-bass'
}

export interface BassInstrumentStateV1 {
	readonly family: 'bass'
	readonly macroMappingVersion: typeof macroMappingVersion
	readonly macros: SemanticBassMacrosV1
	readonly presetId: BassPresetId
	readonly presetRevision: number
	readonly resolvedPatch: ResolvedBassPatchV1
}

export interface LayerPerformanceMapping {
	readonly key: ProjectKey
	readonly octave: number
}

export interface SynthSource {
	readonly instrument: BassInstrumentStateV1
	readonly performance: LayerPerformanceMapping
	readonly type: 'synth'
}

export interface DrumSource {
	readonly kitId: 'drums.basic'
	readonly kitRevision: 1
	readonly patchModelVersion: typeof patchModelVersion
	readonly type: 'drum'
}

export interface ReferenceSource {
	readonly assetId: AssetId
	readonly type: 'reference'
}

export type LayerSource = SynthSource | DrumSource | ReferenceSource

export interface MidiNote {
	readonly durationTicks: ProjectTick
	readonly id: NoteId
	readonly pitch: MidiPitch
	readonly startTick: ProjectTick
	readonly velocity: number
}

export interface DrumEvent {
	readonly id: DrumEventId
	readonly instrument: DrumInstrument
	readonly step: number
	readonly velocity: number
}

interface ProjectClipBase {
	readonly id: ClipId
	readonly lengthTicks: ProjectTick
	readonly loop: boolean
	readonly sectionId: SectionId | null
	readonly startTick: ProjectTick
}

export interface MidiClip extends ProjectClipBase {
	readonly kind: 'midi'
	readonly notes: readonly MidiNote[]
}

export interface DrumClip extends ProjectClipBase {
	readonly events: readonly DrumEvent[]
	readonly kind: 'drum'
	readonly pattern: {
		readonly stepCount: number
		readonly stepsPerQuarter: 1 | 2 | 4 | 8
	}
}

export type ProjectClip = MidiClip | DrumClip

export interface ProjectLayer {
	readonly clips: readonly ProjectClip[]
	readonly exportIncluded: boolean
	readonly gain: number
	readonly id: LayerId
	readonly muted: boolean
	readonly name: string
	readonly pan: number
	readonly role: ProjectRole
	readonly solo: boolean
	readonly source: LayerSource
}

export interface ProjectSection {
	readonly id: SectionId
	readonly lengthTicks: ProjectTick
	readonly name: string
	readonly parentSectionId: SectionId | null
	readonly startTick: ProjectTick
}

export interface ProjectAssetReference {
	readonly byteLength: number
	readonly contentHash: string
	readonly id: AssetId
	readonly mediaType: string
}

export interface ProjectDocumentV2 {
	readonly assets: readonly ProjectAssetReference[]
	readonly engineModelVersion: typeof engineModelVersion
	readonly layers: readonly ProjectLayer[]
	readonly projectId: ProjectId
	readonly schemaVersion: typeof projectSchemaVersion
	readonly sections: readonly ProjectSection[]
	readonly title: string
	readonly transport: ProjectTransport
}

export type ProjectDocument = ProjectDocumentV2

type SynthSourceV1 = Omit<SynthSource, 'performance'>
type LayerSourceV1 = SynthSourceV1 | DrumSource | ReferenceSource
type ProjectLayerV1 = Omit<ProjectLayer, 'source'> & { readonly source: LayerSourceV1 }

export type ProjectDocumentV1 = Omit<ProjectDocumentV2, 'layers' | 'schemaVersion'> & {
	readonly layers: readonly ProjectLayerV1[]
	readonly schemaVersion: typeof previousProjectSchemaVersion
}

export interface LegacyProjectDocumentV0 {
	readonly key: ProjectKey
	readonly layers?: readonly ProjectLayer[]
	readonly projectId: string
	readonly schemaVersion: typeof legacyProjectSchemaVersion
	readonly tempo: number
	readonly title: string
}
