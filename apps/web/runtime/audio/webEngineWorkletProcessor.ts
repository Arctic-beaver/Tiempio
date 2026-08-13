import { wasmByteLength, wasmBytesBase64 } from 'virtual:tiempio-web-engine-wasm'
import {
	isMainToWorkletMessage,
	webEngineAbiVersion,
	webEngineMaximumBlockFrames,
	webEngineMaximumEventsPerRender,
	webEngineMaximumTransferBytes,
	webEngineProcessorName,
	type MainToWorkletMessage,
	type WebEngineFatalCode,
	type WorkletToMainMessage
} from './webEngineWorkletProtocol.js'

interface WebEngineWasmExports extends WebAssembly.Exports {
	readonly memory: WebAssembly.Memory
	readonly tiempio_web_worklet_abi_version: () => number
	readonly tiempio_web_worklet_protocol_version: () => number
	readonly tiempio_web_worklet_create: (sampleRate: number, maximumBlockFrames: number) => number
	readonly tiempio_web_worklet_destroy: () => void
	readonly tiempio_web_worklet_command_buffer_ptr: () => number
	readonly tiempio_web_worklet_command_buffer_capacity: () => number
	readonly tiempio_web_worklet_accept_command: (length: number) => number
	readonly tiempio_web_worklet_render: (frameCount: number) => number
	readonly tiempio_web_worklet_output_buffer_ptr: () => number
	readonly tiempio_web_worklet_drain_event: () => number
	readonly tiempio_web_worklet_event_buffer_ptr: () => number
}

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const base64Lookup = new Uint8Array(128)
for (let index = 0; index < base64Alphabet.length; index += 1) {
	base64Lookup[base64Alphabet.charCodeAt(index)] = index
}

function decodeEmbeddedWasm(): Uint8Array<ArrayBuffer> {
	const output = new Uint8Array(new ArrayBuffer(wasmByteLength))
	let outputIndex = 0
	let accumulator = 0
	let bits = 0
	for (let index = 0; index < wasmBytesBase64.length; index += 1) {
		const code = wasmBytesBase64.charCodeAt(index)
		if (code === 61) break
		if (code >= base64Lookup.length) throw new Error('invalid-base64')
		accumulator = (accumulator << 6) | base64Lookup[code]
		bits += 6
		if (bits < 8) continue
		bits -= 8
		output[outputIndex] = (accumulator >>> bits) & 0xff
		outputIndex += 1
	}
	if (outputIndex !== wasmByteLength) throw new Error('invalid-wasm-length')
	return output
}

class TiempioWebEngineProcessor extends AudioWorkletProcessor {
	readonly #generation: number
	#disposed = false
	#exports: WebEngineWasmExports | null = null
	#fatal = false
	#interleaved: Float32Array<ArrayBuffer> | null = null
	#memoryBuffer: ArrayBuffer | null = null
	#ready = false

	public constructor(options?: AudioWorkletNodeOptions) {
		super()
		const candidate = options?.processorOptions?.generation
		this.#generation =
			Number.isSafeInteger(candidate) && Number(candidate) > 0 ? Number(candidate) : 0
		this.port.onmessage = (event: MessageEvent<unknown>) => this.#acceptMessage(event.data)
		void this.#initialize()
	}

