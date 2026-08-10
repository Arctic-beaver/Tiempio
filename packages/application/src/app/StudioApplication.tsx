import { useCallback, useMemo, useState, type JSX } from 'react'
import { useLocalization } from '../../../localization/src/index.js'
import {
	clipId,
	createDrumClip,
	createDrumEvent,
	createMidiClip,
	createMidiNote,
	defaultTicksPerQuarter,
	layerId,
	noteId,
	sectionId,
	type DrumInstrument,
	type ProjectRole
} from '../../../project-core/src/index.js'
import { CommandProvider } from '../commands/CommandProvider.js'
import { useCommands } from '../commands/CommandContext.js'
import { commandForView, type CommandId } from '../commands/command-registry.js'
import { ArrangementView } from '../features/arrangement/ArrangementView.js'
import { DrumsView } from '../features/drums/DrumsView.js'
import { FirstLayerView } from '../features/first-layer/FirstLayerView.js'
import type { LayerRoleViewModel } from '../features/first-layer/view-model.js'
import { HomeView } from '../features/home/HomeView.js'
import { PianoRollView } from '../features/piano-roll/PianoRollView.js'
import { SoundChooserView } from '../features/sound-chooser/SoundChooserView.js'
import { soundChooserViewModel } from '../features/sound-chooser/view-model.js'
import { SoundSculptView } from '../features/sound-sculpt/SoundSculptView.js'
import type { SculptDimensionViewModel } from '../features/sound-sculpt/view-model.js'
import { useApplicationRuntime } from '../providers/RuntimeContext.js'
import { useProjectSession } from '../project/ProjectSessionContext.js'
import { StudioShell } from '../shell/StudioShell.js'
import {
	initialStudioNavigationState,
	type StudioDrawer,
	type StudioViewId
} from './studio-state.js'

const deepSoundChooserModel = Object.freeze({
	sounds: Object.freeze(soundChooserViewModel.sounds.filter((sound) => sound.id === 'low-ember'))
})

const roleMap: Readonly<Record<LayerRoleViewModel['id'], ProjectRole>> = Object.freeze({
	melody: 'melody',
	chords: 'harmony',
	bass: 'bass',
	drums: 'rhythm'
})

export function StudioApplication(): JSX.Element {
	const runtime = useApplicationRuntime()
	const projectSession = useProjectSession()
	const [navigation, setNavigation] = useState(initialStudioNavigationState)
	const navigate = useCallback((activeView: StudioViewId): void => {
		setNavigation({ activeView, activeDrawer: null })
	}, [])
	const openDrawer = useCallback((activeDrawer: Exclude<StudioDrawer, null>): void => {
		setNavigation((current) => ({ ...current, activeDrawer }))
	}, [])
	const closeDrawer = useCallback((): void => {
		setNavigation((current) => ({ ...current, activeDrawer: null }))
	}, [])
	const handlers = useMemo<Readonly<Partial<Record<CommandId, () => void>>>>(
		() => ({
			'studio.home': () => navigate('home'),
			'studio.first-layer': () => navigate('first-layer'),
			'studio.sound-chooser': () => navigate('sound-chooser'),
			'studio.piano-roll': () => navigate('piano-roll'),
			'studio.drums': () => navigate('drums'),
			'studio.arrangement': () => navigate('arrangement'),
			'studio.sound-sculpt': () => navigate('sound-sculpt'),
			'transport.toggle-loop': () => {
				const snapshot = projectSession.getSnapshot()
				const loop = snapshot.project.transport.loop
				projectSession.dispatch({
					type: 'transport.loop.set',
					baseRevision: snapshot.revision,
					enabled: !loop.enabled,
					startTick: loop.startTick,
					endTick: loop.endTick
				})
			},
			'layout.open-navigation': () => openDrawer('navigation'),
			'layout.open-context': () => openDrawer('context'),
			'layout.close-drawer': closeDrawer
		}),
		[closeDrawer, navigate, openDrawer, projectSession]
	)
	const commandAvailability = useMemo(
		() => ({
			activeDrawer: navigation.activeDrawer,
			engineAvailable: runtime.engine.availability === 'available',
			projectRevision: projectSession.snapshot.revision
		}),
		[navigation.activeDrawer, projectSession.snapshot.revision, runtime.engine]
	)

	return (
		<CommandProvider
			availability={commandAvailability}
			handlers={handlers}
			looping={projectSession.projections.transport.looping}
		>
			<StudioShell
				activeDrawer={navigation.activeDrawer}
				activeView={navigation.activeView}
				target={runtime.target}
			>
				<ActiveStudioView activeView={navigation.activeView} />
			</StudioShell>
		</CommandProvider>
	)
}

interface ActiveStudioViewProperties {
	readonly activeView: StudioViewId
}

