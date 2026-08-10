import { createContext, useContext } from 'react'
import { type ApplicationController } from './ApplicationController.js'

export const ApplicationRuntimeControllerContext = createContext<ApplicationController | null>(null)

export function useApplicationRuntimeController(): ApplicationController {
	const controller = useContext(ApplicationRuntimeControllerContext)
	if (controller === null) throw new Error('Application runtime controller is unavailable.')
	return controller
}
