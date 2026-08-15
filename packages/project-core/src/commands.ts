import { createSynthInstrument, updateDrumVoiceVariant, updateSynthMacro } from './presets.js'
import { createLayer, createProject } from './factories.js'
import {
	drumEventId,
	midiPitch,
	projectLimits,
	projectTick,
	type AssetId,
	type DrumEvent,
	type DrumInstrument,
	type DrumPatternCharacter,
	type DrumVoiceVariantId,
	type LayerId,
	type LayerPerformanceMapping,
	type MidiNote,
	type NoteId,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectLayer,
	type ProjectRole,
	type ProjectSection,
	type SongInstance,
	type SongInstanceId,
	type SemanticSynthMacros,
	type SynthInstrumentState,
	type SynthMacroId,
	type SynthPresetId
} from './model.js'
import { validateProjectDocument } from './validation.js'

export type ProjectCommandFailureCode =
	| 'DUPLICATE_ID'
	| 'INCOMPATIBLE_TARGET'
	| 'INVALID_COMMAND'
	| 'INVALID_RESULT'
	| 'NOT_FOUND'
	| 'STALE_REVISION'

export interface ProjectCommandFailure {
	readonly code: ProjectCommandFailureCode
	readonly message: string
}

interface RevisionedProjectCommand {
	readonly baseRevision: number
}

export interface CreateProjectCommand {
	readonly projectId: ProjectId | string
	readonly title: string
	readonly type: 'project.create'
}

export interface AddLayerCommand extends RevisionedProjectCommand {
	readonly assetId?: AssetId
	readonly id: LayerId | string
	readonly name: string
	readonly role: ProjectRole
	readonly synth?: {
		readonly macros: SemanticSynthMacros
		readonly performance: LayerPerformanceMapping
		readonly presetId: SynthPresetId
	}
	readonly type: 'layer.add'
}

export interface SelectCharacterCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly presetId: SynthPresetId
	readonly type: 'layer.character.select'
}

export interface ConfigureLayerSoundCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly performance: LayerPerformanceMapping
	readonly presetId: SynthPresetId
	readonly type: 'layer.sound.configure'
}

export interface SetLayerPerformanceCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly performance: LayerPerformanceMapping
	readonly type: 'layer.performance.set'
}

export interface CommitMacroCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly macro: SynthMacroId
	readonly type: 'layer.macro.commit'
	readonly value: number
}

export interface AddNoteCommand extends RevisionedProjectCommand {
	readonly instanceWhenMissing?: SongInstance
	readonly layerId: LayerId
	readonly note: MidiNote
	readonly type: 'note.add'
}

export interface UpdateNoteCommand extends RevisionedProjectCommand {
	readonly durationTicks: number
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'note.update'
	readonly velocity: number
}

export interface MoveNoteCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'note.move'
}

export interface ResizeNoteCommand extends RevisionedProjectCommand {
	readonly durationTicks: number
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly type: 'note.resize'
}

export interface DeleteNoteCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly type: 'note.delete'
}

export interface TransposeOctaveCommand extends RevisionedProjectCommand {
	readonly direction: -1 | 1
	readonly layerId: LayerId
	readonly type: 'material.transpose-octave'
}

export interface BeginSourceNoteCommand extends RevisionedProjectCommand {
	readonly instanceWhenMissing?: SongInstance
	readonly layerId: LayerId
	readonly note: MidiNote
	readonly type: 'source.note.begin'
}

export interface FinalizeSourceNoteCommand extends RevisionedProjectCommand {
	readonly endTick: number
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly type: 'source.note.finalize'
}

export interface ExtendSourceMaterialCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly throughTick: number
	readonly type: 'source.material.extend'
}

export interface SetLayerMuteCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly muted: boolean
	readonly type: 'layer.mute.set'
}

export interface SetLayerSoloCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly solo: boolean
	readonly type: 'layer.solo.set'
}

export interface SetLayerGainCommand extends RevisionedProjectCommand {
	readonly gain: number
	readonly layerId: LayerId
	readonly type: 'layer.gain.set'
}

export interface SetTempoCommand extends RevisionedProjectCommand {
	readonly bpm: number
	readonly type: 'transport.tempo.set'
}

export interface SetKeyCommand extends RevisionedProjectCommand {
	readonly key: ProjectKey
	readonly type: 'transport.key.set'
}

export interface SetLoopCommand extends RevisionedProjectCommand {
	readonly enabled: boolean
	readonly endTick: number
	readonly startTick: number
	readonly type: 'transport.loop.set'
}

export interface AddSectionCommand extends RevisionedProjectCommand {
	readonly section: ProjectSection
	readonly type: 'section.add'
}

export interface PlaceSongInstanceCommand extends RevisionedProjectCommand {
	readonly instance: SongInstance
	readonly type: 'song-instance.place'
}

export interface DeleteSongInstanceCommand extends RevisionedProjectCommand {
	readonly instanceId: SongInstanceId
	readonly type: 'song-instance.delete'
}

