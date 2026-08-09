import {
	mountApplication,
	renderApplicationBootstrapFailure
} from '../../../packages/application/src/mount-application.js'
import { createDesktopRuntime } from './runtime/desktopRuntime.js'

const runtime = createDesktopRuntime()
if (!runtime.ok) renderApplicationBootstrapFailure(runtime.error)
else {
	const mounted = mountApplication(runtime.value)
	if (!mounted.ok) renderApplicationBootstrapFailure(mounted.error)
}
