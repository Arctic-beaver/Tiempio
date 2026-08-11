import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { songPalette } from '../../../../music-theory/src/index.js'
import {
	advanceSoundWaveFrame,
	idleSoundWaveFrame,
	soundDemoProgram,
	soundWaveGeometry,
	soundWavePath,
	soundWaveShouldAnimate,
	targetSoundWaveEnergy
} from './sound-demo-model.js'
import { SoundWaveAnimator, type SoundWaveAnimationScheduler } from './sound-wave-animator.js'

describe('sound demo and reactive wave model', () => {
	it('keeps the demo bounded and on the visible compact keyboard', () => {
		for (const mode of ['major', 'minor'] as const) {
			for (let tonic = 0; tonic < 12; tonic += 1) {
				const palette = songPalette({ mode, tonic })
				for (let rotation = 0; rotation < 7; rotation += 1) {
					const events = soundDemoProgram(palette, 2, rotation)
					assert.equal(events.length, 8)
					assert.ok(events.every((event) => event.offsetMs + event.durationMs <= 3_500))
					const visiblePitches = new Set(
						events.slice(0, 7).map((event) => event.pitches[0])
					)
					assert.ok(
						events.every((event) =>
							event.pitches.every((pitch) => visiblePitches.has(pitch))
						)
					)
				}
			}
		}
	})

	it('clamps hostile meter input and produces finite bounded paths', () => {
		for (const frame of [
			idleSoundWaveFrame,
			{ energy: 1, phase: Math.PI },
			{ energy: Number.POSITIVE_INFINITY, phase: Number.NaN }
		]) {
			const geometry = soundWaveGeometry(frame)
			for (const points of [geometry.primary, geometry.secondary]) {
				assert.equal(points.length, 33)
				assert.ok(
					points.every(
						(point) =>
							Number.isFinite(point.x) &&
							Number.isFinite(point.y) &&
							point.x >= 0 &&
							point.x <= 800 &&
							point.y >= 4 &&
							point.y <= 96
					)
				)
				assert.doesNotMatch(soundWavePath(points), /NaN|Infinity/u)
			}
		}
		assert.equal(targetSoundWaveEnergy({ leftPeak: Number.NaN, rightPeak: 4 }, false, true), 1)
		assert.equal(targetSoundWaveEnergy({ leftPeak: 1, rightPeak: 1 }, true, false), 0)
	})

	it('uses a release tail and stops scheduling once settled or hidden', () => {
		const attack = advanceSoundWaveFrame(idleSoundWaveFrame, 1, 16)
		const release = advanceSoundWaveFrame(attack, 0, 16)
		assert.ok(attack.energy > 0)
		assert.ok(release.energy > 0 && release.energy < attack.energy)
		assert.equal(
			soundWaveShouldAnimate({
				available: true,
				currentEnergy: release.energy,
				reducedMotion: false,
				targetEnergy: 0,
				visible: true
			}),
			true
		)
		assert.equal(
			soundWaveShouldAnimate({
				available: true,
				currentEnergy: 1,
				reducedMotion: false,
				targetEnergy: 1,
				visible: false
			}),
			false
		)
		assert.equal(
			soundWaveShouldAnimate({
				available: true,
				currentEnergy: 1,
				reducedMotion: true,
				targetEnergy: 1,
				visible: true
			}),
			false
		)
	})

	it('owns at most one frame request and cancels it when hidden or reduced', () => {
		const callbacks = new Map<number, (timestamp: number) => void>()
		const canceled: number[] = []
		let sequence = 0
		const scheduler: SoundWaveAnimationScheduler = {
			cancel: (requestId) => {
				canceled.push(requestId)
				callbacks.delete(requestId)
			},
			request: (callback) => {
				sequence += 1
				callbacks.set(sequence, callback)
				return sequence
			}
		}
		const animator = new SoundWaveAnimator(scheduler)
		animator.update({ available: true, reducedMotion: false, targetEnergy: 1, visible: true })
		animator.update({ available: true, reducedMotion: false, targetEnergy: 0.8, visible: true })
		assert.equal(callbacks.size, 1)
		callbacks.get(1)?.(16)
		assert.equal(callbacks.size, 2)
		callbacks.delete(1)
		animator.update({ available: true, reducedMotion: false, targetEnergy: 0, visible: false })
		assert.deepEqual(canceled, [2])
		assert.deepEqual(animator.getSnapshot(), idleSoundWaveFrame)
		animator.update({ available: true, reducedMotion: true, targetEnergy: 1, visible: true })
		assert.equal(callbacks.size, 0)
		animator.dispose()
	})
})
