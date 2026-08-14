import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layerId, projectId } from '../../../../project-core/src/index.js'
import { LayerCreationCoordinator } from './layer-creation-coordinator.js'
import { commandsForLayerCreation } from './layer-creation-transaction.js'

const performance = Object.freeze({
	key: Object.freeze({ tonic: 2, mode: 'minor' as const }),
	octave: 3
})

describe('LayerCreationCoordinator', () => {
	it('owns one bounded non-canonical draft and resumes it without duplication', () => {
		let releases = 0
		const coordinator = new LayerCreationCoordinator({
			onAuditionInvalidated: () => (releases += 1)
		})
		const first = coordinator.openOrFocus({
			projectId: projectId('project.one'),
			originSourceLayerId: layerId('layer.existing')
		})
		assert.match(first.draftId, /^draft\.layer:/u)
		assert.equal(first.step, 'choosing-role')
		const chosen = coordinator.chooseRole({
			role: 'bass',
			displayName: 'New Bass',
			performance
		})
		assert.equal(chosen.step, 'choosing-sound')
		assert.equal(chosen.synthPresetId, 'bass.deep')
		coordinator.setSynthMacro('brightness', 0.25)
		assert.equal(coordinator.getSnapshot().draft?.semanticMacros?.brightness, 0.25)
		assert.equal(coordinator.suspend(), true)
		assert.equal(coordinator.getSnapshot().draft?.suspended, true)

		const focused = coordinator.openOrFocus({
			projectId: projectId('project.one'),
			originSourceLayerId: null
		})
		assert.equal(focused.draftId, first.draftId)
		assert.equal(focused.suspended, false)
		assert.equal(focused.semanticMacros?.brightness, 0.25)
		assert.equal(releases, 2)
	})

	it('keeps synth choices bounded and invalidates ownership on project replacement', () => {
		let releases = 0
		const coordinator = new LayerCreationCoordinator({
			onAuditionInvalidated: () => (releases += 1)
		})
		coordinator.openOrFocus({
			projectId: projectId('project.one'),
			originSourceLayerId: null
		})
		coordinator.chooseRole({
			role: 'chords',
			displayName: '  New Chords  ',
			performance
		})
		assert.equal(coordinator.getSnapshot().draft?.displayName, 'New Chords')
		assert.equal(coordinator.getSnapshot().draft?.synthPresetId, 'pad.warm')
		coordinator.selectSynthPreset('pluck.wood')
		const ready = coordinator.completePerformance({
			key: { tonic: 7, mode: 'major' },
			octave: 4
		})
		assert.equal(ready.step, 'ready')
		assert.equal(ready.performance?.octave, 4)
		assert.equal(coordinator.invalidateForProject(projectId('project.two')), true)
		assert.equal(coordinator.getSnapshot().draft, null)
		assert.equal(releases, 4)
	})

	it('keeps drums empty and cancel free of canonical side effects', () => {
		const coordinator = new LayerCreationCoordinator()
		coordinator.openOrFocus({
			projectId: projectId('project.drums'),
			originSourceLayerId: null
		})
		const drums = coordinator.chooseRole({
			role: 'drums',
			displayName: 'New Drums',
			performance
		})
		assert.equal(drums.step, 'ready')
		assert.equal(drums.synthPresetId, null)
		assert.equal(drums.semanticMacros, null)
		assert.equal(drums.performance, null)
		assert.equal(coordinator.cancel(), true)
		assert.equal(coordinator.cancel(), false)
	})

	it('builds only final canonical intent and never leaks the draft identity', () => {
		const coordinator = new LayerCreationCoordinator()
		coordinator.openOrFocus({
			projectId: projectId('project.commit'),
			originSourceLayerId: null
		})
		coordinator.chooseRole({
			role: 'bass',
			displayName: 'New Bass',
			performance
		})
		coordinator.setSynthMacro('dirt', 0.42)
		const ready = coordinator.completePerformance(performance)
		const commands = commandsForLayerCreation(ready, 7, layerId('layer.final'))
		assert.equal(commands.length, 1)
		assert.equal(commands[0]?.type, 'layer.add')
		if (commands[0]?.type !== 'layer.add') throw new Error('Expected a layer add command.')
		assert.equal(commands[0].baseRevision, 7)
		assert.equal(commands[0].id, 'layer.final')
		assert.equal(commands[0].synth?.macros.dirt, 0.42)
		assert.equal(JSON.stringify(commands).includes(ready.draftId), false)
	})
})
