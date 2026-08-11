import {
	advanceSoundWaveFrame,
	idleSoundWaveFrame,
	soundWaveShouldAnimate,
	type SoundWaveFrame
} from './sound-demo-model.js'

export interface SoundWaveAnimationInput {
	readonly available: boolean
	readonly reducedMotion: boolean
	readonly targetEnergy: number
	readonly visible: boolean
}

export interface SoundWaveAnimationScheduler {
	cancel(requestId: number): void
	request(callback: (timestamp: number) => void): number
}

const idleInput: SoundWaveAnimationInput = Object.freeze({
	available: false,
	reducedMotion: false,
	targetEnergy: 0,
	visible: true
})

export const browserSoundWaveScheduler: SoundWaveAnimationScheduler = Object.freeze({
	cancel: (requestId: number) => cancelAnimationFrame(requestId),
	request: (callback: (timestamp: number) => void) => requestAnimationFrame(callback)
})

export class SoundWaveAnimator {
	readonly #listeners = new Set<() => void>()
	readonly #scheduler: SoundWaveAnimationScheduler
	#disposed = false
	#frame: SoundWaveFrame = idleSoundWaveFrame
	#input = idleInput
	#lastTimestamp: number | null = null
	#requestId: number | null = null

	public constructor(scheduler: SoundWaveAnimationScheduler = browserSoundWaveScheduler) {
		this.#scheduler = scheduler
	}

	public readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	public readonly getSnapshot = (): SoundWaveFrame => this.#frame

	public update(input: SoundWaveAnimationInput): void {
		if (this.#disposed) return
		this.#input = Object.freeze({ ...input })
		if (!input.available || !input.visible || input.reducedMotion) {
			this.#cancel()
			this.#publish(idleSoundWaveFrame)
			return
		}
		this.#scheduleIfNeeded()
	}

	public dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#cancel()
		this.#listeners.clear()
	}

	readonly #tick = (timestamp: number): void => {
		this.#requestId = null
		if (this.#disposed) return
		const deltaMs = this.#lastTimestamp === null ? 16 : timestamp - this.#lastTimestamp
		this.#lastTimestamp = timestamp
		this.#publish(advanceSoundWaveFrame(this.#frame, this.#input.targetEnergy, deltaMs))
		this.#scheduleIfNeeded()
	}

	#scheduleIfNeeded(): void {
		if (
			this.#requestId !== null ||
			!soundWaveShouldAnimate({
				...this.#input,
				currentEnergy: this.#frame.energy
			})
		) {
			return
		}
		this.#requestId = this.#scheduler.request(this.#tick)
	}

	#cancel(): void {
		if (this.#requestId !== null) this.#scheduler.cancel(this.#requestId)
		this.#requestId = null
		this.#lastTimestamp = null
	}

	#publish(frame: SoundWaveFrame): void {
		if (frame.energy === this.#frame.energy && frame.phase === this.#frame.phase) return
		this.#frame = frame
		for (const listener of this.#listeners) listener()
	}
}
