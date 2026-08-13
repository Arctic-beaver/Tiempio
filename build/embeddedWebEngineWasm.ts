import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export const embeddedWebEngineWasmModuleId = 'virtual:tiempio-web-engine-wasm'
const resolvedModuleId = `\0${embeddedWebEngineWasmModuleId}`
const wasmPath = resolve(
	'engine/target/wasm32-unknown-unknown/release/tiempio_engine_web_worklet.wasm'
)
const maximumWasmBytes = 786_432

export function embeddedWebEngineWasmPlugin(): Plugin {
	return {
		name: 'tiempio-embedded-web-engine-wasm',
		resolveId(id) {
			return id === embeddedWebEngineWasmModuleId ? resolvedModuleId : null
		},
		load(id) {
			if (id !== resolvedModuleId) return null
			let bytes: Buffer
			try {
				bytes = readFileSync(wasmPath)
			} catch {
				throw new Error(
					'Missing release Web engine. Run the lifecycle-owned build:web-engine workflow first.'
				)
			}
			if (bytes.byteLength > maximumWasmBytes) {
				throw new Error(
					`Release Web engine is ${String(bytes.byteLength)} bytes; limit is ${String(maximumWasmBytes)}.`
				)
			}
			return [
				`export const wasmByteLength = ${String(bytes.byteLength)};`,
				`export const wasmBytesBase64 = '${bytes.toString('base64')}';`
			].join('\n')
		}
	}
}
