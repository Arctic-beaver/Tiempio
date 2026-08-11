import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	executeResolvedCommand,
	resolveCommandState,
	resolveCommandStates,
	type CommandAvailabilityContext,
	type CommandHandlerMap
} from './command-availability.js'
import { commandDefinition, commandIds } from './command-registry.js'

const baseContext: CommandAvailabilityContext = Object.freeze({
	activeDrawer: null,
	canRedo: false,
	canUndo: false,
	engineAvailable: false,
	projectRevision: 0
})

const allHandlers: CommandHandlerMap = Object.freeze(
	Object.fromEntries(commandIds.map((commandId) => [commandId, () => undefined]))
)

describe('command availability', () => {
	it('keeps effect ownership and availability requirements explicit', () => {
		assert.deepEqual(commandDefinition('transport.toggle-playback'), {
			availability: 'engine',
			disabledReasonKey: 'command.disabled.engineUnavailable',
			effectOwner: 'engine',
			id: 'transport.toggle-playback',
			labelKey: 'transport.play',
			placements: ['transport'],
			scope: 'global',
			settingsGroup: 'transport',
			shortcuts: [{ code: 'Space' }]
		})
		assert.equal(commandDefinition('transport.toggle-loop').effectOwner, 'project')
		assert.equal(commandDefinition('studio.home').effectOwner, 'presentation')
	})

	it('resolves runtime, project, drawer and handler availability in one place', () => {
		const unavailable = resolveCommandStates(baseContext, allHandlers)
		assert.deepEqual(unavailable['transport.toggle-playback'], {
			available: false,
			disabledReasonKey: 'command.disabled.engineUnavailable',
			effectOwner: 'engine'
		})
		assert.equal(unavailable['transport.toggle-loop'].available, true)
		assert.equal(unavailable['layout.close-drawer'].available, false)
		assert.equal(unavailable['project.undo'].available, false)
		assert.equal(unavailable['project.redo'].available, false)

		const ready = resolveCommandStates(
			{
				activeDrawer: 'context',
				canRedo: true,
				canUndo: true,
				engineAvailable: true,
				projectRevision: 7
			},
			allHandlers
		)
		assert.equal(ready['transport.toggle-playback'].available, true)
		assert.equal(ready['layout.close-drawer'].available, true)
		assert.equal(ready['project.undo'].available, true)
		assert.equal(ready['project.redo'].available, true)
		assert.equal(
			resolveCommandState(
				'transport.toggle-loop',
				{ ...baseContext, projectRevision: null },
				true
			).disabledReasonKey,
			'command.disabled.projectUnavailable'
		)
	})

	it('keeps handlerless commands disabled after their requirement becomes available', () => {
		assert.deepEqual(
			resolveCommandState(
				'transport.toggle-playback',
				{ ...baseContext, engineAvailable: true },
				false
			),
			{
				available: false,
				disabledReasonKey: 'command.disabled.unavailable',
				effectOwner: 'engine'
			}
		)
	})

	it('uses the same executor gate for every command entry point', () => {
		let executions = 0
		const handlers = { 'transport.stop': () => (executions += 1) } as const
		const blocked = resolveCommandStates(baseContext, handlers)
		for (const entryPoint of ['visible-control', 'dom-shortcut', 'native-request']) {
			assert.equal(
				executeResolvedCommand('transport.stop', blocked, handlers),
				false,
				entryPoint
			)
		}
		assert.equal(executions, 0)

		const available = resolveCommandStates({ ...baseContext, engineAvailable: true }, handlers)
		assert.equal(executeResolvedCommand('transport.stop', available, handlers), true)
		assert.equal(executions, 1)
	})
})