export interface MoveSongInstanceCommand extends RevisionedProjectCommand {
	readonly instanceId: SongInstanceId
	readonly startTick: number
	readonly type: 'song-instance.move'
}

export interface ResizeSongInstanceCommand extends RevisionedProjectCommand {
	readonly durationTicks: number
	readonly instanceId: SongInstanceId
	readonly type: 'song-instance.resize'
}

export interface TrimLeftSongInstanceCommand extends RevisionedProjectCommand {
	readonly durationTicks: number
	readonly instanceId: SongInstanceId
	readonly sourceOffsetTicks: number
	readonly startTick: number
	readonly type: 'song-instance.trim-left'
}

export interface SplitSongInstanceCommand extends RevisionedProjectCommand {
	readonly instanceId: SongInstanceId
	readonly rightInstanceId: SongInstanceId
	readonly splitOffsetTicks: number
	readonly type: 'song-instance.split'
}

export interface DuplicateLayerAsVariationCommand extends RevisionedProjectCommand {
	readonly instance: SongInstance
	readonly layer: ProjectLayer
	readonly sourceLayerId: LayerId
	readonly type: 'layer.duplicate-as-variation'
}

export interface ToggleDrumEventCommand extends RevisionedProjectCommand {
	readonly eventWhenAdded: DrumEvent
	readonly layerId: LayerId
	readonly type: 'drum-event.toggle'
}

export interface SelectDrumVoiceCommand extends RevisionedProjectCommand {
	readonly instrument: DrumInstrument
	readonly layerId: LayerId
	readonly type: 'drum.voice.select'
	readonly variantId: DrumVoiceVariantId
}

export interface SetDrumPatternCommand extends RevisionedProjectCommand {
	readonly character: Exclude<DrumPatternCharacter, 'custom'>
	readonly layerId: LayerId
	readonly type: 'drum.pattern.set'
}

export interface SetDrumDensityCommand extends RevisionedProjectCommand {
	readonly density: number
	readonly layerId: LayerId
	readonly type: 'drum.density.set'
}

export interface SetDrumSwingCommand extends RevisionedProjectCommand {
	readonly layerId: LayerId
	readonly swing: number
	readonly type: 'drum.swing.set'
}

export type ProjectCommand =
	| AddLayerCommand
	| SelectCharacterCommand
	| ConfigureLayerSoundCommand
	| SetLayerPerformanceCommand
	| CommitMacroCommand
	| AddNoteCommand
	| UpdateNoteCommand
	| MoveNoteCommand
	| ResizeNoteCommand
	| DeleteNoteCommand
	| TransposeOctaveCommand
	| BeginSourceNoteCommand
	| FinalizeSourceNoteCommand
	| ExtendSourceMaterialCommand
	| SetLayerMuteCommand
	| SetLayerSoloCommand
	| SetLayerGainCommand
	| SetTempoCommand
	| SetKeyCommand
	| SetLoopCommand
	| AddSectionCommand
	| PlaceSongInstanceCommand
	| DeleteSongInstanceCommand
	| MoveSongInstanceCommand
	| ResizeSongInstanceCommand
	| TrimLeftSongInstanceCommand
	| SplitSongInstanceCommand
	| DuplicateLayerAsVariationCommand
	| ToggleDrumEventCommand
	| SelectDrumVoiceCommand
	| SetDrumPatternCommand
	| SetDrumDensityCommand
	| SetDrumSwingCommand

export type ProjectCommandResult =
	| { readonly project: ProjectDocument; readonly status: 'applied' }
	| { readonly project: ProjectDocument; readonly status: 'noop' }
	| { readonly failure: ProjectCommandFailure; readonly status: 'rejected' }

class ReductionFailure extends Error {
	public readonly code: ProjectCommandFailureCode

	public constructor(code: ProjectCommandFailureCode, message: string) {
		super(message)
		this.code = code
	}
}

function fail(code: ProjectCommandFailureCode, message: string): never {
	throw new ReductionFailure(code, message)
}

function validRevision(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0
}

function semanticEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true
	if (Array.isArray(left) && Array.isArray(right)) {
		return (
			left.length === right.length &&
			left.every((entry, index) => semanticEqual(entry, right[index]))
		)
	}
	if (
		typeof left === 'object' &&
		left !== null &&
		!Array.isArray(left) &&
		typeof right === 'object' &&
		right !== null &&
		!Array.isArray(right)
	) {
		const leftRecord = left as Record<string, unknown>
		const rightRecord = right as Record<string, unknown>
		const keys = Object.keys(leftRecord)
		return (
			keys.length === Object.keys(rightRecord).length &&
			keys.every(
				(key) =>
					Object.prototype.hasOwnProperty.call(rightRecord, key) &&
					semanticEqual(leftRecord[key], rightRecord[key])
			)
		)
	}
	return false
}

