import { mountApplication } from '../../../packages/application/src/mount-application.js'
import { createWebRuntime } from '../runtime/webRuntime.js'

function renderBootstrapFailure(code: string): void {
	document.body.replaceChildren()
	const message = document.createElement('p')
	message.dataset.errorCode = code
	message.textContent = 'Tiempio could not start.'
	document.body.append(message)
}

const runtime = createWebRuntime()
void import('./mountRuntimeApplication.js')
	.then(({ createRuntimeController }) => {
		const mounted = mountApplication(runtime, { createController: createRuntimeController })
		if (!mounted.ok) renderBootstrapFailure(mounted.error.code)
	})
	.catch(() => renderBootstrapFailure('INTERNAL_ERROR'))
