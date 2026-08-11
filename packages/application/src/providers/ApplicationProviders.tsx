import type { JSX, ReactNode } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import { OverlayBoundary } from '../../../design-system/src/index.js'
import type { ProjectSession } from '../../../project-core/src/index.js'
import { ProjectSessionProvider } from '../project/ProjectSessionProvider.js'
import type { ApplicationController } from '../runtime/ApplicationController.js'
import { ApplicationRuntimeControllerContext } from '../runtime/ApplicationRuntimeControllerContext.js'
import { PresentationSettingsProvider } from './PresentationSettingsProvider.js'
import { RuntimeProvider } from './RuntimeProvider.js'

export interface ApplicationProvidersProperties {
	readonly children: ReactNode
	readonly controller: ApplicationController
	readonly initialSession: ProjectSession
	readonly runtime: ApplicationRuntime
}

export function ApplicationProviders({
	children,
	controller,
	initialSession,
	runtime
}: ApplicationProvidersProperties): JSX.Element {
	return (
		<RuntimeProvider runtime={runtime}>
			<ApplicationRuntimeControllerContext.Provider value={controller}>
				<PresentationSettingsProvider>
					<OverlayBoundary>
						<ProjectSessionProvider
							initialSession={initialSession}
							onSessionChange={(session) => controller.bindProjectSession(session)}
						>
							{children}
						</ProjectSessionProvider>
					</OverlayBoundary>
				</PresentationSettingsProvider>
			</ApplicationRuntimeControllerContext.Provider>
		</RuntimeProvider>
	)
}
