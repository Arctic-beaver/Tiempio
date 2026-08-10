import { createContext, useContext } from 'react'
import { type ApplicationRuntimeController } from './ApplicationRuntimeController.js'

export const ApplicationRuntimeControllerContext =
	createContext<ApplicationRuntimeController | null>(null)

export function useApplicationRuntimeController(): ApplicationRuntimeController {
	const controller = useContext(ApplicationRuntimeControllerContext)
	if (controller === null) throw new Error('Application runtime controller is unavailable.')
	return controller
}
