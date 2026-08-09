export function requireLifecycleOwnership(label) {
	const token = process.env.TIEMPIO_LIFECYCLE_TOKEN
	const workflow = process.env.TIEMPIO_LIFECYCLE_WORKFLOW
	const step = process.env.TIEMPIO_LIFECYCLE_STEP
	if (
		typeof token !== 'string' ||
		token.length < 16 ||
		typeof workflow !== 'string' ||
		workflow.length === 0 ||
		typeof step !== 'string' ||
		step.length === 0
	) {
		throw new Error(
			`${label} must run through Tiempio's lifecycle owner. Direct execution is blocked.`
		)
	}
	return Object.freeze({ token, workflow, step })
}
