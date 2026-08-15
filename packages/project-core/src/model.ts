export const projectCoreVersion = 6 as const
export const projectSchemaVersion = 6 as const
export const engineModelVersion = 4 as const
export const patchModelVersion = 4 as const
export const macroMappingVersion = 4 as const
export const defaultTicksPerQuarter = 960 as const

export const projectLimits = Object.freeze({
	maxAssets: 256,
	maxSongInstances: 4096,
	maxDepth: 24,
	maxDrumEventsPerMaterial: 4096,
	maxIdLength: 128,
	maxLayers: 128,
	maxMaterialTick: defaultTicksPerQuarter * 4 * 4096,
	maxNameLength: 128,
	maxNodes: 200_000,
	maxNotesPerMaterial: 8192,
	maxObjectKeys: 64,
	maxSections: 256,
	maxTextLength: 512,
	maxTick: Number.MAX_SAFE_INTEGER - defaultTicksPerQuarter * 16
})

declare const projectIdBrand: unique symbol
declare const layerIdBrand: unique symbol
declare const songInstanceIdBrand: unique symbol
declare const noteIdBrand: unique symbol
declare const drumEventIdBrand: unique symbol
declare const sectionIdBrand: unique symbol
declare const assetIdBrand: unique symbol
declare const projectTickBrand: unique symbol
declare const midiPitchBrand: unique symbol

export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' }
export type LayerId = string & { readonly [layerIdBrand]: 'LayerId' }
export type SongInstanceId = string & { readonly [songInstanceIdBrand]: 'SongInstanceId' }
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

export function songInstanceId(value: string): SongInstanceId {
	return opaqueId<SongInstanceId>('SongInstanceId', value)
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
export type DrumInstrument = 'kick' | 'clap' | 'closedHat' | 'openHat' | 'perc'
export type SoundFamily = 'bass' | 'lead' | 'pad' | 'pluck' | 'texture'
export type BassPresetId =
	'bass.deep' | 'bass.punchy' | 'bass.warm' | 'bass.dirty' | 'bass.soft' | 'bass.retro'
export type LeadPresetId =
	| 'lead.glass'
	| 'lead.neon'
	| 'lead.velvet'
	| 'lead.hollow'
	| 'lead.razor'
	| 'lead.voice'
	| 'lead.solar'
export type PadPresetId = 'pad.soft' | 'pad.warm' | 'pad.air' | 'pad.motion' | 'pad.dust'
export type PluckPresetId = 'pluck.glass' | 'pluck.wood' | 'pluck.bell' | 'pluck.short'
export type TexturePresetId =
	'texture.grain' | 'texture.mist' | 'texture.pulse' | 'texture.dust' | 'texture.wire'
export type SynthPresetId =
	BassPresetId | LeadPresetId | PadPresetId | PluckPresetId | TexturePresetId
export type SynthMacroId = 'brightness' | 'hardness' | 'dirt' | 'length' | 'width'
export type BassMacroId = SynthMacroId
export type DrumKitId = 'drums.clean-pulse'
export type DrumPatternCharacter = 'straight' | 'sparse' | 'driving' | 'broken' | 'custom'
export type DrumVoiceVariantId =
	| 'kick.deep'
	| 'kick.tight'
	| 'kick.soft'
	| 'clap.clean'
	| 'clap.wide'
	| 'clap.dry'
	| 'closedHat.fine'
	| 'closedHat.dark'
	| 'closedHat.crisp'
	| 'openHat.air'
	| 'openHat.short'
	| 'openHat.bright'
	| 'perc.glass'
	| 'perc.wood'
	| 'perc.low'

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

export interface SemanticSynthMacros {
	readonly brightness: number
	readonly dirt: number
	readonly hardness: number
	readonly length: number
	readonly width: number
}

export type SynthWaveform = 'saw' | 'square' | 'triangle' | 'sine'

export interface ResolvedSynthPatch {
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
		readonly keyTracking: number
		readonly resonance: number
	}
	readonly expression: {
		readonly amplitudeAmount: number
		readonly attackScale: number
		readonly filterOctaves: number
		readonly velocityCurve: number
	}
	readonly movement: {
		readonly depth: number
		readonly rateHz: number
	}
	readonly oscillator: {
		readonly detuneCents: number
		readonly noiseLevel: number
		readonly pulseWidth: number
		readonly secondary: {
			readonly detuneCents: number
			readonly level: number
			readonly semitoneOffset: number
			readonly waveform: SynthWaveform
		}
		readonly subLevel: number
		readonly waveform: SynthWaveform
	}
	readonly outputGain: number
	readonly patchModelVersion: typeof patchModelVersion
	readonly stereoWidth: number
	readonly voice: 'subtractive-synth'
}

