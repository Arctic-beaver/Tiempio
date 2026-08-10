import {
	mountApplication,
	renderApplicationBootstrapFailure
} from '../../../packages/application/src/mount-application.js'
import { encodeProjectManifest } from '../../../packages/project-format/src/index.js'
import { createDesktopRuntime } from './runtime/desktopRuntime.js'

const runtime = createDesktopRuntime()
if (!runtime.ok) renderApplicationBootstrapFailure(runtime.error)
else {
	const mounted = mountApplication(runtime.value, {
		projectCodec: Object.freeze({ encode: encodeProjectManifest })
	})
	if (!mounted.ok) renderApplicationBootstrapFailure(mounted.error)
}
