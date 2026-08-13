import { resolve } from 'node:path'

const minute = 60_000
const node = process.execPath
const rustBin =
	process.platform === 'win32' && typeof process.env.USERPROFILE === 'string'
		? resolve(process.env.USERPROFILE, '.cargo/bin')
		: null
const cargo = rustBin === null ? 'cargo' : resolve(rustBin, 'cargo.exe')
const rustc = rustBin === null ? 'rustc' : resolve(rustBin, 'rustc.exe')
const rustup = rustBin === null ? 'rustup' : resolve(rustBin, 'rustup.exe')
const webWasmTarget = 'wasm32-unknown-unknown'

function directStep(name, command, arguments_ = [], timeoutMs = minute) {
	return Object.freeze({
		name,
		command,
		arguments: Object.freeze([...arguments_]),
		timeoutMs
	})
}

function nodeFileStep(name, path, arguments_ = [], timeoutMs = minute) {
	return directStep(name, node, [resolve(path), ...arguments_], timeoutMs)
}

function nodeArgumentsStep(name, arguments_, timeoutMs = minute) {
	return directStep(name, node, arguments_, timeoutMs)
}

function npmStep(name, arguments_, timeoutMs) {
	const npmExecPath = process.env.npm_execpath
	if (typeof npmExecPath !== 'string' || npmExecPath.length === 0) {
		throw new Error(
			`npm_execpath is required for ${name}. Start dependency workflows through npm.`
		)
	}
	return nodeArgumentsStep(name, [npmExecPath, ...arguments_], timeoutMs)
}

const cli = Object.freeze({
	prettier: 'node_modules/prettier/bin/prettier.cjs',
	eslint: 'node_modules/eslint/bin/eslint.js',
	tsc: 'node_modules/typescript/bin/tsc',
	vite: 'node_modules/vite/bin/vite.js',
	electronVite: 'node_modules/electron-vite/bin/electron-vite.js',
	electronBuilder: 'node_modules/electron-builder/cli.js'
})

const nativeHostExecutable = resolve(
	'engine/target/release',
	process.platform === 'win32' ? 'tiempio-engine-native-host.exe' : 'tiempio-engine-native-host'
)

const lifecycleTestFiles = Object.freeze([
	resolve('scripts/lifecycle/lifecycle-owner.test.mjs'),
	resolve('scripts/lifecycle/ownership-guard.test.mjs'),
	resolve('scripts/lifecycle/process-adapter.test.mjs'),
	resolve('scripts/lifecycle/workflow-catalog.test.mjs'),
	resolve('scripts/lifecycle-audit.test.mjs'),
	resolve('scripts/lifecycle-policy.test.mjs')
])

const repositoryScriptTestFiles = Object.freeze([
	...lifecycleTestFiles,
	resolve('scripts/bundle-budget.test.mjs'),
	resolve('scripts/chunk-topology.test.mjs'),
	resolve('scripts/dependency-policy.test.mjs'),
	resolve('scripts/package-content-policy.test.mjs'),
	resolve('scripts/prototype-visual-contract.test.mjs'),
	resolve('scripts/protocol-generation.test.mjs'),
	resolve('scripts/security-policy.test.mjs'),
	resolve('scripts/target-boundary-policy.test.mjs'),
	resolve('scripts/ui-foundation-policy.test.mjs')
])

