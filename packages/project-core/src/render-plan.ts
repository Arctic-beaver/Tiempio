import { cloneAndFreeze } from './immutable.js'
import {
	enginePatchModelVersion,
	engineRenderPlanVersion,
	engineTicksPerQuarter,
	validateEngineWireRenderPlan,
	type EngineWireRenderPlan
} from '../../contracts/src/index.js'
import {
	defaultTicksPerQuarter,
	type ClipId,
	type DrumEventId,
	type DrumInstrument,
	type LayerId,
	type NoteId,
	type ProjectDocument,
	type ProjectId,
	type ProjectKey,
	type ProjectLoop,
	type ResolvedDrumKitPatchV2,
	type ResolvedSynthPatchV2
} from './model.js'
import { validateProjectDocument } from './validation.js'

export const renderPlanVersion = 1 as const

export interface RenderPlanMidiEvent {
	readonly clipId: ClipId
	readonly durationTicks: number
	readonly id: NoteId
	readonly pitch: number
	readonly startTick: number
	readonly type: 'midi-note'
	readonly velocity: number
}

export interface RenderPlanDrumEvent {
	readonly clipId: ClipId
	readonly id: DrumEventId
	readonly instrument: DrumInstrument
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
		| { readonly instrument: ResolvedSynthPatchV2; readonly type: 'synth' }
		| {
				readonly kitId: 'drums.clean-pulse'
				readonly kitRevision: 1
				readonly patch: ResolvedDrumKitPatchV2
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

function eventOrder(left: RenderPlanEvent, right: RenderPlanEvent): number {
	return left.startTick - right.startTick || opaqueIdOrder(left.id, right.id)
}

function opaqueIdOrder(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function layerEvents(layer: ProjectDocument['layers'][number]): readonly RenderPlanEvent[] {
	const events: RenderPlanEvent[] = []
	const clips = [...layer.clips].sort(
		(left, right) => left.startTick - right.startTick || opaqueIdOrder(left.id, right.id)
	)
	for (const clip of clips) {
		if (clip.kind === 'midi') {
			for (const note of clip.notes) {
				events.push({
					type: 'midi-note',
					id: note.id,
					clipId: clip.id,
					startTick: clip.startTick + note.startTick,
					durationTicks: note.durationTicks,
					pitch: note.pitch,
					velocity: note.velocity
				})
			}
		} else {
			const ticksPerStep = defaultTicksPerQuarter / clip.pattern.stepsPerQuarter
			for (const event of clip.events) {
				events.push({
					type: 'drum-hit',
					id: event.id,
					clipId: clip.id,
					startTick: clip.startTick + event.step * ticksPerStep,
					swing: clip.swing,
					instrument: event.instrument,
					velocity: event.velocity
				})
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
	const layers: RenderPlanLayer[] = playable
		.filter((layer) => !layer.muted && (!hasSolo || layer.solo))
		.sort((left, right) => opaqueIdOrder(left.id, right.id))
		.map((layer) => {
			if (layer.source.type === 'synth') {
				return {
					id: layer.id,
					gain: layer.gain,
					pan: layer.pan,
					source: { type: 'synth', instrument: layer.source.instrument.resolvedPatch },
					events: layerEvents(layer)
				}
			}
			if (layer.source.type === 'reference') {
				throw new TypeError('Reference layers cannot cross the render-plan boundary.')
			}
			return {
				id: layer.id,
				gain: layer.gain,
				pan: layer.pan,
				source: {
					type: 'drum',
					kitId: layer.source.kitId,
					kitRevision: layer.source.kitRevision,
					patch: layer.source.resolvedPatch
				},
				events: layerEvents(layer)
			}
		})
	const endTick = Math.max(
		validation.project.transport.loop.endTick,
		...validation.project.sections.map((section) => section.startTick + section.lengthTicks),
		...validation.project.transport.tempoMap.map((point) => point.tick + 1),
		...validation.project.transport.meterMap.map(
			(point) =>
				point.tick + (validation.project.transport.ticksPerQuarter * 4) / point.denominator
		),
		...validation.project.layers.flatMap((layer) =>
			layer.clips.map((clip) => clip.startTick + clip.lengthTicks)
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
	if (projectPlan.layers.some((layer) => layer.source.type !== 'synth')) {
		return {
			status: 'rejected',
			code: 'UNSUPPORTED_SOURCE',
			message: 'Stage 4 accepts only subtractive Bass layers.'
		}
	}
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
			if (layer.source.type !== 'synth') {
				throw new TypeError('Unsupported source crossed the Stage 4 wire-plan boundary.')
			}
			return {
				id: layer.id,
				gain: layer.gain,
				pan: layer.pan,
				source: {
					type: 'subtractive-bass' as const,
					patch: {
						patchModelVersion: enginePatchModelVersion,
						oscillator: {
							detuneCents: layer.source.instrument.oscillator.detuneCents,
							subLevel: layer.source.instrument.oscillator.subLevel
						},
						filter: layer.source.instrument.filter,
						amplifier: layer.source.instrument.amplifier,
						drive: layer.source.instrument.drive,
						stereoWidth: layer.source.instrument.stereoWidth,
						outputGain: layer.source.instrument.outputGain
					}
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
