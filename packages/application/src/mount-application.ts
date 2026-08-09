import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
	applicationError,
	validateApplicationRuntime,
	type ApplicationError,
	type ApplicationResult,
	type ApplicationRuntime
} from '../../contracts/src/index.js'
import { ApplicationRoot } from './app/ApplicationRoot.js'

export function mountApplication(runtime: ApplicationRuntime): ApplicationResult<null> {
	const compatible = validateApplicationRuntime(runtime)
	if (!compatible.ok) return compatible
	const container = document.getElementById('root')
	if (container === null) {
		return Object.freeze({
			ok: false as const,
			error: applicationError('INTERNAL_ERROR', 'The application root is unavailable.')
		})
	}
	createRoot(container).render(createElement(ApplicationRoot, { runtime: compatible.value }))
	return Object.freeze({ ok: true as const, value: null })
}

export function renderApplicationBootstrapFailure(error: ApplicationError): void {
	document.body.replaceChildren()
	const message = document.createElement('p')
	message.dataset.errorCode = error.code
	message.textContent = 'Tiempio could not start.'
	document.body.append(message)
}
