import { engineProtocolLimits } from '../../../../packages/contracts/src/index.js'

const framePrefixBytes = 4

export class NativeHostFrameError extends Error {
	public constructor(message: string) {
		super(message)
		this.name = 'NativeHostFrameError'
	}
}

export function encodeNativeHostFrame(value: unknown): Buffer {
	let body: Buffer
	try {
		body = Buffer.from(JSON.stringify(value), 'utf8')
	} catch {
		throw new NativeHostFrameError('Native host frame body is not serializable.')
	}
	if (body.byteLength === 0 || body.byteLength > engineProtocolLimits.maxFrameBytes) {
		throw new NativeHostFrameError('Native host frame exceeds its bounded body limit.')
	}
	const frame = Buffer.allocUnsafe(framePrefixBytes + body.byteLength)
	frame.writeUInt32BE(body.byteLength, 0)
	body.copy(frame, framePrefixBytes)
	return frame
}

export class NativeHostFrameDecoder {
	readonly #accept: (value: unknown) => void
	#buffer = Buffer.alloc(0)
	#failed = false

	public constructor(accept: (value: unknown) => void) {
		this.#accept = accept
	}

	public push(chunk: Uint8Array): void {
		if (this.#failed) return
		if (chunk.byteLength === 0) return
		this.#buffer =
			this.#buffer.byteLength === 0
				? Buffer.from(chunk)
				: Buffer.concat([this.#buffer, chunk], this.#buffer.byteLength + chunk.byteLength)
		this.#drain()
	}

	public finish(): void {
		if (this.#failed) return
		if (this.#buffer.byteLength !== 0)
			this.#fail('Native host stream ended with a partial frame.')
	}

	#drain(): void {
		while (this.#buffer.byteLength >= framePrefixBytes) {
			const bodyBytes = this.#buffer.readUInt32BE(0)
			if (bodyBytes === 0 || bodyBytes > engineProtocolLimits.maxFrameBytes) {
				this.#fail('Native host declared an invalid frame length.')
			}
			const frameBytes = framePrefixBytes + bodyBytes
			if (this.#buffer.byteLength < frameBytes) return
			const body = this.#buffer.subarray(framePrefixBytes, frameBytes)
			this.#buffer = this.#buffer.subarray(frameBytes)
			let value: unknown
			try {
				const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
				value = JSON.parse(text) as unknown
			} catch {
				this.#fail('Native host emitted invalid UTF-8 or JSON.')
			}
			this.#accept(value)
		}
		if (this.#buffer.byteLength > engineProtocolLimits.maxFrameBytes + framePrefixBytes) {
			this.#fail('Native host retained an oversized partial frame.')
		}
	}

	#fail(message: string): never {
		this.#failed = true
		this.#buffer = Buffer.alloc(0)
		throw new NativeHostFrameError(message)
	}
}