function normalizePerformance(performance: LayerPerformanceMapping): LayerPerformanceMapping {
	if (
		!Number.isSafeInteger(performance.key.tonic) ||
		performance.key.tonic < 0 ||
		performance.key.tonic > 11 ||
		(performance.key.mode !== 'major' && performance.key.mode !== 'minor') ||
		!Number.isSafeInteger(performance.octave) ||
		performance.octave < 1 ||
		performance.octave > 6
	) {
		fail('INVALID_COMMAND', 'Layer performance requires a valid key and octave from 1 to 6.')
	}
	return {
		key: { tonic: performance.key.tonic, mode: performance.key.mode },
		octave: performance.octave
	}
}

function updateLayer(
	project: ProjectDocument,
	layerId: LayerId,
	update: (layer: ProjectDocument['layers'][number]) => ProjectDocument['layers'][number]
): ProjectDocument {
	const index = project.layers.findIndex((layer) => layer.id === layerId)
	if (index < 0) fail('NOT_FOUND', `Layer ${layerId} was not found.`)
	const current = project.layers[index]
	if (current === undefined) fail('NOT_FOUND', `Layer ${layerId} was not found.`)
	const updated = update(current)
	if (updated === current) return project
	const layers = [...project.layers]
	layers[index] = updated
	return { ...project, layers }
}

function updateMaterial(
	project: ProjectDocument,
	layerId: LayerId,
	update: (
		material: ProjectDocument['layers'][number]['material']
	) => ProjectDocument['layers'][number]['material']
): ProjectDocument {
	return updateLayer(project, layerId, (layer) => {
		const updated = update(layer.material)
		return updated === layer.material ? layer : { ...layer, material: updated }
	})
}

function updateMidiNote(
	project: ProjectDocument,
	layerId: LayerId,
	noteId: NoteId,
	update: (note: MidiNote) => MidiNote | null
): ProjectDocument {
	return updateMaterial(project, layerId, (material) => {
		if (material.kind !== 'midi')
			fail('INCOMPATIBLE_TARGET', 'MIDI note commands require MIDI source material.')
		const index = material.notes.findIndex((note) => note.id === noteId)
		if (index < 0) fail('NOT_FOUND', `Note ${noteId} was not found.`)
		const current = material.notes[index]
		if (current === undefined) fail('NOT_FOUND', `Note ${noteId} was not found.`)
		const updated = update(current)
		if (updated === current) return material
		const notes = [...material.notes]
		if (updated === null) notes.splice(index, 1)
		else notes[index] = updated
		return updated === null
			? { ...material, notes }
			: {
					...extendMaterialThrough(material, updated.startTick + updated.durationTicks),
					notes
				}
	})
}

function extendMaterialThrough(
	material: ProjectDocument['layers'][number]['material'],
	throughTick: number
): ProjectDocument['layers'][number]['material'] {
	if (throughTick > projectLimits.maxMaterialTick) {
		fail(
			'INVALID_COMMAND',
			`Source material cannot extend beyond tick ${String(projectLimits.maxMaterialTick)}.`
		)
	}
	const through = projectTick(throughTick)
	if (through <= material.materialLengthTicks) return material
	const previousCycle = material.materialLengthTicks + material.tailRestTicks
	return {
		...material,
		materialLengthTicks: through,
		tailRestTicks: projectTick(Math.max(0, previousCycle - through))
	}
}

function requireMissingInstance(
	project: ProjectDocument,
	layerId: LayerId,
	instance: SongInstance | undefined
): ProjectDocument {
	if (project.song.instances.some((candidate) => candidate.sourceLayerId === layerId))
		return project
	if (instance === undefined || instance.sourceLayerId !== layerId) {
		fail(
			'INVALID_COMMAND',
			`The first authored material for ${layerId} requires a song instance.`
		)
	}
	if (project.song.instances.some((candidate) => candidate.id === instance.id)) {
		fail('DUPLICATE_ID', `Song instance ${instance.id} already exists.`)
	}
	return { ...project, song: { instances: [...project.song.instances, instance] } }
}

function updateSongInstance(
	project: ProjectDocument,
	instanceId: SongInstanceId,
	update: (instance: SongInstance) => SongInstance | null
): ProjectDocument {
	const index = project.song.instances.findIndex((instance) => instance.id === instanceId)
	if (index < 0) fail('NOT_FOUND', `Song instance ${instanceId} was not found.`)
	const current = project.song.instances[index]
	if (current === undefined) fail('NOT_FOUND', `Song instance ${instanceId} was not found.`)
	const updated = update(current)
	if (updated === current) return project
	const instances = [...project.song.instances]
	if (updated === null) instances.splice(index, 1)
	else instances[index] = updated
	return { ...project, song: { instances } }
}

