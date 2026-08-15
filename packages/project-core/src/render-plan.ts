import { cloneAndFreeze } from './immutable.js'
import {
	enginePatchModelVersion,
	engineProtocolLimits,
	engineRenderPlanVersion,
	engineTicksPerQuarter,
	validateEngineWireRenderPlan,
	type EngineWireDrumKitPatch,
	type EngineWireDrumVoicePatch,
	type EngineWireRenderPlan,
	type EngineWireSynthPatch
} from '../../contracts/src/index.js'
import {
	defaultTicksPerQuarter,
	type DrumEventId,
	type DrumInstrument,
	type LayerId,
	type NoteId,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectLoop,
	type SongInstanceId,
	type ResolvedDrumKitPatch,
	type ResolvedDrumVoicePatch,
	type ResolvedSynthPatch
} from './model.js'
import { validateProjectDocument } from './validation.js'

export const renderPlanVersion = 4 as const

export interface RenderPlanMidiEvent {
	readonly durationTicks: number
	readonly id: string
	readonly instanceId: SongInstanceId
	readonly pitch: number
	readonly sourceEventId: NoteId
	readonly startTick: number
	readonly type: 'midi-note'
	readonly velocity: number
}

export interface RenderPlanDrumEvent {
	readonly id: string
	readonly instrument: DrumInstrument
	readonly instanceId: SongInstanceId
	readonly sourceEventId: DrumEventId
	readonly startTick: number
	readonly swing: number
	readonly type: 'drum-hit'
	readonly velocity: number
}

export type RenderPlanEvent = RenderPlanMidiEvent | RenderPlanDrumEvent

export interface RenderPlanLayer {
	readonly events: readonly RenderPlanEvent[]
	readonly gain: number
	readonly id: LayerId
	readonly pan: number
	readonly source:
		| { readonly instrument: ResolvedSynthPatch; readonly type: 'synth' }
		| {
				readonly kitId: 'drums.clean-pulse'
				readonly kitRevision: 1
				readonly patch: ResolvedDrumKitPatch
				readonly type: 'drum'
		  }
}

export interface ProjectRenderPlan {
	readonly endTick: number
	readonly key: ProjectKey
	readonly layers: readonly RenderPlanLayer[]
	readonly loop: ProjectLoop
	readonly meterMap: ProjectDocument['transport']['meterMap']
	readonly planVersion: typeof renderPlanVersion
	readonly projectId: ProjectId
	readonly projectRevision: number
	readonly tempoMap: ProjectDocument['transport']['tempoMap']
	readonly ticksPerQuarter: typeof defaultTicksPerQuarter
}

export type RenderPlanResult =
	| { readonly plan: ProjectRenderPlan; readonly status: 'ready' }
	| {
			readonly code: 'INVALID_PROJECT' | 'INVALID_REVISION' | 'STALE_REVISION'
			readonly message: string
			readonly status: 'rejected'
	  }

export type EngineWirePlanCompilationResult =
	| { readonly plan: EngineWireRenderPlan; readonly status: 'ready' }
	| {
			readonly code: 'INVALID_PLAN' | 'UNSUPPORTED_SOURCE'
			readonly message: string
			readonly status: 'rejected'
	  }

export function compileEngineWireSynthPatch(patch: ResolvedSynthPatch): EngineWireSynthPatch {
	return cloneAndFreeze({
		patchModelVersion: enginePatchModelVersion,
		oscillator: patch.oscillator,
		filter: patch.filter,
		amplifier: patch.amplifier,
		movement: patch.movement,
		expression: patch.expression,
		drive: patch.drive,
		stereoWidth: patch.stereoWidth,
		outputGain: patch.outputGain
	})
}

function compileEngineWireDrumVoice(patch: ResolvedDrumVoicePatch): EngineWireDrumVoicePatch {
	return cloneAndFreeze({
		algorithm: patch.algorithm,
		pitchHz: patch.pitchHz,
		tone: patch.tone,
		decayMs: patch.decayMs,
		noise: patch.noise,
		drive: patch.drive,
		gain: patch.gain
	})
}

export function compileEngineWireDrumPatch(patch: ResolvedDrumKitPatch): EngineWireDrumKitPatch {
	return cloneAndFreeze({
		patchModelVersion: enginePatchModelVersion,
		voices: {
			kick: compileEngineWireDrumVoice(patch.voices.kick),
			clap: compileEngineWireDrumVoice(patch.voices.clap),
			closedHat: compileEngineWireDrumVoice(patch.voices.closedHat),
			openHat: compileEngineWireDrumVoice(patch.voices.openHat),
			perc: compileEngineWireDrumVoice(patch.voices.perc)
		}
	})
}

