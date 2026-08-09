if (process.env.TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK === '1') {
	throw new Error('TIEMPIO_ALLOW_UNSAFE_INSTALL_HOOK is not a supported bypass.')
}

throw new Error(
	[
		'Direct npm install/ci lifecycle hooks are blocked because npm would own the process tree.',
		'Use `npm run dependencies:install` for a developer install or',
		'`npm run dependencies:ci` for a clean reproducible install.'
	].join(' ')
)