function materialWithoutEventIds(material: ProjectLayer['material']): unknown {
	if (material.kind === 'midi') {
		return {
			...material,
			notes: material.notes.map((note) => ({
				durationTicks: note.durationTicks,
				pitch: note.pitch,
				startTick: note.startTick,
				velocity: note.velocity
			}))
		}
	}
	if (material.kind === 'drum') {
		return {
			...material,
			events: material.events.map((event) => ({
				instrument: event.instrument,
				step: event.step,
				velocity: event.velocity
			}))
		}
	}
	return material
}

function layerWithoutVariationIdentity(layer: ProjectLayer): unknown {
	return {
		exportIncluded: layer.exportIncluded,
		gain: layer.gain,
		muted: layer.muted,
		pan: layer.pan,
		role: layer.role,
		solo: layer.solo,
		source: layer.source
	}
}

function requireIndependentVariation(source: ProjectLayer, variation: ProjectLayer): void {
	if (source.role === 'reference' || variation.role === 'reference') {
		fail('INCOMPATIBLE_TARGET', 'Reference layers cannot become musical variations.')
	}
	const sourceMaterial = source.material
	const variationMaterial = variation.material
	if (
		!semanticEqual(
			layerWithoutVariationIdentity(source),
			layerWithoutVariationIdentity(variation)
		) ||
		!semanticEqual(
			materialWithoutEventIds(sourceMaterial),
			materialWithoutEventIds(variationMaterial)
		)
	) {
		fail('INVALID_COMMAND', 'A new variation must begin as a semantic copy of its source.')
	}
	if (sourceMaterial.kind === 'midi' && variationMaterial.kind === 'midi') {
		if (
			variationMaterial.notes.some(
				(note, index) => note.id === sourceMaterial.notes[index]?.id
			)
		) {
			fail('INVALID_COMMAND', 'A variation requires fresh note identities.')
		}
	}
	if (sourceMaterial.kind === 'drum' && variationMaterial.kind === 'drum') {
		if (
			variationMaterial.events.some(
				(event, index) => event.id === sourceMaterial.events[index]?.id
			)
		) {
			fail('INVALID_COMMAND', 'A variation requires fresh drum-event identities.')
		}
	}
}

interface DrumPatternPoint {
	readonly instrument: DrumInstrument
	readonly step: number
	readonly threshold: number
	readonly velocity: number
}

const drumPatternRecipes = Object.freeze({
	straight: Object.freeze([
		{ instrument: 'kick', step: 0, threshold: 0, velocity: 116 },
		{ instrument: 'kick', step: 8, threshold: 0.18, velocity: 108 },
		{ instrument: 'kick', step: 12, threshold: 0.72, velocity: 92 },
		{ instrument: 'clap', step: 4, threshold: 0.12, velocity: 106 },
		{ instrument: 'clap', step: 12, threshold: 0.12, velocity: 110 },
		...Array.from({ length: 8 }, (_, index) => ({
			instrument: 'closedHat' as const,
			step: index * 2,
			threshold: index % 2 === 0 ? 0.2 : 0.48,
			velocity: index % 2 === 0 ? 82 : 68
		})),
		{ instrument: 'openHat', step: 14, threshold: 0.64, velocity: 74 },
		{ instrument: 'perc', step: 6, threshold: 0.84, velocity: 72 }
	]),
	sparse: Object.freeze([
		{ instrument: 'kick', step: 0, threshold: 0, velocity: 114 },
		{ instrument: 'kick', step: 10, threshold: 0.54, velocity: 92 },
		{ instrument: 'clap', step: 12, threshold: 0.18, velocity: 104 },
		{ instrument: 'closedHat', step: 2, threshold: 0.34, velocity: 68 },
		{ instrument: 'closedHat', step: 10, threshold: 0.46, velocity: 64 },
		{ instrument: 'openHat', step: 14, threshold: 0.7, velocity: 72 },
		{ instrument: 'perc', step: 7, threshold: 0.82, velocity: 68 }
	]),
	driving: Object.freeze([
		...Array.from({ length: 4 }, (_, index) => ({
			instrument: 'kick' as const,
			step: index * 4,
			threshold: index % 2 === 0 ? 0 : 0.28,
			velocity: index % 2 === 0 ? 116 : 102
		})),
		{ instrument: 'clap', step: 4, threshold: 0.12, velocity: 108 },
		{ instrument: 'clap', step: 12, threshold: 0.12, velocity: 112 },
		...Array.from({ length: 16 }, (_, step) => ({
			instrument: 'closedHat' as const,
			step,
			threshold: step % 2 === 0 ? 0.22 : 0.66,
			velocity: step % 4 === 0 ? 84 : 62
		})),
		{ instrument: 'openHat', step: 7, threshold: 0.58, velocity: 76 },
		{ instrument: 'openHat', step: 15, threshold: 0.58, velocity: 78 }
	]),
	broken: Object.freeze([
		{ instrument: 'kick', step: 0, threshold: 0, velocity: 116 },
		{ instrument: 'kick', step: 7, threshold: 0.3, velocity: 96 },
		{ instrument: 'kick', step: 11, threshold: 0.58, velocity: 88 },
		{ instrument: 'clap', step: 5, threshold: 0.16, velocity: 104 },
		{ instrument: 'clap', step: 13, threshold: 0.16, velocity: 110 },
		{ instrument: 'closedHat', step: 2, threshold: 0.24, velocity: 70 },
		{ instrument: 'closedHat', step: 6, threshold: 0.32, velocity: 76 },
		{ instrument: 'closedHat', step: 9, threshold: 0.46, velocity: 66 },
		{ instrument: 'closedHat', step: 14, threshold: 0.32, velocity: 74 },
		{ instrument: 'openHat', step: 10, threshold: 0.64, velocity: 76 },
		{ instrument: 'perc', step: 3, threshold: 0.72, velocity: 68 },
		{ instrument: 'perc', step: 15, threshold: 0.82, velocity: 72 }
	])
} satisfies Readonly<Record<Exclude<DrumPatternCharacter, 'custom'>, readonly DrumPatternPoint[]>>)

