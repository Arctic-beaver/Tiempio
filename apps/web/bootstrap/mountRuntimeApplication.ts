import {
	ApplicationRuntimeController,
	type PreparedEngineActivation
} from '../../../packages/application/src/runtime/ApplicationRuntimeController.js'
import type { ApplicationRuntime } from '../../../packages/contracts/src/index.js'
import type { ProjectSession } from '../../../packages/project-core/src/index.js'
import {
	encodeProjectManifest,
	parseProjectManifest
} from '../../../packages/project-format/src/index.js'

export function createRuntimeController(
	applicationRuntime: ApplicationRuntime,
	initialSession: ProjectSession
): ApplicationRuntimeController {
	const engine = applicationRuntime.engine
	const activatable =
		engine.availability === 'available'
			? (engine.api as typeof engine.api & {
					prepareActivation?: () => PreparedEngineActivation
				})
			: null
	const prepareActivation = activatable?.prepareActivation
	return new ApplicationRuntimeController(applicationRuntime, initialSession, {
		projectCodec: Object.freeze({
			decode: parseProjectManifest,
			encode: encodeProjectManifest
		}),
		...(prepareActivation === undefined
			? {}
			: {
					prepareEngineActivation: () => prepareActivation.call(activatable)
				})
	})
}
