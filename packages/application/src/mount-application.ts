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
	createUnavailableApplicationController,
	type ApplicationMountOptions
} from './runtime/ApplicationController.js'

export function mountApplication(
	runtime: ApplicationRuntime,
	options: ApplicationMountOptions = {}
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
	const controller =
		options.createController?.(compatible.value, session) ??
		createUnavailableApplicationController(compatible.value, session)
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
