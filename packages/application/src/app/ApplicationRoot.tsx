import type { JSX } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import { ApplicationProviders } from '../providers/ApplicationProviders.js'
import { StudioApplication } from './StudioApplication.js'
import './studio-shell.css'

export interface ApplicationRootProperties {
	readonly runtime: ApplicationRuntime
}

export function ApplicationRoot({ runtime }: ApplicationRootProperties): JSX.Element {
	return (
		<ApplicationProviders runtime={runtime}>
			<StudioApplication />
		</ApplicationProviders>
	)
}