function normalizedUnit(value: number, label: string): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		fail('INVALID_COMMAND', `${label} must be finite and between 0 and 1.`)
	}
	return value
}

function stableTextHash(value: string): string {
	let hash = 2_166_136_261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16_777_619)
	}
	return (hash >>> 0).toString(36)
}

function generatedDrumEvents(
	materialIdValue: LayerId,
	stepCount: number,
	character: Exclude<DrumPatternCharacter, 'custom'>,
	density: number
): readonly DrumEvent[] {
	const used = new Set<string>()
	const events: DrumEvent[] = []
	for (const point of drumPatternRecipes[character]) {
		if (density < point.threshold) continue
		const step = Math.min(stepCount - 1, Math.floor((point.step * stepCount) / 16))
		const key = `${point.instrument}:${String(step)}`
		if (used.has(key)) continue
		used.add(key)
		events.push({
			id: drumEventId(
				`event.pattern.${stableTextHash(materialIdValue)}.${character}.${point.instrument}.${String(step)}`
			),
			instrument: point.instrument,
			step,
			velocity: point.velocity
		})
	}
	return events
}

function applyCommand(project: ProjectDocument, command: ProjectCommand): ProjectDocument {
	switch (command.type) {
		case 'layer.add': {
			if (project.layers.some((layer) => layer.id === command.id)) {
				fail('DUPLICATE_ID', `Layer ${command.id} already exists.`)
			}
			if (
				command.synth !== undefined &&
				(command.role === 'rhythm' || command.role === 'reference')
			) {
				fail('INCOMPATIBLE_TARGET', 'Synth configuration requires a pitched layer role.')
			}
			const layer = createLayer({
				id: command.id,
				name: command.name,
				role: command.role,
				...(command.assetId === undefined ? {} : { assetId: command.assetId }),
				...(command.synth === undefined
					? {}
					: {
							synth: {
								presetId: command.synth.presetId,
								macros: command.synth.macros,
								performance: normalizePerformance(command.synth.performance)
							}
						})
			})
			return { ...project, layers: [...project.layers, layer] }
		}
		case 'layer.character.select':
			return updateLayer(project, command.layerId, (layer) => {
				if (layer.source.type !== 'synth') {
					fail(
						'INCOMPATIBLE_TARGET',
						'Sound characters can only be selected for synth layers.'
					)
				}
				const instrument = createSynthInstrument(command.presetId)
				if (
					layer.source.instrument.presetId === command.presetId &&
					semanticEqual(layer.source.instrument, instrument)
				) {
					return layer
				}
				return { ...layer, source: { ...layer.source, instrument } }
			})
		case 'layer.sound.configure':
			return updateLayer(project, command.layerId, (layer) => {
				if (layer.source.type !== 'synth') {
					fail('INCOMPATIBLE_TARGET', 'Sounds can only be configured for synth layers.')
				}
				const instrument = createSynthInstrument(command.presetId)
				const performance = normalizePerformance(command.performance)
				if (
					layer.source.instrument.presetId === command.presetId &&
					semanticEqual(layer.source.instrument, instrument) &&
					semanticEqual(layer.source.performance, performance)
				) {
					return layer
				}
				return { ...layer, source: { ...layer.source, instrument, performance } }
			})
		case 'layer.performance.set':
			return updateLayer(project, command.layerId, (layer) => {
				if (layer.source.type !== 'synth') {
					fail(
						'INCOMPATIBLE_TARGET',
						'Performance mappings can only be changed on synth layers.'
					)
				}
				const performance = normalizePerformance(command.performance)
				if (semanticEqual(layer.source.performance, performance)) return layer
				return { ...layer, source: { ...layer.source, performance } }
			})
		case 'layer.macro.commit':
			return updateLayer(project, command.layerId, (layer) => {
				if (layer.source.type !== 'synth') {
					fail('INCOMPATIBLE_TARGET', 'Macros can only be changed on synth layers.')
				}
				if (layer.source.instrument.macros[command.macro] === command.value) return layer
				return {
					...layer,
					source: {
						...layer.source,
						instrument: updateSynthMacro(
							layer.source.instrument,
							command.macro,
							command.value
						)
					}
				}
			})
		case 'note.add': {
			let candidate = requireMissingInstance(
				project,
				command.layerId,
				command.instanceWhenMissing
			)
			candidate = updateMaterial(candidate, command.layerId, (material) => {
				if (material.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Notes can only be added to MIDI source material.')
				if (material.notes.some((note) => note.id === command.note.id)) {
					fail('DUPLICATE_ID', `Note ${command.note.id} already exists.`)
				}
				const extended = extendMaterialThrough(
					material,
					command.note.startTick + command.note.durationTicks
				)
				return { ...extended, notes: [...material.notes, command.note] }
			})
			return candidate
		}
		case 'note.update':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Note updates require MIDI source material.')
				const index = material.notes.findIndex((note) => note.id === command.noteId)
				if (index < 0) fail('NOT_FOUND', `Note ${command.noteId} was not found.`)
				const note = material.notes[index] as MidiNote
				const updated = {
					...note,
					startTick: projectTick(command.startTick),
					pitch: midiPitch(command.pitch),
					durationTicks: projectTick(command.durationTicks),
					velocity: command.velocity
				}
				if (semanticEqual(note, updated)) return material
				const notes = [...material.notes]
				notes[index] = updated
				return {
					...extendMaterialThrough(material, updated.startTick + updated.durationTicks),
					notes
				}
			})
		case 'note.move':
			return updateMidiNote(project, command.layerId, command.noteId, (note) =>
				note.startTick === command.startTick && note.pitch === command.pitch
					? note
					: {
							...note,
							startTick: projectTick(command.startTick),
							pitch: midiPitch(command.pitch)
						}
			)
		case 'note.resize':
			return updateMidiNote(project, command.layerId, command.noteId, (note) =>
				note.durationTicks === command.durationTicks
					? note
					: { ...note, durationTicks: projectTick(command.durationTicks) }
			)
		case 'note.delete':
			return updateMidiNote(project, command.layerId, command.noteId, () => null)
		case 'material.transpose-octave':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Only MIDI material can be transposed.')
				if (material.notes.length === 0) return material
				const offset = command.direction * 12
				if (
					material.notes.some(
						(note) => note.pitch + offset < 0 || note.pitch + offset > 127
					)
				) {
					fail(
						'INVALID_COMMAND',
						'Octave transpose would move a note outside MIDI range.'
					)
				}
				return {
					...material,
					notes: material.notes.map((note) => ({
						...note,
						pitch: midiPitch(note.pitch + offset)
					}))
				}
			})
		case 'source.note.begin': {
			if (command.note.durationTicks !== 1) {
				fail(
					'INVALID_COMMAND',
					'A begun source note must use the one-tick minimum duration.'
				)
			}
			return applyCommand(project, {
				...command,
				type: 'note.add'
			})
		}
		case 'source.note.finalize':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Note finalization requires MIDI source material.')
				const index = material.notes.findIndex((note) => note.id === command.noteId)
				if (index < 0) fail('NOT_FOUND', `Note ${command.noteId} was not found.`)
				const note = material.notes[index] as MidiNote
				if (command.endTick < note.startTick) {
					fail('INVALID_COMMAND', 'A note cannot end before it begins.')
				}
				const durationTicks = projectTick(Math.max(1, command.endTick - note.startTick))
				if (durationTicks === note.durationTicks) return material
				const notes = [...material.notes]
				notes[index] = { ...note, durationTicks }
				return {
					...extendMaterialThrough(material, note.startTick + durationTicks),
					notes
				}
			})
		case 'source.material.extend':
			return updateMaterial(project, command.layerId, (material) =>
				extendMaterialThrough(material, command.throughTick)
			)
		case 'layer.mute.set':
			return updateLayer(project, command.layerId, (layer) =>
				layer.muted === command.muted ? layer : { ...layer, muted: command.muted }
			)
		case 'layer.solo.set':
			return updateLayer(project, command.layerId, (layer) =>
				layer.solo === command.solo ? layer : { ...layer, solo: command.solo }
			)
		case 'layer.gain.set':
			return updateLayer(project, command.layerId, (layer) =>
				layer.gain === command.gain ? layer : { ...layer, gain: command.gain }
			)
		case 'transport.tempo.set': {
			const current = project.transport.tempoMap[0]
			if (current?.bpm === command.bpm) return project
			if (current === undefined) fail('INVALID_RESULT', 'The project tempo map is empty.')
			return {
				...project,
				transport: {
					...project.transport,
					tempoMap: [
						{ ...current, bpm: command.bpm },
						...project.transport.tempoMap.slice(1)
					]
				}
			}
		}
		case 'transport.key.set':
			if (
				project.transport.key.tonic === command.key.tonic &&
				project.transport.key.mode === command.key.mode
			) {
				return project
			}
			return { ...project, transport: { ...project.transport, key: command.key } }
		case 'transport.loop.set': {
			const loop = project.transport.loop
			if (
				loop.enabled === command.enabled &&
				loop.startTick === command.startTick &&
				loop.endTick === command.endTick
			) {
				return project
			}
			return {
				...project,
				transport: {
					...project.transport,
					loop: {
						enabled: command.enabled,
						startTick: projectTick(command.startTick),
						endTick: projectTick(command.endTick)
					}
				}
			}
		}
		case 'section.add':
			if (project.sections.some((section) => section.id === command.section.id)) {
				fail('DUPLICATE_ID', `Section ${command.section.id} already exists.`)
			}
			return { ...project, sections: [...project.sections, command.section] }
		case 'song-instance.place':
			if (project.song.instances.some((instance) => instance.id === command.instance.id)) {
				fail('DUPLICATE_ID', `Song instance ${command.instance.id} already exists.`)
			}
			if (!project.layers.some((layer) => layer.id === command.instance.sourceLayerId)) {
				fail('NOT_FOUND', `Layer ${command.instance.sourceLayerId} was not found.`)
			}
			return {
				...project,
				song: { instances: [...project.song.instances, command.instance] }
			}
		case 'song-instance.delete':
			return updateSongInstance(project, command.instanceId, () => null)
		case 'song-instance.move':
			return updateSongInstance(project, command.instanceId, (instance) =>
				instance.startTick === command.startTick
					? instance
					: { ...instance, startTick: projectTick(command.startTick) }
			)
		case 'song-instance.resize':
			return updateSongInstance(project, command.instanceId, (instance) =>
				instance.durationTicks === command.durationTicks
					? instance
					: { ...instance, durationTicks: projectTick(command.durationTicks) }
			)
		case 'song-instance.trim-left':
			return updateSongInstance(project, command.instanceId, (instance) => {
				const updated = {
					...instance,
					startTick: projectTick(command.startTick),
					durationTicks: projectTick(command.durationTicks),
					sourceOffsetTicks: projectTick(command.sourceOffsetTicks)
				}
				return semanticEqual(instance, updated) ? instance : updated
			})
		case 'song-instance.split': {
			const instance = project.song.instances.find(
				(candidate) => candidate.id === command.instanceId
			)
			if (instance === undefined) {
				fail('NOT_FOUND', `Song instance ${command.instanceId} was not found.`)
			}
			if (
				!Number.isSafeInteger(command.splitOffsetTicks) ||
				command.splitOffsetTicks <= 0 ||
				command.splitOffsetTicks >= instance.durationTicks
			) {
				fail('INVALID_COMMAND', 'A split must lie strictly inside the song instance.')
			}
			if (
				project.song.instances.some((candidate) => candidate.id === command.rightInstanceId)
			) {
				fail('DUPLICATE_ID', `Song instance ${command.rightInstanceId} already exists.`)
			}
			const leftDuration = projectTick(command.splitOffsetTicks)
			const right = {
				...instance,
				id: command.rightInstanceId,
				startTick: projectTick(instance.startTick + command.splitOffsetTicks),
				durationTicks: projectTick(instance.durationTicks - command.splitOffsetTicks),
				sourceOffsetTicks: projectTick(
					instance.sourceOffsetTicks + command.splitOffsetTicks
				)
			}
			return {
				...project,
				song: {
					instances: project.song.instances.flatMap((candidate) =>
						candidate.id === instance.id
							? [{ ...candidate, durationTicks: leftDuration }, right]
							: [candidate]
					)
				}
			}
		}
		case 'layer.duplicate-as-variation': {
			const source = project.layers.find((layer) => layer.id === command.sourceLayerId)
			if (source === undefined) {
				fail('NOT_FOUND', `Layer ${command.sourceLayerId} was not found.`)
			}
			if (project.layers.some((layer) => layer.id === command.layer.id)) {
				fail('DUPLICATE_ID', `Layer ${command.layer.id} already exists.`)
			}
			if (command.instance.sourceLayerId !== command.layer.id) {
				fail('INVALID_COMMAND', 'A variation instance must reference its new source layer.')
			}
			if (project.song.instances.some((instance) => instance.id === command.instance.id)) {
				fail('DUPLICATE_ID', `Song instance ${command.instance.id} already exists.`)
			}
			requireIndependentVariation(source, command.layer)
			return {
				...project,
				layers: [...project.layers, command.layer],
				song: { instances: [...project.song.instances, command.instance] }
			}
		}
		case 'drum-event.toggle':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'drum')
					fail('INCOMPATIBLE_TARGET', 'Drum events require drum source material.')
				const existing = material.events.findIndex(
					(event) =>
						event.instrument === command.eventWhenAdded.instrument &&
						event.step === command.eventWhenAdded.step
				)
				if (existing >= 0) {
					const events = [...material.events]
					events.splice(existing, 1)
					return { ...material, character: 'custom', events }
				}
				return {
					...material,
					character: 'custom',
					events: [...material.events, command.eventWhenAdded]
				}
			})
		case 'drum.voice.select':
			return updateLayer(project, command.layerId, (layer) => {
				if (layer.source.type !== 'drum') {
					fail('INCOMPATIBLE_TARGET', 'Drum voices can only be selected for drum layers.')
				}
				if (layer.source.voiceVariants[command.instrument] === command.variantId)
					return layer
				return {
					...layer,
					source: updateDrumVoiceVariant(
						layer.source,
						command.instrument,
						command.variantId
					)
				}
			})
		case 'drum.pattern.set':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'drum') {
					fail('INCOMPATIBLE_TARGET', 'Drum patterns require drum source material.')
				}
				const events = generatedDrumEvents(
					command.layerId,
					material.pattern.stepCount,
					command.character,
					material.density
				)
				if (
					material.character === command.character &&
					semanticEqual(material.events, events)
				)
					return material
				return { ...material, character: command.character, events }
			})
		case 'drum.density.set':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'drum')
					fail('INCOMPATIBLE_TARGET', 'Density requires drum source material.')
				const density = normalizedUnit(command.density, 'Drum density')
				const character = material.character === 'custom' ? 'straight' : material.character
				const events = generatedDrumEvents(
					command.layerId,
					material.pattern.stepCount,
					character,
					density
				)
				if (
					material.density === density &&
					material.character === character &&
					semanticEqual(material.events, events)
				) {
					return material
				}
				return { ...material, character, density, events }
			})
		case 'drum.swing.set':
			return updateMaterial(project, command.layerId, (material) => {
				if (material.kind !== 'drum')
					fail('INCOMPATIBLE_TARGET', 'Swing requires drum source material.')
				const swing = normalizedUnit(command.swing, 'Drum swing')
				if (material.swing === swing) return material
				return { ...material, swing }
			})
	}
}

