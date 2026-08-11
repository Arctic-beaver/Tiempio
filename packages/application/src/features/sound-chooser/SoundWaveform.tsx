import {
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type JSX
} from 'react'
import { useApplicationRuntimeController } from '../../runtime/ApplicationRuntimeControllerContext.js'
import {
	idleSoundWaveFrame,
	soundWaveGeometry,
	soundWavePath,
	targetSoundWaveEnergy
} from './sound-demo-model.js'
import { SoundWaveAnimator } from './sound-wave-animator.js'

export interface SoundWaveformProperties {
	readonly ownerId: string
}

function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(
		() =>
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
	)
	useEffect(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)')
		const update = (): void => setReduced(media.matches)
		media.addEventListener('change', update)
		return () => media.removeEventListener('change', update)
	}, [])
	return reduced
}

function usePageVisible(): boolean {
	const [visible, setVisible] = useState(
		() => typeof document === 'undefined' || document.visibilityState === 'visible'
	)
	useEffect(() => {
		const update = (): void => setVisible(document.visibilityState === 'visible')
		document.addEventListener('visibilitychange', update)
		return () => document.removeEventListener('visibilitychange', update)
	}, [])
	return visible
}

export function SoundWaveform({ ownerId }: SoundWaveformProperties): JSX.Element {
	const controller = useApplicationRuntimeController()
	const engine = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot
	)
	const performance = useSyncExternalStore(
		controller.performanceInput.subscribe,
		controller.performanceInput.getSnapshot,
		controller.performanceInput.getSnapshot
	)
	const preview = useSyncExternalStore(
		controller.previewCoordinator.subscribe,
		controller.previewCoordinator.getSnapshot,
		controller.previewCoordinator.getSnapshot
	)
	const reducedMotion = useReducedMotion()
	const visible = usePageVisible()
	const animator = useMemo(() => new SoundWaveAnimator(), [])
	const animatedFrame = useSyncExternalStore(
		animator.subscribe,
		animator.getSnapshot,
		animator.getSnapshot
	)
	const held =
		(performance.ownerId === ownerId && performance.heldKeys.length > 0) ||
		(preview.kind === 'sound' && preview.pitches.length > 0)
	const targetEnergy = targetSoundWaveEnergy(engine.meter, held, engine.available)

	useEffect(() => {
		animator.update({ available: engine.available, reducedMotion, targetEnergy, visible })
	}, [animator, engine.available, reducedMotion, targetEnergy, visible])
	useEffect(() => () => animator.dispose(), [animator])

	const frame =
		!engine.available || !visible
			? idleSoundWaveFrame
			: reducedMotion
				? idleSoundWaveFrame
				: animatedFrame
	const geometry = soundWaveGeometry(frame)
	const opacity = reducedMotion ? 0.24 + targetEnergy * 0.66 : 0.35 + frame.energy * 0.65
	return (
		<svg
			aria-hidden="true"
			className="wave"
			data-animating={
				!reducedMotion &&
				visible &&
				engine.available &&
				(targetEnergy > 0.002 || frame.energy > 0.003)
			}
			data-reduced-motion={reducedMotion}
			preserveAspectRatio="none"
			style={{ opacity } as CSSProperties}
			viewBox="0 0 800 100"
		>
			<path d={soundWavePath(geometry.primary)} />
			<path className="wave__secondary" d={soundWavePath(geometry.secondary)} />
		</svg>
	)
}
