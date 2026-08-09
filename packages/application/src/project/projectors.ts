import type { LocalizationKey } from '../../../localization/src/index.js'
import {
	cloneAndFreeze,
	defaultTicksPerQuarter,
	type BassMacroId,
	type ClipId,
	type DrumInstrument,
	type LayerId,
	type ProjectLayer,
	type ProjectSessionSnapshot,
	type SectionId
} from '../../../project-core/src/index.js'
import type { StudioViewId } from '../app/studio-state.js'
import type { ArrangementViewModel } from '../features/arrangement/view-model.js'
import type { DrumsViewModel } from '../features/drums/view-model.js'
import type { HomeViewModel } from '../features/home/view-model.js'
import type { PianoRollViewModel } from '../features/piano-roll/view-model.js'
import type { SoundSculptViewModel } from '../features/sound-sculpt/view-model.js'

export type LayerColor = 'blue' | 'coral' | 'gold' | 'violet'

export interface ProjectedLayerItem {
	readonly color: LayerColor
	readonly id: LayerId
	readonly labelKey: LocalizationKey
	readonly name: string
	readonly soundName: string
	readonly view: StudioViewId
}

export interface LayersProjection {
	readonly activeLayerId: LayerId | null
	readonly bpm: number
	readonly items: readonly ProjectedLayerItem[]
	readonly meter: string
	readonly projectTitle: string
	readonly revision: number
}

export interface ContextProjection {
	readonly energy: number
	readonly labelKey: LocalizationKey
	readonly layerId: LayerId | null
	readonly revision: number
	readonly soundEditable: boolean
	readonly soundName: string
}

export interface PianoRollProjection extends PianoRollViewModel {
	readonly clipId: ClipId | null
	readonly layerId: LayerId | null
	readonly revision: number
}

export interface DrumsProjection extends DrumsViewModel {
	readonly clipId: ClipId | null
	readonly layerId: LayerId | null
	readonly revision: number
}

export interface ArrangementProjection extends ArrangementViewModel {
	readonly revision: number
	readonly sectionIds: readonly SectionId[]
	readonly totalBars: number
}

export interface SoundSculptProjection extends SoundSculptViewModel {
	readonly layerId: LayerId | null
	readonly macroByDimension: Readonly<
		Record<'brightness' | 'movement' | 'space' | 'texture', BassMacroId>
	>
	readonly revision: number
}

export interface TransportProjection {
	readonly bpm: number
	readonly looping: boolean
	readonly revision: number
}

export interface StudioProjectProjections {
	readonly arrangement: ArrangementProjection
	readonly context: ContextProjection
	readonly drums: DrumsProjection
	readonly home: HomeViewModel & { readonly revision: number }
	readonly layers: LayersProjection
	readonly pianoRoll: PianoRollProjection
	readonly revision: number
	readonly sculpt: SoundSculptProjection
	readonly transport: TransportProjection
}

const rolePresentation: Readonly<
	Record<
		Exclude<ProjectLayer['role'], 'custom' | 'reference'>,
		{
			readonly color: LayerColor
			readonly labelKey: LocalizationKey
			readonly view: StudioViewId
		}
	>
> = Object.freeze({
	melody: { color: 'coral', labelKey: 'layers.melody', view: 'piano-roll' },
	harmony: { color: 'gold', labelKey: 'layers.chords', view: 'piano-roll' },
	bass: { color: 'blue', labelKey: 'layers.bass', view: 'piano-roll' },
	rhythm: { color: 'violet', labelKey: 'layers.drums', view: 'drums' }
})

const drumRows: readonly {
	readonly id: DrumInstrument
	readonly labelKey: LocalizationKey
}[] = Object.freeze([
	Object.freeze({ id: 'kick', labelKey: 'drums.kick' }),
	Object.freeze({ id: 'snare', labelKey: 'drums.snare' }),
	Object.freeze({ id: 'hat', labelKey: 'drums.hat' }),
	Object.freeze({ id: 'clap', labelKey: 'drums.clap' })
])

const macroByDimension = Object.freeze({
	brightness: 'brightness',
	movement: 'hardness',
	space: 'width',
	texture: 'dirt'
} as const satisfies Readonly<Record<string, BassMacroId>>)

function layerPresentation(
	layer: ProjectLayer
): (typeof rolePresentation)[keyof typeof rolePresentation] {
	if (layer.role === 'custom' || layer.role === 'reference') {
		return { color: 'blue', labelKey: 'layers.melody', view: 'piano-roll' }
	}
	return rolePresentation[layer.role]
}

function soundName(layer: ProjectLayer): string {
	if (layer.source.type === 'synth') return 'Deep'
	if (layer.source.type === 'drum') return 'Basic kit'
	return 'Reference'
}

function preferredLayer(
	layers: readonly ProjectLayer[],
	selectedLayerId: LayerId | null,
	predicate: (layer: ProjectLayer) => boolean = () => true
): ProjectLayer | null {
	const selected = layers.find((layer) => layer.id === selectedLayerId && predicate(layer))
	return selected ?? layers.find(predicate) ?? null
}

function noteName(pitch: number): string {
	const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
	return `${names[pitch % 12] ?? 'C'}${String(Math.floor(pitch / 12) - 1)}`
}

function pianoPitches(layer: ProjectLayer | null): readonly number[] {
	const base = layer?.role === 'bass' ? 36 : 60
	return [base + 12, base + 11, base + 9, base + 7, base + 5, base + 4, base + 2, base]
}

