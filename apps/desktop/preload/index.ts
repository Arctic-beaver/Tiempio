import { contextBridge } from 'electron'
import {
	applicationRuntimeVersion,
	type ApplicationRuntimeHandshake
} from '../../../packages/contracts/src/application-runtime.js'

const handshake: ApplicationRuntimeHandshake = Object.freeze({
	version: applicationRuntimeVersion,
	target: 'desktop'
})

contextBridge.exposeInMainWorld('tiempioRuntime', handshake)
