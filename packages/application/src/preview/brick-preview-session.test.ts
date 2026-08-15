import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	BrickPreviewSession,
	interpolateBrickPreviewCursor,
	type BrickPreviewSessionSink
} from './brick-preview-session.js'

function harness(): {
	readonly commands: Array<{ readonly type: string; readonly payload: unknown }>
	readonly session: BrickPreviewSession
} {
	const commands: Array<{ readonly type: string; readonly payload: unknown }> = []
	const sink: BrickPreviewSessionSink = {
		start: (payload) => {
			commands.push({ type: 'start', payload })
			return true
		},
		stop: (payload) => commands.push({ type: 'stop', payload }),
		setSourceEnabled: (payload) => commands.push({ type: 'enable', payload }),
		seekSource: (payload) => commands.push({ type: 'seek', payload })
	}
	return { commands, session: new BrickPreviewSession(sink) }
}

describe('BrickPreviewSession', () => {
	it('starts unequal sources together and accepts only revision-bound cursor sequences', () => {
		const { session } = harness()
		assert.equal(session.start(7, ['layer.drums', 'layer.bass']), true)
		assert.equal(session.acceptStarted(1, 7), true)
		assert.equal(
			session.acceptCursor(
				{
					sourceLayerId: 'layer.bass',
					previewGeneration: 1,
					running: true,
					localTick: 480,
					cycleIteration: 2,
					engineFrame: 24_000,
					renderPlanRevision: 7
				},
				12
			),
			true
		)
		assert.equal(
			session.acceptCursor(
				{
					sourceLayerId: 'layer.bass',
					previewGeneration: 1,
					running: true,
					localTick: 960,
					cycleIteration: 2,
					engineFrame: 48_000,
					renderPlanRevision: 6
				},
				13
			),
			false
		)
		assert.equal(session.getSnapshot().cursors[0]?.localTick, 480)
	})

	it('late-enables at zero, disables locally, and re-enables with a fresh zero cursor', () => {
		const { commands, session } = harness()
		assert.equal(session.start(3, ['layer.drums']), true)
		session.acceptStarted(1, 3)
		assert.equal(session.setSourceEnabled('layer.bass', true), true)
		assert.deepEqual(commands.at(-1), {
			type: 'enable',
			payload: {
				previewGeneration: 1,
				sourceLayerId: 'layer.bass',
				enabled: true
			}
		})
		session.acceptCursor(
			{
				sourceLayerId: 'layer.bass',
				previewGeneration: 1,
				running: true,
				localTick: 0,
				cycleIteration: 0,
				engineFrame: 100,
				renderPlanRevision: 3
			},
			5
		)
		assert.equal(session.setSourceEnabled('layer.bass', false), true)
		assert.equal(session.getSnapshot().cursors.length, 0)
		assert.equal(session.setSourceEnabled('layer.bass', true), true)
		assert.equal(session.getSnapshot().cursors.length, 0)
	})

	it('suspends and seeks only the requested source while preserving its iteration', () => {
		const { commands, session } = harness()
		session.start(9, ['layer.bass', 'layer.drums'])
		session.acceptStarted(1, 9)
		session.acceptCursor(
			{
				sourceLayerId: 'layer.bass',
				previewGeneration: 1,
				running: true,
				localTick: 720,
				cycleIteration: 4,
				engineFrame: 3_000,
				renderPlanRevision: 9
			},
			20
		)
		assert.equal(session.suspendSource('layer.bass'), true)
		assert.deepEqual(commands.at(-1), {
			type: 'seek',
			payload: {
				previewGeneration: 1,
				sourceLayerId: 'layer.bass',
				localTick: 720,
				cycleIteration: 4,
				running: false
			}
		})
	})

	it('interpolates only from a trusted running engine-frame snapshot', () => {
		const cursor = {
			sourceLayerId: 'layer.bass',
			previewGeneration: 2,
			running: true,
			localTick: 120,
			cycleIteration: 1,
			engineFrame: 1_000,
			renderPlanRevision: 8,
			sequence: 40
		} as const
		assert.deepEqual(
			interpolateBrickPreviewCursor(cursor, 1_480, (tick, iteration, frames) => ({
				localTick: tick + frames,
				cycleIteration: iteration
			})),
			{ localTick: 600, cycleIteration: 1 }
		)
	})
})