export function createProjectFromCommand(command: CreateProjectCommand): ProjectDocument {
	const project = createProject({ projectId: command.projectId, title: command.title })
	const validation = validateProjectDocument(project)
	if (!validation.ok) {
		throw new RangeError(
			validation.issues[0]?.message ?? 'The create-project command is invalid.'
		)
	}
	return validation.project
}

export function reduceProjectCommand(
	project: ProjectDocument,
	currentRevision: number,
	command: ProjectCommand
): ProjectCommandResult {
	if (!validRevision(currentRevision) || !validRevision(command.baseRevision)) {
		return {
			status: 'rejected',
			failure: {
				code: 'INVALID_COMMAND',
				message: 'Project revisions must be non-negative safe integers.'
			}
		}
	}
	if (command.baseRevision !== currentRevision) {
		return {
			status: 'rejected',
			failure: {
				code: 'STALE_REVISION',
				message: `Command revision ${String(command.baseRevision)} does not match ${String(currentRevision)}.`
			}
		}
	}
	try {
		const candidate = applyCommand(project, command)
		if (candidate === project) return { status: 'noop', project }
		const validation = validateProjectDocument(candidate)
		if (!validation.ok) {
			return {
				status: 'rejected',
				failure: {
					code: 'INVALID_RESULT',
					message:
						validation.issues[0]?.message ?? 'The command produced an invalid project.'
				}
			}
		}
		return { status: 'applied', project: validation.project }
	} catch (error) {
		return {
			status: 'rejected',
			failure:
				error instanceof ReductionFailure
					? { code: error.code, message: error.message }
					: {
							code: 'INVALID_COMMAND',
							message:
								error instanceof Error
									? error.message
									: 'The command could not be applied.'
						}
		}
	}
}

export type MacroPreviewResult =
	| { readonly instrument: SynthInstrumentState; readonly status: 'ready' }
	| { readonly failure: ProjectCommandFailure; readonly status: 'rejected' }

export function previewBassMacro(
	project: ProjectDocument,
	layerId: LayerId,
	macro: SynthMacroId,
	value: number
): MacroPreviewResult {
	const layer = project.layers.find((candidate) => candidate.id === layerId)
	if (layer === undefined) {
		return {
			status: 'rejected',
			failure: { code: 'NOT_FOUND', message: `Layer ${layerId} was not found.` }
		}
	}
	if (layer.source.type !== 'synth') {
		return {
			status: 'rejected',
			failure: { code: 'INCOMPATIBLE_TARGET', message: 'Macros require a synth layer.' }
		}
	}
	try {
		return {
			status: 'ready',
			instrument: updateSynthMacro(layer.source.instrument, macro, value)
		}
	} catch (error) {
		return {
			status: 'rejected',
			failure: {
				code: 'INVALID_COMMAND',
				message: error instanceof Error ? error.message : 'The macro preview is invalid.'
			}
		}
	}
}

export const previewSynthMacro = previewBassMacro
