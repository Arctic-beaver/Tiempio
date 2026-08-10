import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
	applicationError,
	validateApplicationRuntime,
	type ApplicationError,
	type ApplicationResult,
	type ApplicationRuntime
} from '../../contracts/src/index.js'
import { ProjectSession } from '../../project-core/src/index.js'
import { ApplicationRoot } from './app/ApplicationRoot.js'
import { createSeedProject } from './project/seed-project.js'
import {
	ApplicationRuntimeController,
	type ApplicationRuntimeControllerOptions
} from './runtime/ApplicationRuntimeController.js'

export function mountApplication(
	runtime: ApplicationRuntime,
	options: ApplicationRuntimeControllerOptions = {}
): ApplicationResult<null> {
	const compatible = validateApplicationRuntime(runtime)
	if (!compatible.ok) return compatible
	const container = document.getElementById('root')
	if (container === null) {
		return Object.freeze({
			ok: false as const,
			error: applicationError('INTERNAL_ERROR', 'The application root is unavailable.')
		})
	}
	const session = new ProjectSession(createSeedProject())
	const controller = new ApplicationRuntimeController(compatible.value, session, options)
	createRoot(container).render(
		createElement(ApplicationRoot, {
			controller,
			initialSession: session,
			runtime: compatible.value
		})
	)
	void controller.start()
	return Object.freeze({ ok: true as const, value: null })
}

export function renderApplicationBootstrapFailure(error: ApplicationError): void {
	document.body.replaceChildren()
	const message = document.createElement('p')
	message.dataset.errorCode = error.code
	message.textContent = 'Tiempio could not start.'
	document.body.append(message)
}
