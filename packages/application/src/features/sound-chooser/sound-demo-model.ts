import type { EnginePreviewEvent } from '../../../../contracts/src/index.js'
import { performanceMapping, type SongPalette } from '../../../../music-theory/src/index.js'

export interface SoundWaveFrame {
	readonly energy: number
	readonly phase: number
}

export interface SoundWaveMeter {
	readonly leftPeak: number
	readonly rightPeak: number
}

export interface SoundWavePoint {
	readonly x: number
	readonly y: number
}

export interface SoundWaveGeometry {
	readonly primary: readonly SoundWavePoint[]
	readonly secondary: readonly SoundWavePoint[]
}

export const idleSoundWaveFrame: SoundWaveFrame = Object.freeze({ energy: 0, phase: 0 })

const tau = Math.PI * 2
const waveWidth = 800
const waveCenter = 50
const wavePointCount = 33

function unit(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(1, Math.max(0, value))
}

function boundedY(value: number): number {
	return Math.min(96, Math.max(4, value))
}

export function soundDemoProgram(
	palette: SongPalette,
	octave: number,
	rotation: number
): readonly EnginePreviewEvent[] {
	const mapping = performanceMapping(palette, {
		layout: 'compact',
		rotation,
		tonicMidi: (octave + 1) * 12 + palette.tonic
	})
	const phraseOrder = [0, 2, 4, 6, 4, 2, 0] as const
	const phrase = phraseOrder.map((index, step) =>
		Object.freeze({
			durationMs: 260,
			offsetMs: step * 310,
			pitches: Object.freeze([mapping[index]?.midi ?? mapping[0]?.midi ?? 0]),
			velocity: step === 3 ? 108 : 100
		})
	)
	const resolvedChord = Object.freeze(
		[0, 2, 4].map((index) => mapping[index]?.midi ?? mapping[0]?.midi ?? 0)
	)
	return Object.freeze([
		...phrase,
		Object.freeze({
			durationMs: 650,
			offsetMs: 2_260,
			pitches: resolvedChord,
			velocity: 96
		})
	])
}

export function targetSoundWaveEnergy(
	meter: SoundWaveMeter,
	held: boolean,
	available: boolean
): number {
	if (!available) return 0
	return Math.max(unit(meter.leftPeak), unit(meter.rightPeak), held ? 0.22 : 0)
}

export function advanceSoundWaveFrame(
	frame: SoundWaveFrame,
	targetEnergy: number,
	deltaMs: number
): SoundWaveFrame {
	const target = unit(targetEnergy)
	const elapsed = Math.min(50, Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0))
	const timeConstant = target > frame.energy ? 72 : 260
	const smoothing = 1 - Math.exp(-elapsed / timeConstant)
	const energy = unit(frame.energy + (target - frame.energy) * smoothing)
	if (target <= 0.002 && energy <= 0.003) return idleSoundWaveFrame
	const phase = (frame.phase + (elapsed / 1_000) * (2.2 + energy * 5.4)) % tau
	return Object.freeze({ energy, phase })
}

export function soundWaveShouldAnimate(input: {
	readonly available: boolean
	readonly currentEnergy: number
	readonly reducedMotion: boolean
	readonly targetEnergy: number
	readonly visible: boolean
}): boolean {
	return (
		input.available &&
		input.visible &&
		!input.reducedMotion &&
		(unit(input.targetEnergy) > 0.002 || unit(input.currentEnergy) > 0.003)
	)
}

export function soundWaveGeometry(frame: SoundWaveFrame): SoundWaveGeometry {
	const energy = unit(frame.energy)
	const phase = Number.isFinite(frame.phase) ? frame.phase % tau : 0
	const primaryAmplitude = 5 + energy * 31
	const secondaryAmplitude = 2.5 + energy * 13
	const primary: SoundWavePoint[] = []
	const secondary: SoundWavePoint[] = []
	for (let index = 0; index < wavePointCount; index += 1) {
		const ratio = index / (wavePointCount - 1)
		const x = ratio * waveWidth
		const edgeEnvelope = Math.sin(ratio * Math.PI) * 0.25 + 0.75
		primary.push(
			Object.freeze({
				x,
				y: boundedY(
					waveCenter +
						Math.sin(ratio * Math.PI * 11 + phase) * primaryAmplitude * edgeEnvelope
				)
			})
		)
		secondary.push(
			Object.freeze({
				x,
				y: boundedY(
					waveCenter +
						Math.sin(ratio * Math.PI * 7 - phase * 0.62) *
							secondaryAmplitude *
							edgeEnvelope
				)
			})
		)
	}
	return Object.freeze({
		primary: Object.freeze(primary),
		secondary: Object.freeze(secondary)
	})
}

export function soundWavePath(points: readonly SoundWavePoint[]): string {
	return points
		.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
		.join(' ')
}
