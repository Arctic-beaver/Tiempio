import type { JSX } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import { ApplicationProviders } from '../providers/ApplicationProviders.js'

export interface ApplicationRootProperties {
	readonly runtime: ApplicationRuntime
}

export function ApplicationRoot({ runtime }: ApplicationRootProperties): JSX.Element {
	return (
		<ApplicationProviders runtime={runtime}>
			<main aria-label="Tiempio" data-application-target={runtime.target} />
		</ApplicationProviders>
	)
}
