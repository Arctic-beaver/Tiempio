import { createContext, useContext } from 'react'
import type { ApplicationRuntime } from '../../../contracts/src/index.js'

export const RuntimeContext = createContext<ApplicationRuntime | null>(null)

export function useApplicationRuntime(): ApplicationRuntime {
	const runtime = useContext(RuntimeContext)
	if (runtime === null)
		throw new Error('useApplicationRuntime must be used within RuntimeProvider.')
	return runtime
}
