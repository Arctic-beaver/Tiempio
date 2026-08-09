import {
	mountApplication,
	renderApplicationBootstrapFailure
} from '../../../packages/application/src/mount-application.js'
import { createWebRuntime } from '../runtime/webRuntime.js'

const mounted = mountApplication(createWebRuntime())
if (!mounted.ok) renderApplicationBootstrapFailure(mounted.error)
