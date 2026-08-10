import {
	mountApplication,
	renderApplicationBootstrapFailure
} from '../../../packages/application/src/mount-application.js'
import { ApplicationRuntimeController } from '../../../packages/application/src/runtime/ApplicationRuntimeController.js'
import { encodeProjectManifest } from '../../../packages/project-format/src/index.js'
import { createDesktopRuntime } from './runtime/desktopRuntime.js'

const runtime = createDesktopRuntime()
if (!runtime.ok) renderApplicationBootstrapFailure(runtime.error)
else {
	const mounted = mountApplication(runtime.value, {
		createController: (applicationRuntime, initialSession) =>
			new ApplicationRuntimeController(applicationRuntime, initialSession, {
				projectCodec: Object.freeze({ encode: encodeProjectManifest })
			})
	})
	if (!mounted.ok) renderApplicationBootstrapFailure(mounted.error)
}
