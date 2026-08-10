import type {
	DrumClip,
	LayerId,
	MidiClip,
	ProjectLayer,
	ProjectSessionSnapshot
} from '../../../../project-core/src/index.js'

export interface StudioProjectionContext {
	readonly activeLayer: ProjectLayer | null
	readonly drumClip: DrumClip | null
	readonly drumLayer: ProjectLayer | null
	readonly midiClip: MidiClip | null
	readonly project: ProjectSessionSnapshot['project']
	readonly revision: number
	readonly tonalLayer: ProjectLayer | null
}

function preferredLayer(
	layers: readonly ProjectLayer[],
	selectedLayerId: LayerId | null,
	predicate: (layer: ProjectLayer) => boolean = () => true
): ProjectLayer | null {
	const selected = layers.find((layer) => layer.id === selectedLayerId && predicate(layer))
	return selected ?? layers.find(predicate) ?? null
}

export function createProjectionContext(
	snapshot: ProjectSessionSnapshot,
	selectedLayerId: LayerId | null
): StudioProjectionContext {
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
	return {
		activeLayer,
		drumClip: drumLayer?.clips.find((clip): clip is DrumClip => clip.kind === 'drum') ?? null,
		drumLayer,
		midiClip: tonalLayer?.clips.find((clip): clip is MidiClip => clip.kind === 'midi') ?? null,
		project,
		revision,
		tonalLayer
	}
}
