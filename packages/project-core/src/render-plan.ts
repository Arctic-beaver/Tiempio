import { cloneAndFreeze } from './immutable.js'
import {
	enginePatchModelVersion,
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

export const renderPlanVersion = 5 as const

export interface RenderPlanMidiEvent {
	readonly durationTicks: number
	readonly id: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'midi-note'
	readonly velocity: number
}

export interface RenderPlanDrumEvent {
	readonly id: DrumEventId
	readonly instrument: DrumInstrument
	readonly swingTicks: number
	readonly startTick: number
	readonly type: 'drum-hit'
	readonly velocity: number
}

export type RenderPlanEvent = RenderPlanMidiEvent | RenderPlanDrumEvent

export interface RenderPlanLayer {
	readonly cycleTicks: number
	readonly events: readonly RenderPlanEvent[]
	readonly gain: number
	readonly id: LayerId
	readonly pan: number
	readonly songEnabled: boolean
	readonly source:
		| { readonly instrument: ResolvedSynthPatch; readonly type: 'synth' }
		| {
				readonly kitId: 'drums.clean-pulse'
				readonly kitRevision: 1
				readonly patch: ResolvedDrumKitPatch
				readonly type: 'drum'
		  }
}

export interface RenderPlanSongInstance {
	readonly durationTicks: number
	readonly id: SongInstanceId
	readonly sourceLayerId: LayerId
	readonly sourceOffsetTicks: number
	readonly startTick: number
}

export interface ProjectRenderPlan {
	readonly endTick: number
	readonly instances: readonly RenderPlanSongInstance[]
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

function layerEvents(layer: ProjectDocument['layers'][number]): readonly RenderPlanEvent[] {
	if (layer.material.kind === 'midi') {
		return layer.material.notes
			.map((note) => ({
				type: 'midi-note' as const,
				id: note.id,
				startTick: note.startTick,
				durationTicks: note.durationTicks,
				pitch: note.pitch,
				velocity: note.velocity
			}))
			.sort(eventOrder)
	}
	if (layer.material.kind === 'drum') {
		const material = layer.material
		const ticksPerStep = defaultTicksPerQuarter / material.pattern.stepsPerQuarter
		return material.events
			.map((event) => {
				const startTick = event.step * ticksPerStep
				return {
					type: 'drum-hit' as const,
					id: event.id,
					startTick,
					swingTicks:
						Math.floor(startTick / (engineTicksPerQuarter / 4)) % 2 === 1
							? Math.round((engineTicksPerQuarter / 4) * material.swing)
							: 0,
					instrument: event.instrument,
					velocity: event.velocity
				}
			})
			.sort(eventOrder)
	}
	return []
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
	for (const layer of playable.sort((left, right) => opaqueIdOrder(left.id, right.id))) {
		const events = layerEvents(layer)
		const authoredCycleTicks = layer.material.materialLengthTicks + layer.material.tailRestTicks
		const cycleTicks = authoredCycleTicks > 0 ? authoredCycleTicks : defaultTicksPerQuarter * 4
		if (layer.source.type === 'synth') {
			layers.push({
				id: layer.id,
				gain: layer.gain,
				pan: layer.pan,
				songEnabled: !layer.muted && (!hasSolo || layer.solo),
				cycleTicks,
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
			songEnabled: !layer.muted && (!hasSolo || layer.solo),
			cycleTicks,
			source: {
				type: 'drum',
				kitId: layer.source.kitId,
				kitRevision: layer.source.kitRevision,
				patch: layer.source.resolvedPatch
			},
			events
		})
	}
	const renderedLayerIds = new Set(layers.map((layer) => layer.id))
	const instances = validation.project.song.instances
		.filter((instance) => renderedLayerIds.has(instance.sourceLayerId))
		.map((instance) => ({
			id: instance.id,
			sourceLayerId: instance.sourceLayerId,
			startTick: instance.startTick,
			durationTicks: instance.durationTicks,
			sourceOffsetTicks: instance.sourceOffsetTicks
		}))
		.sort((left, right) => left.startTick - right.startTick || opaqueIdOrder(left.id, right.id))
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
			layers,
			instances
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
					songEnabled: layer.songEnabled,
					cycleTicks: layer.cycleTicks,
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
				songEnabled: layer.songEnabled,
				cycleTicks: layer.cycleTicks,
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
									swingTicks: event.swingTicks,
									instrument: event.instrument,
									velocity: event.velocity
								}
							]
						: []
				)
			}
		}),
		instances: projectPlan.instances
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
