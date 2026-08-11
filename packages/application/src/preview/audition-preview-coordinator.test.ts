import { deepStrictEqual, equal } from 'node:assert'
import { describe, it } from 'node:test'

import { AuditionPreviewCoordinator } from './audition-preview-coordinator.js'

describe('AuditionPreviewCoordinator', () => {
	it('keeps preview kinds mutually exclusive and ignores stale engine events', () => {
		const commands: string[] = []
		const coordinator = new AuditionPreviewCoordinator({
			cancel: (previewId) => commands.push(`cancel:${previewId}`),
			start: ({ previewId }) => {
				commands.push(`start:${previewId}`)
				return true
			}
		})
		const palette = coordinator.start('palette', 'layer.bass', [
			{ durationMs: 120, offsetMs: 0, pitches: [57], velocity: 100 }
		])
		const chord = coordinator.start('chord', 'layer.bass', [
			{ durationMs: 120, offsetMs: 0, pitches: [57, 60, 64], velocity: 100 }
		])

		equal(palette, 'preview-palette-1')
		equal(chord, 'preview-chord-2')
		deepStrictEqual(commands, [
			'start:preview-palette-1',
			'cancel:preview-palette-1',
			'start:preview-chord-2'
		])
		equal(coordinator.acceptEnded('preview-palette-1'), false)
		equal(coordinator.getSnapshot().previewId, 'preview-chord-2')
	})

	it('projects only confirmed engine pitch state and clears it on interruption', () => {
		const commands: string[] = []
		const coordinator = new AuditionPreviewCoordinator({
			cancel: (previewId) => commands.push(`cancel:${previewId}`),
			start: () => true
		})
		const previewId = coordinator.start('sound', 'layer.bass', [
			{ durationMs: 200, offsetMs: 0, pitches: [45], velocity: 100 }
		])
		if (previewId === null) throw new Error('preview should be accepted')

		deepStrictEqual(coordinator.getSnapshot().pitches, [])
		coordinator.acceptStarted(previewId)
		coordinator.acceptState(previewId, [45, 52], true)
		deepStrictEqual(coordinator.getSnapshot().pitches, [45, 52])
		coordinator.acceptState(previewId, [45], true)
		coordinator.acceptState(previewId, [45], false)
		deepStrictEqual(coordinator.getSnapshot().pitches, [45, 52])
		coordinator.acceptState(previewId, [45], false)
		deepStrictEqual(coordinator.getSnapshot().pitches, [52])
		equal(coordinator.interrupt(), true)
		deepStrictEqual(coordinator.getSnapshot().pitches, [])
		deepStrictEqual(commands, [`cancel:${previewId}`])
	})

	it('does not expose a preview when the sink rejects it', () => {
		const coordinator = new AuditionPreviewCoordinator({
			cancel: () => undefined,
			start: () => false
		})
		equal(
			coordinator.start('palette', 'layer.bass', [
				{ durationMs: 100, offsetMs: 0, pitches: [60], velocity: 100 }
			]),
			null
		)
		equal(coordinator.getSnapshot().active, false)
	})
})