function ActiveStudioView({ activeView }: ActiveStudioViewProperties): JSX.Element {
	const { execute } = useCommands()
	const { t } = useLocalization()
	const projectSession = useProjectSession()
	const { projections } = projectSession
	const navigate = (view: StudioViewId): void => {
		execute(commandForView(view))
	}
	const chooseLayer = (choice: LayerRoleViewModel['id']): void => {
		const snapshot = projectSession.getSnapshot()
		const id = layerId(projectSession.nextId('layer.ui'))
		projectSession.dispatch({
			type: 'layer.add',
			baseRevision: snapshot.revision,
			id,
			name: t(`firstLayer.${choice}`),
			role: roleMap[choice]
		})
		projectSession.selectLayer(id)
		navigate(choice === 'drums' ? 'drums' : 'sound-chooser')
	}
	const chooseSound = (): void => {
		const snapshot = projectSession.getSnapshot()
		const selected = projectSession.selectedLayerId
		if (selected !== null) {
			projectSession.dispatch({
				type: 'layer.character.select',
				baseRevision: snapshot.revision,
				layerId: selected,
				presetId: 'bass.deep'
			})
		}
		navigate('piano-roll')
	}
	const addNote = (): void => {
		const layer = projections.pianoRoll.layerId
		if (layer === null) return
		let snapshot = projectSession.getSnapshot()
		let targetClipId = projections.pianoRoll.clipId
		if (targetClipId === null) {
			targetClipId = clipId(projectSession.nextId('clip.midi.ui'))
			snapshot = projectSession.dispatch({
				type: 'clip.place',
				baseRevision: snapshot.revision,
				layerId: layer,
				clip: createMidiClip({
					id: targetClipId,
					startTick: 0,
					lengthTicks: defaultTicksPerQuarter * 16
				})
			})
		}
		const layerState = snapshot.project.layers.find((candidate) => candidate.id === layer)
		const pitch = layerState?.role === 'bass' ? 48 : 72
		projectSession.dispatch({
			type: 'note.add',
			baseRevision: snapshot.revision,
			layerId: layer,
			clipId: targetClipId,
			note: createMidiNote({
				id: projectSession.nextId('note.ui'),
				pitch,
				startTick:
					((projections.pianoRoll.notes.length * 2) % 15) * (defaultTicksPerQuarter / 2),
				durationTicks: defaultTicksPerQuarter / 2
			})
		})
	}
	const deleteNote = (id: string): void => {
		const { layerId: layer, clipId: clip } = projections.pianoRoll
		if (layer === null || clip === null) return
		const snapshot = projectSession.getSnapshot()
		projectSession.dispatch({
			type: 'note.delete',
			baseRevision: snapshot.revision,
			layerId: layer,
			clipId: clip,
			noteId: noteId(id)
		})
	}
	const toggleDrumStep = (instrument: DrumInstrument, step: number): void => {
		const layer = projections.drums.layerId
		if (layer === null) return
		let snapshot = projectSession.getSnapshot()
		let targetClipId = projections.drums.clipId
		if (targetClipId === null) {
			targetClipId = clipId(projectSession.nextId('clip.drums.ui'))
			snapshot = projectSession.dispatch({
				type: 'clip.place',
				baseRevision: snapshot.revision,
				layerId: layer,
				clip: createDrumClip({
					id: targetClipId,
					startTick: 0,
					lengthTicks: defaultTicksPerQuarter * 4
				})
			})
		}
		projectSession.dispatch({
			type: 'drum-event.toggle',
			baseRevision: snapshot.revision,
			layerId: layer,
			clipId: targetClipId,
			eventWhenAdded: createDrumEvent({
				id: projectSession.nextId('event.drums.ui'),
				instrument,
				step
			})
		})
	}
	const toggleArrangementCell = (
		layerValue: string,
		sectionValue: string,
		active: boolean
	): void => {
		const snapshot = projectSession.getSnapshot()
		const layer = snapshot.project.layers.find((candidate) => candidate.id === layerValue)
		const section = snapshot.project.sections.find((candidate) => candidate.id === sectionValue)
		if (layer === undefined || section === undefined) return
		const existing = layer.clips.find((clip) => clip.sectionId === section.id)
		if (active && existing !== undefined) {
			projectSession.dispatch({
				type: 'clip.delete',
				baseRevision: snapshot.revision,
				layerId: layer.id,
				clipId: existing.id
			})
			return
		}
		if (active) return
		const id = clipId(projectSession.nextId('clip.arrangement.ui'))
		projectSession.dispatch({
			type: 'clip.place',
			baseRevision: snapshot.revision,
			layerId: layer.id,
			clip:
				layer.source.type === 'drum'
					? createDrumClip({
							id,
							startTick: section.startTick,
							lengthTicks: section.lengthTicks,
							sectionId: sectionId(sectionValue)
						})
					: createMidiClip({
							id,
							startTick: section.startTick,
							lengthTicks: section.lengthTicks,
							sectionId: sectionId(sectionValue)
						})
		})
	}
	const commitMacro = (dimension: SculptDimensionViewModel['id'], value: number): void => {
		const layer = projections.sculpt.layerId
		if (layer === null) return
		const snapshot = projectSession.getSnapshot()
		projectSession.dispatch({
			type: 'layer.macro.commit',
			baseRevision: snapshot.revision,
			layerId: layer,
			macro: projections.sculpt.macroByDimension[dimension],
			value: value / 100
		})
	}

	if (activeView === 'home') {
		return (
			<HomeView
				model={projections.home}
				onCreate={() => {
					projectSession.createNewProject(t('home.untitledProject'))
					navigate('first-layer')
				}}
			/>
		)
	}
	if (activeView === 'first-layer') return <FirstLayerView onChoose={chooseLayer} />
	if (activeView === 'sound-chooser') {
		return (
			<SoundChooserView
				model={deepSoundChooserModel}
				onBack={() => navigate('first-layer')}
				onChoose={chooseSound}
			/>
		)
	}
	if (activeView === 'piano-roll') {
		return (
			<PianoRollView
				model={projections.pianoRoll}
				onAddNote={addNote}
				onDeleteNote={deleteNote}
			/>
		)
	}
	if (activeView === 'drums') {
		return <DrumsView model={projections.drums} onToggleStep={toggleDrumStep} />
	}
	if (activeView === 'arrangement') {
		return (
			<ArrangementView
				model={projections.arrangement}
				onToggleCell={toggleArrangementCell}
				totalBars={projections.arrangement.totalBars}
			/>
		)
	}
	return <SoundSculptView model={projections.sculpt} onCommit={commitMacro} />
}
