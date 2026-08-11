import { createSynthInstrument, updateDrumVoiceVariant, updateSynthMacro } from './presets.js'
import { createLayer, createProject } from './factories.js'
import {
	drumEventId,
	midiPitch,
	projectTick,
	type AssetId,
	type ClipId,
	type DrumEvent,
	type DrumInstrument,
	type DrumPatternCharacter,
	type DrumVoiceVariantId,
	type LayerId,
	type LayerPerformanceMapping,
	type MidiNote,
	type NoteId,
	type ProjectClip,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectRole,
	type ProjectSection,
	type SynthInstrumentStateV2,
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
	readonly clipId: ClipId
	readonly clipWhenMissing?: Extract<ProjectClip, { readonly kind: 'midi' }>
	readonly layerId: LayerId
	readonly note: MidiNote
	readonly type: 'note.add'
}

export interface UpdateNoteCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly durationTicks: number
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'note.update'
	readonly velocity: number
}

export interface MoveNoteCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'note.move'
}

export interface ResizeNoteCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly durationTicks: number
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly type: 'note.resize'
}

export interface DeleteNoteCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly layerId: LayerId
	readonly noteId: NoteId
	readonly type: 'note.delete'
}

export interface TransposeOctaveCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly direction: -1 | 1
	readonly layerId: LayerId
	readonly type: 'clip.transpose-octave'
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

export interface PlaceClipCommand extends RevisionedProjectCommand {
	readonly clip: ProjectClip
	readonly layerId: LayerId
	readonly type: 'clip.place'
}

export interface DeleteClipCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly layerId: LayerId
	readonly type: 'clip.delete'
}

export interface ToggleDrumEventCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
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
	readonly clipId: ClipId
	readonly layerId: LayerId
	readonly type: 'drum.pattern.set'
}

export interface SetDrumDensityCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
	readonly density: number
	readonly layerId: LayerId
	readonly type: 'drum.density.set'
}

