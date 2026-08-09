import {
	createUnavailableRuntime,
	type ApplicationRuntime
} from '../../../packages/contracts/src/application-runtime.js'

export function createWebRuntime(): ApplicationRuntime {
	return createUnavailableRuntime('web')
}