function eventOrder(left: RenderPlanEvent, right: RenderPlanEvent): number {
	return left.startTick - right.startTick || opaqueIdOrder(left.id, right.id)
}

function opaqueIdOrder(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function stableHash(value: string, seed: number): string {
	let hash = seed >>> 0
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16_777_619)
	}
	return (hash >>> 0).toString(36)
}

function runtimeEventId(instanceId: string, sourceEventId: string, iteration: number): string {
	const identity = `${instanceId}:${sourceEventId}`
	return `event.${stableHash(identity, 2_166_136_261)}.${stableHash(identity, 3_332_777_319)}.${iteration.toString(36)}`
}

function layerEvents(
	project: ProjectDocument,
	layer: ProjectDocument['layers'][number]
): readonly RenderPlanEvent[] | null {
	const events: RenderPlanEvent[] = []
	const instances = project.song.instances
		.filter((instance) => instance.sourceLayerId === layer.id)
		.sort((left, right) => left.startTick - right.startTick || opaqueIdOrder(left.id, right.id))
	const material = layer.material
	const cycleTicks = material.materialLengthTicks + material.tailRestTicks
	if (cycleTicks <= 0) return events
	for (const instance of instances) {
		const sourceWindowEnd = instance.sourceOffsetTicks + instance.durationTicks
		for (let iteration = 0; iteration * cycleTicks < sourceWindowEnd; iteration += 1) {
			const cycleStart = iteration * cycleTicks
			if (material.kind === 'midi') {
				for (const note of material.notes) {
					const sourceStart = cycleStart + note.startTick
					if (sourceStart < instance.sourceOffsetTicks || sourceStart >= sourceWindowEnd)
						continue
					const startTick = instance.startTick + sourceStart - instance.sourceOffsetTicks
					const durationTicks = Math.min(
						note.durationTicks,
						instance.startTick + instance.durationTicks - startTick
					)
					if (events.length === engineProtocolLimits.maxMusicalEvents) return null
					events.push({
						type: 'midi-note',
						id: runtimeEventId(instance.id, note.id, iteration),
						instanceId: instance.id,
						sourceEventId: note.id,
						startTick,
						durationTicks,
						pitch: note.pitch,
						velocity: note.velocity
					})
				}
			} else if (material.kind === 'drum') {
				const ticksPerStep = defaultTicksPerQuarter / material.pattern.stepsPerQuarter
				for (const event of material.events) {
					const sourceStart = cycleStart + event.step * ticksPerStep
					if (sourceStart < instance.sourceOffsetTicks || sourceStart >= sourceWindowEnd)
						continue
					if (events.length === engineProtocolLimits.maxMusicalEvents) return null
					events.push({
						type: 'drum-hit',
						id: runtimeEventId(instance.id, event.id, iteration),
						instanceId: instance.id,
						sourceEventId: event.id,
						startTick: instance.startTick + sourceStart - instance.sourceOffsetTicks,
						swing: material.swing,
						instrument: event.instrument,
						velocity: event.velocity
					})
				}
			}
		}
	}
	return events.sort(eventOrder)
}