const compiledTestFiles = Object.freeze([
	resolve('.test-out/apps/desktop/main/native-host-contract.test.js'),
	resolve('.test-out/apps/desktop/main/engine/audio-input.integration.test.js'),
	resolve('.test-out/apps/desktop/main/engine/engine-host-supervisor.test.js'),
	resolve('.test-out/apps/desktop/main/engine/framed-json-transport.test.js'),
	resolve('.test-out/apps/desktop/main/engine/native-host-resolver.test.js'),
	resolve('.test-out/apps/desktop/main/persistence/persistence-runtime.test.js'),
	resolve('.test-out/apps/desktop/main/renderer-authority.test.js'),
	resolve('.test-out/apps/desktop/main/runtime-channels.test.js'),
	resolve('.test-out/apps/desktop/main/window-options.test.js'),
	resolve('.test-out/apps/desktop/renderer/runtime/desktopRuntime.test.js'),
	resolve('.test-out/apps/web/runtime/audio/WebEngineRuntime.test.js'),
	resolve('.test-out/apps/web/runtime/audio/webEngineWorkletProtocol.test.js'),
	resolve('.test-out/apps/web/runtime/persistence/WebIndexedDbRuntime.test.js'),
	resolve('.test-out/apps/web/runtime/persistence/WebProjectsRuntime.test.js'),
	resolve('.test-out/apps/web/runtime/webRuntime.test.js'),
	resolve('.test-out/packages/contracts/src/application-runtime.test.js'),
	resolve('.test-out/packages/contracts/src/application-runtime-validation.test.js'),
	resolve('.test-out/packages/contracts/src/engine-protocol.test.js'),
	resolve('.test-out/packages/contracts/src/engine-render-plan.test.js'),
	resolve('.test-out/packages/engine-client/src/EngineClient.test.js'),
	resolve('.test-out/packages/application/src/shell/layout-model.test.js'),
	resolve('.test-out/packages/application/src/commands/command-availability.test.js'),
	resolve('.test-out/packages/application/src/commands/command-registry.test.js'),
	resolve('.test-out/packages/application/src/commands/shortcut-settings.test.js'),
	resolve('.test-out/packages/application/src/features/piano-roll/note-editor-geometry.test.js'),
	resolve('.test-out/packages/application/src/features/piano-roll/note-editor-keyboard.test.js'),
	resolve(
		'.test-out/packages/application/src/features/first-layer/layer-creation-coordinator.test.js'
	),
	resolve('.test-out/packages/application/src/features/song-palette/song-palette-model.test.js'),
	resolve('.test-out/packages/application/src/features/sound-chooser/sound-demo-model.test.js'),
	resolve('.test-out/packages/application/src/performance/performance-input-session.test.js'),
	resolve('.test-out/packages/application/src/preview/audition-preview-coordinator.test.js'),
	resolve('.test-out/packages/application/src/project/projectors.test.js'),
	resolve('.test-out/packages/application/src/runtime/ApplicationRuntimeController.test.js'),
	resolve('.test-out/packages/application/src/shell/transport-presentation.test.js'),
	resolve('.test-out/packages/design-system/src/theme.test.js'),
	resolve('.test-out/packages/design-system/src/floating-overlay.test.js'),
	resolve('.test-out/packages/localization/src/catalogs.test.js'),
	resolve('.test-out/packages/music-theory/src/music-theory.test.js'),
	resolve('.test-out/packages/project-core/src/project-model.test.js'),
	resolve('.test-out/packages/project-core/src/project-validation.test.js'),
	resolve('.test-out/packages/project-core/src/project-migrations.test.js'),
	resolve('.test-out/packages/project-core/src/project-session.test.js'),
	resolve('.test-out/packages/project-core/src/render-plan.test.js'),
	resolve('.test-out/packages/project-format/src/project-format.test.js')
])

const prettierInputs = Object.freeze([
	'*.{json,mjs,ts,yaml}',
	'apps/**/*.{html,ts,tsx}',
	'build/**/*.ts',
	'content/**/*.md',
	'docs/evidence/**/*.md',
	'fixtures/**/*.json',
	'packages/**/*.{json,ts,tsx}',
	'scripts/**/*.mjs'
])

const eslintInputs = Object.freeze([
	'*.{js,mjs,ts}',
	'apps/**/*.{ts,tsx}',
	'build/**/*.ts',
	'packages/**/*.{ts,tsx}',
	'scripts/**/*.mjs'
])

