import type { JSX, ReactNode } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import { PresentationSettingsProvider } from './PresentationSettingsProvider.js'
import { RuntimeProvider } from './RuntimeProvider.js'

export interface ApplicationProvidersProperties {
	readonly children: ReactNode
	readonly runtime: ApplicationRuntime
}

export function ApplicationProviders({
	children,
	runtime
}: ApplicationProvidersProperties): JSX.Element {
	return (
		<RuntimeProvider runtime={runtime}>
			<PresentationSettingsProvider>{children}</PresentationSettingsProvider>
		</RuntimeProvider>
	)
}