	async #initialize(): Promise<void> {
		try {
			if (this.#generation === 0) throw new Error('invalid-generation')
			const module = await WebAssembly.compile(decodeEmbeddedWasm())
			const instance = await WebAssembly.instantiate(module)
			if (this.#disposed) return
			const exports = instance.exports as WebEngineWasmExports
			if (exports.tiempio_web_worklet_abi_version() !== webEngineAbiVersion) {
				this.#fail('abi-mismatch')
				return
			}
			if (
				exports.tiempio_web_worklet_create(
					Math.round(sampleRate),
					webEngineMaximumBlockFrames
				) !== 0
			) {
				this.#fail('wasm-initialization')
				return
			}
			this.#exports = exports
			this.#refreshOutputView()
		} catch {
			this.#fail('wasm-initialization')
		}
	}

	#refreshOutputView(): void {
		const exports = this.#exports
		if (exports === null) throw new Error('missing-wasm-exports')
		const buffer = exports.memory.buffer as ArrayBuffer
		this.#interleaved = new Float32Array(
			buffer,
			exports.tiempio_web_worklet_output_buffer_ptr(),
			webEngineMaximumBlockFrames * 2
		)
		this.#memoryBuffer = buffer
	}

	#acceptMessage(value: unknown): void {
		if (!isMainToWorkletMessage(value)) {
			if (
				typeof value === 'object' &&
				value !== null &&
				'generation' in value &&
				value.generation === this.#generation
			) {
				this.#fail('invalid-message')
			}
			return
		}
		if (value.generation !== this.#generation) return
		if (value.kind === 'dispose') {
			this.#disposed = true
			this.#exports?.tiempio_web_worklet_destroy()
			this.#exports = null
			this.#interleaved = null
			this.#memoryBuffer = null
			this.port.close()
			return
		}
		this.#acceptCommand(value)
	}

	#acceptCommand(message: Extract<MainToWorkletMessage, { readonly kind: 'command' }>): void {
		const exports = this.#exports
		if (exports === null || this.#disposed || this.#fatal) return
		const capacity = exports.tiempio_web_worklet_command_buffer_capacity()
		if (message.bytes.byteLength > capacity) {
			this.#post({
				kind: 'command-result',
				generation: this.#generation,
				messageId: message.messageId,
				result: 1
			})
			return
		}
		const target = new Uint8Array(
			exports.memory.buffer,
			exports.tiempio_web_worklet_command_buffer_ptr(),
			message.bytes.byteLength
		)
		target.set(new Uint8Array(message.bytes))
		const result = exports.tiempio_web_worklet_accept_command(message.bytes.byteLength)
		if (exports.memory.buffer !== this.#memoryBuffer) this.#refreshOutputView()
		this.#drainEvents()
		this.#post({
			kind: 'command-result',
			generation: this.#generation,
			messageId: message.messageId,
			result
		})
	}

	#drainEvents(): void {
		const exports = this.#exports
		if (exports === null) return
		for (let count = 0; count < webEngineMaximumEventsPerRender; count += 1) {
			const length = exports.tiempio_web_worklet_drain_event()
			if (length === 0) return
			if (
				!Number.isSafeInteger(length) ||
				length < 0 ||
				length > webEngineMaximumTransferBytes
			) {
				this.#fail('invalid-message')
				return
			}
			const pointer = exports.tiempio_web_worklet_event_buffer_ptr()
			if (
				!Number.isSafeInteger(pointer) ||
				pointer < 0 ||
				pointer > exports.memory.buffer.byteLength - length
			) {
				this.#fail('invalid-message')
				return
			}
			const source = new Uint8Array(exports.memory.buffer, pointer, length)
			const bytes = source.slice().buffer
			this.#post({ kind: 'event', generation: this.#generation, bytes }, [bytes])
		}
	}

	#post(message: WorkletToMainMessage, transfer: Transferable[] = []): void {
		this.port.postMessage(message, transfer)
	}

	#fail(code: WebEngineFatalCode): void {
		if (this.#fatal || this.#disposed) return
		this.#fatal = true
		this.#post({ kind: 'fatal', generation: this.#generation, code })
	}

	public process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		const output = outputs[0]
		const left = output?.[0]
		const right = output?.[1]
		if (left === undefined || right === undefined) return !this.#disposed && !this.#fatal
		left.fill(0)
		right.fill(0)
		const exports = this.#exports
		const interleaved = this.#interleaved
		if (exports === null || interleaved === null || this.#disposed || this.#fatal) {
			return !this.#disposed && !this.#fatal
		}
		if (left.length !== right.length || left.length > webEngineMaximumBlockFrames) {
			this.#fail('processor-failure')
			return false
		}
		const beforeRenderBuffer = exports.memory.buffer
		if (beforeRenderBuffer !== this.#memoryBuffer) {
			this.#fail('memory-growth')
			return false
		}
		if (exports.tiempio_web_worklet_render(left.length) !== 0) {
			this.#fail('processor-failure')
			return false
		}
		if (exports.memory.buffer !== beforeRenderBuffer) {
			this.#fail('memory-growth')
			return false
		}
		for (let frame = 0; frame < left.length; frame += 1) {
			left[frame] = interleaved[frame * 2] ?? 0
			right[frame] = interleaved[frame * 2 + 1] ?? 0
		}
		if (!this.#ready) {
			this.#ready = true
			this.#post({
				kind: 'ready',
				generation: this.#generation,
				abiVersion: webEngineAbiVersion,
				protocolVersion: exports.tiempio_web_worklet_protocol_version(),
				sampleRate: Math.round(sampleRate),
				blockFrames: left.length
			})
		}
		this.#drainEvents()
		return true
	}
}

registerProcessor(webEngineProcessorName, TiempioWebEngineProcessor)