export interface SynthInstrumentState {
	readonly family: SoundFamily
	readonly macroMappingVersion: typeof macroMappingVersion
	readonly macros: SemanticSynthMacros
	readonly presetId: SynthPresetId
	readonly presetRevision: number
	readonly resolvedPatch: ResolvedSynthPatch
}

export interface LayerPerformanceMapping {
	readonly key: ProjectKey
	readonly octave: number
}

export interface SynthSource {
	readonly instrument: SynthInstrumentState
	readonly performance: LayerPerformanceMapping
	readonly type: 'synth'
}

export interface ResolvedDrumVoicePatch {
	readonly algorithm: 'kick' | 'clap' | 'closed-hat' | 'open-hat' | 'perc'
	readonly decayMs: number
	readonly drive: number
	readonly gain: number
	readonly noise: number
	readonly pitchHz: number
	readonly tone: number
	readonly variantId: DrumVoiceVariantId
}

export interface ResolvedDrumKitPatch {
	readonly patchModelVersion: typeof patchModelVersion
	readonly voices: Readonly<Record<DrumInstrument, ResolvedDrumVoicePatch>>
}

export interface DrumSource {
	readonly kitId: DrumKitId
	readonly kitRevision: 1
	readonly resolvedPatch: ResolvedDrumKitPatch
	readonly voiceVariants: Readonly<Record<DrumInstrument, DrumVoiceVariantId>>
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

interface SourceMaterialBase {
	readonly materialLengthTicks: ProjectTick
	readonly tailRestTicks: ProjectTick
}

export interface MidiMaterial extends SourceMaterialBase {
	readonly kind: 'midi'
	readonly notes: readonly MidiNote[]
}

export interface DrumMaterial extends SourceMaterialBase {
	readonly character: DrumPatternCharacter
	readonly density: number
	readonly events: readonly DrumEvent[]
	readonly kind: 'drum'
	readonly pattern: {
		readonly stepCount: number
		readonly stepsPerQuarter: 1 | 2 | 4 | 8
	}
	readonly swing: number
}

export interface ReferenceMaterial extends SourceMaterialBase {
	readonly kind: 'reference'
}

export type LayerMaterial = MidiMaterial | DrumMaterial | ReferenceMaterial

export interface SongInstance {
	readonly durationTicks: ProjectTick
	readonly id: SongInstanceId
	readonly sourceLayerId: LayerId
	readonly sourceOffsetTicks: ProjectTick
	readonly startTick: ProjectTick
}

export interface ProjectSong {
	readonly instances: readonly SongInstance[]
}

export interface ProjectLayer {
	readonly exportIncluded: boolean
	readonly gain: number
	readonly id: LayerId
	readonly material: LayerMaterial
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

export interface ProjectDocument {
	readonly assets: readonly ProjectAssetReference[]
	readonly engineModelVersion: typeof engineModelVersion
	readonly layers: readonly ProjectLayer[]
	readonly projectId: ProjectId
	readonly schemaVersion: typeof projectSchemaVersion
	readonly sections: readonly ProjectSection[]
	readonly song: ProjectSong
	readonly title: string
	readonly transport: ProjectTransport
}