export interface SetDrumSwingCommand extends RevisionedProjectCommand {
	readonly clipId: ClipId
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
	| SetLayerMuteCommand
	| SetLayerSoloCommand
	| SetLayerGainCommand
	| SetTempoCommand
	| SetKeyCommand
	| SetLoopCommand
	| AddSectionCommand
	| PlaceClipCommand
	| DeleteClipCommand
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

function updateClip(
	project: ProjectDocument,
	layerId: LayerId,
	clipId: ClipId,
	update: (clip: ProjectClip) => ProjectClip
): ProjectDocument {
	return updateLayer(project, layerId, (layer) => {
		const index = layer.clips.findIndex((clip) => clip.id === clipId)
		if (index < 0) fail('NOT_FOUND', `Clip ${clipId} was not found in layer ${layerId}.`)
		const current = layer.clips[index]
		if (current === undefined) fail('NOT_FOUND', `Clip ${clipId} was not found.`)
		const updated = update(current)
		if (updated === current) return layer
		const clips = [...layer.clips]
		clips[index] = updated
		return { ...layer, clips }
	})
}

function updateMidiNote(
	project: ProjectDocument,
	layerId: LayerId,
	clipId: ClipId,
	noteId: NoteId,
	update: (note: MidiNote) => MidiNote | null
): ProjectDocument {
	return updateClip(project, layerId, clipId, (clip) => {
		if (clip.kind !== 'midi')
			fail('INCOMPATIBLE_TARGET', 'MIDI note commands require a MIDI clip.')
		const index = clip.notes.findIndex((note) => note.id === noteId)
		if (index < 0) fail('NOT_FOUND', `Note ${noteId} was not found.`)
		const current = clip.notes[index]
		if (current === undefined) fail('NOT_FOUND', `Note ${noteId} was not found.`)
		const updated = update(current)
		if (updated === current) return clip
		const notes = [...clip.notes]
		if (updated === null) notes.splice(index, 1)
		else notes[index] = updated
		return { ...clip, notes }
	})
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
	clipIdValue: ClipId,
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
				`event.pattern.${stableTextHash(clipIdValue)}.${character}.${point.instrument}.${String(step)}`
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
			const layer = createLayer({
				id: command.id,
				name: command.name,
				role: command.role,
				...(command.assetId === undefined ? {} : { assetId: command.assetId })
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
			const layer = project.layers.find((candidate) => candidate.id === command.layerId)
			if (layer === undefined) fail('NOT_FOUND', `Layer ${command.layerId} was not found.`)
			const targetClip = layer.clips.find((clip) => clip.id === command.clipId)
			if (targetClip === undefined) {
				const clip = command.clipWhenMissing
				if (clip === undefined || clip.id !== command.clipId) {
					fail(
						'NOT_FOUND',
						`Clip ${command.clipId} was not found in layer ${command.layerId}.`
					)
				}
				if (
					project.layers.some((candidate) =>
						candidate.clips.some((candidateClip) => candidateClip.id === clip.id)
					)
				) {
					fail('DUPLICATE_ID', `Clip ${clip.id} already exists.`)
				}
				if (clip.notes.some((note) => note.id === command.note.id)) {
					fail('DUPLICATE_ID', `Note ${command.note.id} already exists.`)
				}
				return updateLayer(project, command.layerId, (candidate) => ({
					...candidate,
					clips: [...candidate.clips, { ...clip, notes: [...clip.notes, command.note] }]
				}))
			}
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Notes can only be added to MIDI clips.')
				if (clip.notes.some((note) => note.id === command.note.id)) {
					fail('DUPLICATE_ID', `Note ${command.note.id} already exists.`)
				}
				return { ...clip, notes: [...clip.notes, command.note] }
			})
		}
		case 'note.update':
			return updateMidiNote(
				project,
				command.layerId,
				command.clipId,
				command.noteId,
				(note) =>
					note.startTick === command.startTick &&
					note.pitch === command.pitch &&
					note.durationTicks === command.durationTicks &&
					note.velocity === command.velocity
						? note
						: {
								...note,
								startTick: projectTick(command.startTick),
								pitch: midiPitch(command.pitch),
								durationTicks: projectTick(command.durationTicks),
								velocity: command.velocity
							}
			)
		case 'note.move':
			return updateMidiNote(
				project,
				command.layerId,
				command.clipId,
				command.noteId,
				(note) =>
					note.startTick === command.startTick && note.pitch === command.pitch
						? note
						: {
								...note,
								startTick: projectTick(command.startTick),
								pitch: midiPitch(command.pitch)
							}
			)
		case 'note.resize':
			return updateMidiNote(
				project,
				command.layerId,
				command.clipId,
				command.noteId,
				(note) =>
					note.durationTicks === command.durationTicks
						? note
						: { ...note, durationTicks: projectTick(command.durationTicks) }
			)
		case 'note.delete':
			return updateMidiNote(
				project,
				command.layerId,
				command.clipId,
				command.noteId,
				() => null
			)
		case 'clip.transpose-octave':
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'midi')
					fail('INCOMPATIBLE_TARGET', 'Only MIDI clips can be transposed.')
				if (clip.notes.length === 0) return clip
				const offset = command.direction * 12
				if (
					clip.notes.some((note) => note.pitch + offset < 0 || note.pitch + offset > 127)
				) {
					fail(
						'INVALID_COMMAND',
						'Octave transpose would move a note outside MIDI range.'
					)
				}
				return {
					...clip,
					notes: clip.notes.map((note) => ({
						...note,
						pitch: midiPitch(note.pitch + offset)
					}))
				}
			})
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
		case 'clip.place':
			return updateLayer(project, command.layerId, (layer) => {
				if (
					project.layers.some((candidate) =>
						candidate.clips.some((clip) => clip.id === command.clip.id)
					)
				) {
					fail('DUPLICATE_ID', `Clip ${command.clip.id} already exists.`)
				}
				return { ...layer, clips: [...layer.clips, command.clip] }
			})
		case 'clip.delete':
			return updateLayer(project, command.layerId, (layer) => {
				const index = layer.clips.findIndex((clip) => clip.id === command.clipId)
				if (index < 0) fail('NOT_FOUND', `Clip ${command.clipId} was not found.`)
				const clips = [...layer.clips]
				clips.splice(index, 1)
				return { ...layer, clips }
			})
		case 'drum-event.toggle':
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'drum')
					fail('INCOMPATIBLE_TARGET', 'Drum events require a drum clip.')
				const existing = clip.events.findIndex(
					(event) =>
						event.instrument === command.eventWhenAdded.instrument &&
						event.step === command.eventWhenAdded.step
				)
				if (existing >= 0) {
					const events = [...clip.events]
					events.splice(existing, 1)
					return { ...clip, character: 'custom', events }
				}
				return {
					...clip,
					character: 'custom',
					events: [...clip.events, command.eventWhenAdded]
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
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'drum') {
					fail('INCOMPATIBLE_TARGET', 'Drum patterns require a drum clip.')
				}
				const events = generatedDrumEvents(
					clip.id,
					clip.pattern.stepCount,
					command.character,
					clip.density
				)
				if (clip.character === command.character && semanticEqual(clip.events, events))
					return clip
				return { ...clip, character: command.character, events }
			})
		case 'drum.density.set':
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'drum')
					fail('INCOMPATIBLE_TARGET', 'Density requires a drum clip.')
				const density = normalizedUnit(command.density, 'Drum density')
				const character = clip.character === 'custom' ? 'straight' : clip.character
				const events = generatedDrumEvents(
					clip.id,
					clip.pattern.stepCount,
					character,
					density
				)
				if (
					clip.density === density &&
					clip.character === character &&
					semanticEqual(clip.events, events)
				) {
					return clip
				}
				return { ...clip, character, density, events }
			})
		case 'drum.swing.set':
			return updateClip(project, command.layerId, command.clipId, (clip) => {
				if (clip.kind !== 'drum') fail('INCOMPATIBLE_TARGET', 'Swing requires a drum clip.')
				const swing = normalizedUnit(command.swing, 'Drum swing')
				if (clip.swing === swing) return clip
				return { ...clip, swing }
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
	| { readonly instrument: SynthInstrumentStateV2; readonly status: 'ready' }
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