const steps = Object.freeze({
	dependencyInstall: (clean) =>
		npmStep(
			clean ? 'npm ci without lifecycle scripts' : 'npm install without lifecycle scripts',
			[clean ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
			8 * minute
		),
	format: () => nodeFileStep('format', cli.prettier, ['--write', ...prettierInputs], 2 * minute),
	formatCheck: () =>
		nodeFileStep('format check', cli.prettier, ['--check', ...prettierInputs], 2 * minute),
	lint: () => nodeFileStep('lint', cli.eslint, ['--cache', ...eslintInputs], 2 * minute),
	lintFix: () =>
		nodeFileStep('lint fix', cli.eslint, ['--cache', '--fix', ...eslintInputs], 2 * minute),
	policy: () => nodeFileStep('lifecycle policy', 'scripts/lifecycle-policy.mjs'),
	dependencyPolicy: () =>
		nodeFileStep('pinned dependency policy', 'scripts/dependency-policy.mjs'),
	stagedWhitespace: () =>
		directStep('staged whitespace check', 'git', ['diff', '--cached', '--check']),
	protocolGenerate: () =>
		nodeFileStep('engine protocol generation', 'scripts/generate-engine-protocol.mjs'),
	protocolCheck: () =>
		nodeFileStep(
			'engine protocol generated-file check',
			'scripts/generate-engine-protocol.mjs',
			['--check']
		),
	testOutputClean: () =>
		nodeFileStep('compiled test output cleanup', 'scripts/clean-test-output.mjs'),
	testCompile: () =>
		nodeFileStep('test TypeScript compile', cli.tsc, ['-p', 'tsconfig.test.json'], 3 * minute),
	testUnit: () =>
		nodeArgumentsStep(
			'compiled contract tests',
			['--test', '--test-reporter=spec', ...compiledTestFiles],
			2 * minute
		),
	testScripts: () =>
		nodeArgumentsStep(
			'repository policy tests',
			['--test', '--test-reporter=spec', ...repositoryScriptTestFiles],
			4 * minute
		),
	testLifecycle: () =>
		nodeArgumentsStep(
			'lifecycle tests',
			['--test', '--test-reporter=spec', ...lifecycleTestFiles],
			3 * minute
		),
	typecheckNode: () =>
		nodeFileStep(
			'Node typecheck',
			cli.tsc,
			['--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false'],
			3 * minute
		),
	typecheckWeb: () =>
		nodeFileStep(
			'Web typecheck',
			cli.tsc,
			['--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'],
			3 * minute
		),
	targetBoundaries: () =>
		nodeFileStep('target import boundaries', 'scripts/target-boundary-policy.mjs'),
	uiFoundation: () =>
		nodeFileStep('shared UI foundation policy', 'scripts/ui-foundation-policy.mjs'),
	security: (requiredTarget = null) =>
		nodeFileStep(
			'production CSP policy',
			'scripts/security-policy.mjs',
			requiredTarget === null ? [] : ['--require-build', requiredTarget]
		),
	packageContents: (requireBuild = false) =>
		nodeFileStep(
			'Desktop package content policy',
			'scripts/package-content-policy.mjs',
			requireBuild ? ['--require-build'] : []
		),
	packagedNativeResources: () =>
		nodeFileStep(
			'Desktop packaged native resource policy',
			'scripts/package-content-policy.mjs',
			['--require-build', '--require-package']
		),
	bundleBudget: (target = 'all') =>
		nodeFileStep('empty-shell bundle budgets', 'scripts/bundle-budget.mjs', [target]),
	chunkTopology: (target = 'all') =>
		nodeFileStep('initial-shell chunk topology', 'scripts/chunk-topology.mjs', [target]),
	desktopBuild: () =>
		nodeFileStep('Desktop production build', cli.electronVite, ['build'], 5 * minute),
	webBuild: () =>
		nodeFileStep(
			'Web production build',
			cli.vite,
			['build', '--config', 'vite.web.config.ts'],
			5 * minute
		),
	webPreview: () =>
		nodeFileStep(
			'Web preview server',
			cli.vite,
			[
				'preview',
				'--config',
				'vite.web.config.ts',
				'--host',
				'127.0.0.1',
				'--port',
				'4173',
				'--strictPort'
			],
			10 * minute
		),
	cargoLock: () =>
		directStep(
			'Cargo lockfile generation',
			cargo,
			['generate-lockfile', '--manifest-path', 'engine/Cargo.toml'],
			10 * minute
		),
	rustToolchain: () => [
		directStep('Rust compiler version', rustc, ['--version']),
		directStep('Cargo version', cargo, ['--version'])
	],
	rustClippyInstall: () =>
		directStep(
			'Rust clippy component installation',
			rustup,
			['component', 'add', 'clippy'],
			5 * minute
		),
	webWasmTargetInstall: () =>
		directStep(
			'Rust WebAssembly target installation',
			rustup,
			['target', 'add', webWasmTarget],
			5 * minute
		),
	webWasmTargetInventory: () =>
		directStep('Rust WebAssembly target inventory', rustup, ['target', 'list', '--installed']),
	rustFormat: () =>
		directStep(
			'Rust format check',
			cargo,
			['fmt', '--manifest-path', 'engine/Cargo.toml', '--all', '--', '--check'],
			2 * minute
		),
	rustFormatWrite: () =>
		directStep(
			'Rust format',
			cargo,
			['fmt', '--manifest-path', 'engine/Cargo.toml', '--all'],
			2 * minute
		),
	rustCheck: () =>
		directStep(
			'Rust workspace check',
			cargo,
			[
				'check',
				'--manifest-path',
				'engine/Cargo.toml',
				'--workspace',
				'--all-targets',
				'--locked'
			],
			10 * minute
		),
	rustClippy: () =>
		directStep(
			'Rust clippy policy',
			cargo,
			[
				'clippy',
				'--manifest-path',
				'engine/Cargo.toml',
				'--workspace',
				'--all-targets',
				'--locked',
				'--',
				'-D',
				'warnings'
			],
			5 * minute
		),
	rustTest: () =>
		directStep(
			'Rust workspace tests',
			cargo,
			[
				'test',
				'--manifest-path',
				'engine/Cargo.toml',
				'--workspace',
				'--all-targets',
				'--locked'
			],
			5 * minute
		),
	webEngineCheck: () =>
		directStep(
			'Web engine target check',
			cargo,
			[
				'check',
				'--manifest-path',
				'engine/Cargo.toml',
				'--package',
				'tiempio-engine-web-worklet',
				'--target',
				webWasmTarget,
				'--locked'
			],
			10 * minute
		),
	webEngineTest: () =>
		directStep(
			'Web engine deterministic native tests',
			cargo,
			[
				'test',
				'--manifest-path',
				'engine/Cargo.toml',
				'--package',
				'tiempio-engine-web-worklet',
				'--all-targets',
				'--locked'
			],
			5 * minute
		),
	webEngineBuild: () =>
		directStep(
			'Web engine release build',
			cargo,
			[
				'build',
				'--manifest-path',
				'engine/Cargo.toml',
				'--package',
				'tiempio-engine-web-worklet',
				'--target',
				webWasmTarget,
				'--release',
				'--locked'
			],
			10 * minute
		),
	webEngineWasmParity: () =>
		nodeFileStep(
			'Web engine WebAssembly parity harness',
			'scripts/web-engine-wasm-parity.mjs',
			[],
			2 * minute
		),
	engineEvidence: () =>
		directStep(
			'Stage 4 engine evidence render',
			cargo,
			[
				'run',
				'--manifest-path',
				'engine/Cargo.toml',
				'--package',
				'tiempio-engine-offline-render',
				'--bin',
				'render-stage-4-evidence',
				'--locked'
			],
			5 * minute
		),
	nativeHostBuild: () =>
		directStep(
			'native host release build',
			cargo,
			[
				'build',
				'--manifest-path',
				'engine/Cargo.toml',
				'--package',
				'tiempio-engine-native-host',
				'--release',
				'--locked'
			],
			8 * minute
		),
	nativeHostStage: () =>
		nodeFileStep('native host package staging', 'scripts/stage-native-host.mjs'),
	nativeHostAudioCheck: () =>
		directStep(
			'native host controlled audio self-test',
			nativeHostExecutable,
			['--self-test-null'],
			2 * minute
		),
	nativeHostLiveAudioCheck: () =>
		nodeFileStep(
			'native host live shared-output audio probe',
			'scripts/native-host-live-audio.mjs',
			[nativeHostExecutable],
			2 * minute
		),
	desktopPackage: () =>
		nodeFileStep(
			'Desktop unpacked package',
			cli.electronBuilder,
			['--dir', '--publish', 'never'],
			8 * minute
		)
})

function testSteps() {
	return [steps.testOutputClean(), steps.testCompile(), steps.testUnit(), steps.testScripts()]
}

function qualitySteps() {
	return [
		steps.policy(),
		steps.dependencyPolicy(),
		steps.protocolCheck(),
		steps.formatCheck(),
		steps.lint(),
		steps.targetBoundaries(),
		steps.uiFoundation(),
		steps.security(),
		steps.packageContents(),
		...testSteps(),
		steps.typecheckNode(),
		steps.typecheckWeb(),
		steps.rustFormat(),
		steps.rustCheck(),
		steps.rustClippy(),
		steps.rustTest()
	]
}

function desktopBuildSteps() {
	return [
		steps.typecheckNode(),
		steps.typecheckWeb(),
		steps.desktopBuild(),
		steps.security('desktop'),
		steps.bundleBudget('desktop'),
		steps.chunkTopology('desktop'),
		steps.packageContents(true)
	]
}

function webBuildSteps() {
	return [
		steps.typecheckWeb(),
		steps.webWasmTargetInventory(),
		steps.webEngineBuild(),
		steps.webBuild(),
		steps.security('web'),
		steps.bundleBudget('web'),
		steps.chunkTopology('web')
	]
}

function engineBuildSteps() {
	return [steps.nativeHostBuild(), steps.nativeHostStage()]
}

function desktopPackageSteps() {
	return [
		steps.typecheckNode(),
		steps.typecheckWeb(),
		...engineBuildSteps(),
		steps.desktopBuild(),
		steps.security('desktop'),
		steps.bundleBudget('desktop'),
		steps.chunkTopology('desktop'),
		steps.packageContents(true),
		steps.desktopPackage(),
		steps.packagedNativeResources()
	]
}

const workflowFactories = Object.freeze({
	'dependencies:install': () => [steps.dependencyInstall(false)],
	'dependencies:ci': () => [steps.dependencyInstall(true)],
	'check:dependencies': () => [steps.dependencyPolicy()],
	format: () => [steps.format()],
	'format:rust': () => [steps.rustFormatWrite()],
	'format:check': () => [steps.formatCheck()],
	lint: () => [steps.lint()],
	'lint:fix': () => [steps.lintFix()],
	'generate:protocol': () => [steps.protocolGenerate()],
	'check:protocol-generated': () => [steps.protocolCheck()],
	'generate:cargo-lock': () => [steps.cargoLock()],
	'toolchain:rust': () => steps.rustToolchain(),
	'toolchain:rust-clippy': () => [steps.rustClippyInstall()],
	'toolchain:web-wasm': () => [steps.webWasmTargetInstall()],
	test: testSteps,
	'test:lifecycle': () => [steps.testLifecycle()],
	'typecheck:node': () => [steps.typecheckNode()],
	'typecheck:web': () => [steps.typecheckWeb()],
	typecheck: () => [steps.typecheckNode(), steps.typecheckWeb()],
	'check:rust': () => [
		steps.rustFormat(),
		steps.rustCheck(),
		steps.rustClippy(),
		steps.rustTest()
	],
	'check:web-engine': () => [
		steps.webWasmTargetInventory(),
		steps.webEngineCheck(),
		steps.webEngineTest(),
		steps.webEngineBuild(),
		steps.webEngineWasmParity()
	],
	'evidence:engine': () => [steps.engineEvidence()],
	'build:engine': engineBuildSteps,
	'build:web-engine': () => [steps.webWasmTargetInventory(), steps.webEngineBuild()],
	'check:audio': () => [...engineBuildSteps(), steps.nativeHostAudioCheck()],
	'check:audio-live': () => [
		steps.testOutputClean(),
		steps.testCompile(),
		...engineBuildSteps(),
		steps.nativeHostLiveAudioCheck()
	],
	'package:check': desktopPackageSteps,
	'check:target-boundaries': () => [steps.targetBoundaries()],
	'check:visual-a11y': () => [
		steps.uiFoundation(),
		steps.typecheckWeb(),
		steps.webBuild(),
		steps.security('web')
	],
	'check:security': () => [steps.security()],
	'check:bundle-size': () => [steps.bundleBudget()],
	'check:chunk-topology': () => [steps.chunkTopology()],
	'check:packaged-contents': () => [steps.packageContents()],
	build: desktopBuildSteps,
	'build:web': webBuildSteps,
	'preview:web': () => [steps.webPreview()],
	'check:quick': qualitySteps,
	quality: qualitySteps,
	checks: () => [...qualitySteps(), ...desktopBuildSteps(), ...webBuildSteps()],
	precommit: () => [steps.policy(), steps.stagedWhitespace(), ...qualitySteps().slice(1)]
})

export const plannedWorkflowNames = Object.freeze(['dev', 'dev:web', 'release:check'])

export const workflowNames = Object.freeze(Object.keys(workflowFactories))

const workflowTimeoutOverrides = Object.freeze({
	'dependencies:install': 9 * minute,
	'dependencies:ci': 9 * minute,
	build: 8 * minute,
	'build:web': 8 * minute,
	'build:engine': 10 * minute,
	'build:web-engine': 12 * minute,
	'check:web-engine': 16 * minute,
	'check:audio': 12 * minute,
	'check:audio-live': 12 * minute,
	'package:check': 20 * minute,
	'check:visual-a11y': 8 * minute,
	'preview:web': 11 * minute,
	'check:quick': 12 * minute,
	quality: 12 * minute,
	checks: 20 * minute,
	precommit: 12 * minute
})

export function workflowSteps(name) {
	const factory = workflowFactories[name]
	if (factory === undefined) {
		throw new Error(
			`Unknown lifecycle workflow ${String(name)}. Allowed workflows: ${workflowNames.join(', ')}.`
		)
	}
	return Object.freeze(factory().map((step) => Object.freeze({ ...step })))
}

export function workflowTimeoutMs(name) {
	const workflow = workflowSteps(name)
	return (
		workflowTimeoutOverrides[name] ??
		workflow.reduce((total, step) => total + step.timeoutMs, 30_000)
	)
}