export function compileProjectRenderPlan(
	project: ProjectDocument,
	projectRevision: number,
	requestedRevision: number = projectRevision
): RenderPlanResult {
	if (
		!Number.isSafeInteger(projectRevision) ||
		projectRevision < 0 ||
		!Number.isSafeInteger(requestedRevision) ||
		requestedRevision < 0
	) {
		return {
			status: 'rejected',
			code: 'INVALID_REVISION',
			message: 'Render plan revisions must be non-negative safe integers.'
		}
	}
	if (requestedRevision !== projectRevision) {
		return {
			status: 'rejected',
			code: 'STALE_REVISION',
			message: `Requested revision ${String(requestedRevision)} does not match project revision ${String(projectRevision)}.`
		}
	}
	const validation = validateProjectDocument(project)
	if (!validation.ok) {
		return {
			status: 'rejected',
			code: 'INVALID_PROJECT',
			message: validation.issues[0]?.message ?? 'The project is invalid.'
		}
	}
	const playable = validation.project.layers.filter(
		(layer) =>
			layer.exportIncluded && layer.role !== 'reference' && layer.source.type !== 'reference'
	)
	const hasSolo = playable.some((layer) => layer.solo)
	const layers: RenderPlanLayer[] = []
	for (const layer of playable
		.filter((candidate) => !candidate.muted && (!hasSolo || candidate.solo))
		.sort((left, right) => opaqueIdOrder(left.id, right.id))) {
		const events = layerEvents(validation.project, layer)
		if (events === null) {
			return {
				status: 'rejected',
				code: 'INVALID_PROJECT',
				message: `Layer ${layer.id} expands beyond the engine musical-event limit.`
			}
		}
		if (layer.source.type === 'synth') {
			layers.push({
				id: layer.id,
				gain: layer.gain,
				pan: layer.pan,
				source: { type: 'synth', instrument: layer.source.instrument.resolvedPatch },
				events
			})
			continue
		}
		if (layer.source.type === 'reference') {
			return {
				status: 'rejected',
				code: 'INVALID_PROJECT',
				message: 'Reference layers cannot cross the render-plan boundary.'
			}
		}
		layers.push({
			id: layer.id,
			gain: layer.gain,
			pan: layer.pan,
			source: {
				type: 'drum',
				kitId: layer.source.kitId,
				kitRevision: layer.source.kitRevision,
				patch: layer.source.resolvedPatch
			},
			events
		})
	}
	const endTick = Math.max(
		validation.project.transport.loop.endTick,
		...validation.project.sections.map((section) => section.startTick + section.lengthTicks),
		...validation.project.transport.tempoMap.map((point) => point.tick + 1),
		...validation.project.transport.meterMap.map(
			(point) =>
				point.tick + (validation.project.transport.ticksPerQuarter * 4) / point.denominator
		),
		...validation.project.song.instances.map(
			(instance) => instance.startTick + instance.durationTicks
		)
	)
	return {
		status: 'ready',
		plan: cloneAndFreeze({
			planVersion: renderPlanVersion,
			projectId: validation.project.projectId,
			projectRevision,
			ticksPerQuarter: validation.project.transport.ticksPerQuarter,
			endTick,
			tempoMap: validation.project.transport.tempoMap,
			meterMap: validation.project.transport.meterMap,
			key: validation.project.transport.key,
			loop: validation.project.transport.loop,
			layers
		})
	}
}

export function compileEngineWireRenderPlan(
	projectPlan: ProjectRenderPlan
): EngineWirePlanCompilationResult {
	const plan = cloneAndFreeze({
		planVersion: engineRenderPlanVersion,
		projectId: projectPlan.projectId,
		projectRevision: projectPlan.projectRevision,
		ticksPerQuarter: engineTicksPerQuarter,
		endTick: projectPlan.endTick,
		tempoMap: projectPlan.tempoMap.map((point) => ({
			tick: point.tick,
			microBpm: Math.round(point.bpm * 1_000_000)
		})),
		meterMap: projectPlan.meterMap,
		loop: projectPlan.loop,
		layers: projectPlan.layers.map((layer) => {
			if (layer.source.type === 'synth') {
				return {
					id: layer.id,
					gain: layer.gain,
					pan: layer.pan,
					source: {
						type: 'subtractive-synth' as const,
						patch: compileEngineWireSynthPatch(layer.source.instrument)
					},
					events: layer.events.flatMap((event) =>
						event.type === 'midi-note'
							? [
									{
										id: event.id,
										startTick: event.startTick,
										durationTicks: event.durationTicks,
										pitch: event.pitch,
										velocity: event.velocity
									}
								]
							: []
					)
				}
			}
			return {
				id: layer.id,
				gain: layer.gain,
				pan: layer.pan,
				source: {
					type: 'procedural-drums' as const,
					patch: compileEngineWireDrumPatch(layer.source.patch)
				},
				events: layer.events.flatMap((event) =>
					event.type === 'drum-hit'
						? [
								{
									id: event.id,
									startTick: event.startTick,
									swingTicks:
										Math.floor(event.startTick / (engineTicksPerQuarter / 4)) %
											2 ===
										1
											? Math.round((engineTicksPerQuarter / 4) * event.swing)
											: 0,
									instrument: event.instrument,
									velocity: event.velocity
								}
							]
						: []
				)
			}
		})
	})
	const validation = validateEngineWireRenderPlan(plan)
	if (!validation.ok) {
		return {
			status: 'rejected',
			code:
				validation.diagnostic === 'engine.unsupported-source'
					? 'UNSUPPORTED_SOURCE'
					: 'INVALID_PLAN',
			message: validation.message
		}
	}
	return { status: 'ready', plan: validation.value }
}
