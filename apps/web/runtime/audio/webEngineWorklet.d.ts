declare module 'virtual:tiempio-web-engine-wasm' {
	export const wasmByteLength: number
	export const wasmBytesBase64: string
}

declare module '*?worker&url' {
	const url: string
	export default url
}

declare abstract class AudioWorkletProcessor {
	protected constructor(options?: AudioWorkletNodeOptions)
	public readonly port: MessagePort
	public abstract process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: Readonly<Record<string, Float32Array>>
	): boolean
}

declare const sampleRate: number

declare function registerProcessor(
	name: string,
	processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void