function sectionPresentation(index: number): {
	labelKey: LocalizationKey
	tone: 'fade' | 'full' | 'open' | 'quiet'
} {
	const presentations = [
		{ labelKey: 'arrangement.intro', tone: 'quiet' },
		{ labelKey: 'arrangement.main', tone: 'full' },
		{ labelKey: 'arrangement.break', tone: 'open' },
		{ labelKey: 'arrangement.outro', tone: 'fade' }
	] as const
	return presentations[index] ?? presentations[1]
}

export function projectStudio(
	snapshot: ProjectSessionSnapshot,
	selectedLayerId: LayerId | null
): StudioProjectProjections {
	const { project, revision } = snapshot
	const activeLayer = preferredLayer(project.layers, selectedLayerId)
	const tonalLayer = preferredLayer(
		project.layers,
		selectedLayerId,
		(layer) => layer.source.type === 'synth'
	)
	const drumLayer = preferredLayer(
		project.layers,
		selectedLayerId,
		(layer) => layer.source.type === 'drum'
	)
	const midiClip = tonalLayer?.clips.find((clip) => clip.kind === 'midi') ?? null
	const drumClip = drumLayer?.clips.find((clip) => clip.kind === 'drum') ?? null
	const pitches = pianoPitches(tonalLayer)
	const instrument = tonalLayer?.source.type === 'synth' ? tonalLayer.source.instrument : null

	return cloneAndFreeze({
		revision,
		home: {
			revision,
			recentPieces: [
				{
					id: project.projectId,
					name: project.title,
					bpm: project.transport.tempoMap[0]?.bpm ?? 108,
					layerCount: project.layers.length
				}
			]
		},
		layers: {
			revision,
			activeLayerId: activeLayer?.id ?? null,
			projectTitle: project.title,
			bpm: project.transport.tempoMap[0]?.bpm ?? 108,
			meter: `${String(project.transport.meterMap[0]?.numerator ?? 4)}/${String(project.transport.meterMap[0]?.denominator ?? 4)}`,
			items: project.layers
				.filter((layer) => layer.role !== 'reference')
				.map((layer) => ({
					id: layer.id,
					name: layer.name,
					soundName: soundName(layer),
					...layerPresentation(layer)
				}))
		},
		context: {
			revision,
			layerId: activeLayer?.id ?? null,
			labelKey:
				activeLayer === null ? 'context.noLayer' : layerPresentation(activeLayer).labelKey,
			soundName: activeLayer === null ? '—' : soundName(activeLayer),
			soundEditable: activeLayer?.source.type === 'synth',
			energy: activeLayer === null ? 0 : Math.round((activeLayer.gain / 2) * 100)
		},
		pianoRoll: {
			revision,
			layerId: tonalLayer?.id ?? null,
			clipId: midiClip?.id ?? null,
			bars:
				midiClip === null
					? 4
					: Math.max(1, midiClip.lengthTicks / (defaultTicksPerQuarter * 4)),
			pitches: pitches.map(noteName),
			notes:
				midiClip?.kind === 'midi'
					? midiClip.notes.flatMap((note) => {
							const row = pitches.indexOf(note.pitch)
							return row < 0
								? []
								: [
										{
											id: note.id,
											pitch: noteName(note.pitch),
											row,
											beat: note.startTick / (defaultTicksPerQuarter / 2),
											duration:
												note.durationTicks / (defaultTicksPerQuarter / 2)
										}
									]
						})
					: []
		},
		drums: {
			revision,
			layerId: drumLayer?.id ?? null,
			clipId: drumClip?.id ?? null,
			stepCount: drumClip?.kind === 'drum' ? drumClip.pattern.stepCount : 16,
			rows: drumRows.map((row) => ({
				...row,
				activeSteps:
					drumClip?.kind === 'drum'
						? drumClip.events
								.filter((event) => event.instrument === row.id)
								.map((event) => event.step)
								.sort((left, right) => left - right)
						: []
			}))
		},
		arrangement: {
			revision,
			totalBars: project.sections.reduce(
				(maximum, section) =>
					Math.max(
						maximum,
						(section.startTick + section.lengthTicks) / (defaultTicksPerQuarter * 4)
					),
				0
			),
			sectionIds: project.sections.map((section) => section.id),
			sections: project.sections.map((section, index) => ({
				id: section.id,
				bars: section.lengthTicks / (defaultTicksPerQuarter * 4),
				...sectionPresentation(index)
			})),
			layers: project.layers
				.filter((layer) => layer.role !== 'reference')
				.map((layer) => ({
					id: layer.id,
					labelKey: layerPresentation(layer).labelKey,
					color: layerPresentation(layer).color,
					sections: layer.clips.flatMap((clip) =>
						clip.sectionId === null ? [] : [clip.sectionId]
					)
				}))
		},
		sculpt: {
			revision,
			layerId: tonalLayer?.id ?? null,
			soundName: instrument?.presetId === 'bass.deep' ? 'Deep' : '—',
			macroByDimension,
			dimensions: [
				{
					id: 'brightness',
					labelKey: 'sculpt.brightness',
					value: Math.round((instrument?.macros.brightness ?? 0) * 100)
				},
				{
					id: 'movement',
					labelKey: 'sculpt.movement',
					value: Math.round((instrument?.macros.hardness ?? 0) * 100)
				},
				{
					id: 'space',
					labelKey: 'sculpt.space',
					value: Math.round((instrument?.macros.width ?? 0) * 100)
				},
				{
					id: 'texture',
					labelKey: 'sculpt.texture',
					value: Math.round((instrument?.macros.dirt ?? 0) * 100)
				}
			]
		},
		transport: {
			revision,
			bpm: project.transport.tempoMap[0]?.bpm ?? 108,
			looping: project.transport.loop.enabled
		}
	})
}
