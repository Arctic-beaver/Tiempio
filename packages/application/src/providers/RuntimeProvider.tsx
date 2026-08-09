import type { JSX, ReactNode } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'
import { RuntimeContext } from './RuntimeContext.js'

export interface RuntimeProviderProperties {
	readonly children: ReactNode
	readonly runtime: ApplicationRuntime
}

export function RuntimeProvider({ children, runtime }: RuntimeProviderProperties): JSX.Element {
	return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
}
