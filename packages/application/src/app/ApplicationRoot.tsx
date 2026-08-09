import type { JSX } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'

export interface ApplicationRootProperties {
	readonly runtime: ApplicationRuntime
}

export function ApplicationRoot({ runtime }: ApplicationRootProperties): JSX.Element {
	return <main aria-label="Tiempio" data-application-target={runtime.target} />
}
