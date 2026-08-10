import type { JSX } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import type { ProjectSession } from '../../../project-core/src/index.js'
import { ApplicationProviders } from '../providers/ApplicationProviders.js'
import type { ApplicationController } from '../runtime/ApplicationController.js'
import { StudioApplication } from './StudioApplication.js'
import './studio-shell.css'

export interface ApplicationRootProperties {
	readonly controller: ApplicationController
	readonly initialSession: ProjectSession
	readonly runtime: ApplicationRuntime
}

export function ApplicationRoot({
	controller,
	initialSession,
	runtime
}: ApplicationRootProperties): JSX.Element {
	return (
		<ApplicationProviders
			controller={controller}
			initialSession={initialSession}
			runtime={runtime}
		>
			<StudioApplication />
		</ApplicationProviders>
	)
}
