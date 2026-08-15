import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

const ABI_OK = 0
const ABI_INVALID = 1
const ABI_QUEUE_FULL = 3
const protocolVersion = 11
const blockFrames = 128
const webCapabilities = Object.freeze([
	'protocol.typed-json',
	'render-plan.full',
	'render-plan.linked-instances',
	'transport.basic',
	'transport.loop',
	'metronome.clock',
	'synth.bass.deep',
	'synth.catalog',
	'drums.procedural',
	'audition.notes',
	'preview.programs',
	'preview.linked-sources',
	'recording.engine-clock',
	'diagnostics.health',
	'audio.web.worklet'
])
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

class WasmEngineHarness {
	#exports
	#sequence = 0

	constructor(instance) {
		this.#exports = instance.exports
		assert.equal(this.#exports.tiempio_web_worklet_abi_version(), 1)
		assert.equal(this.#exports.tiempio_web_worklet_protocol_version(), protocolVersion)
		assert.equal(this.#exports.tiempio_web_worklet_create(48_000, blockFrames), ABI_OK)
	}

	destroy() {
		this.#exports.tiempio_web_worklet_destroy()
	}

	send(type, payload) {
		const sequence = this.#sequence
		this.#sequence += 1
		return this.sendBytes(
			encoder.encode(
				JSON.stringify({
					protocolVersion,
					requestId: `wasm-parity.${String(sequence)}.${type}`,
					sequence,
					type,
					payload
				})
			)
		)
	}

	sendBytes(body) {
		assert.ok(body.byteLength <= this.#exports.tiempio_web_worklet_command_buffer_capacity())
		const memory = new Uint8Array(this.#exports.memory.buffer)
		memory.set(body, this.#exports.tiempio_web_worklet_command_buffer_ptr())
		return this.#exports.tiempio_web_worklet_accept_command(body.byteLength)
	}

	handshakeAndConfigure() {
		assert.equal(
			this.send('handshake', {
				protocolVersion,
				peer: 'application',
				renderPlanVersion: 6,
				patchModelVersion: 4,
				capabilities: webCapabilities
			}),
			ABI_OK
		)
		assert.equal(
			this.send('configure-audio', {
				sampleRate: 48_000,
				blockFrames,
				channels: 2
			}),
			ABI_OK
		)
	}

	loadStartAndPlay(plan) {
		assert.equal(this.send('load-render-plan', { plan }), ABI_OK)
		assert.equal(this.send('start-audio', {}), ABI_OK)
		this.render(1)
		const events = this.drainEvents()
		assert.ok(
			events.some(
				(event) =>
					event.type === 'render-plan-acknowledged' &&
					event.payload.projectRevision === plan.projectRevision
			)
		)
		assert.equal(this.send('play', { startTick: 0 }), ABI_OK)
	}

	render(blocks) {
		let energy = 0
		for (let block = 0; block < blocks; block += 1) {
			assert.equal(this.#exports.tiempio_web_worklet_render(blockFrames), ABI_OK)
			const output = new Float32Array(
				this.#exports.memory.buffer,
				this.#exports.tiempio_web_worklet_output_buffer_ptr(),
				blockFrames * 2
			)
			for (const sample of output) {
				assert.ok(Number.isFinite(sample))
				energy += Math.abs(sample)
			}
		}
		return energy
	}

	drainEvents() {
		const events = []
		for (;;) {
			const length = this.#exports.tiempio_web_worklet_drain_event()
			if (length === 0) return events
			const body = new Uint8Array(
				this.#exports.memory.buffer,
				this.#exports.tiempio_web_worklet_event_buffer_ptr(),
				length
			)
			events.push(JSON.parse(decoder.decode(body)))
		}
	}

	get memoryBytes() {
		return this.#exports.memory.buffer.byteLength
	}
}

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

async function loadJson(path) {
	return JSON.parse(await readFile(resolve(path), 'utf8'))
}

async function main() {
	requireLifecycleOwnership('Web engine WASM parity harness')
	const wasmPath = resolve(
		'engine/target/wasm32-unknown-unknown/release/tiempio_engine_web_worklet.wasm'
	)
	const wasmBytes = await readFile(wasmPath)
	assert.ok(wasmBytes.byteLength <= 786_432)
	const module = await WebAssembly.compile(wasmBytes)
	assert.deepEqual(WebAssembly.Module.imports(module), [])
	const createHarness = async () => new WasmEngineHarness(await WebAssembly.instantiate(module))
	const basePlan = await loadJson('fixtures/engine-protocol/valid-bass-plan.json')
	const synthMatrix = await loadJson('fixtures/engine-protocol/web-synth-parity-matrix.json')
	assert.deepEqual(
		synthMatrix.cases.map(({ id }) => id.split('.')[0]),
		['bass', 'lead', 'pad', 'pluck', 'texture']
	)

	for (const parityCase of synthMatrix.cases) {
		const plan = clone(basePlan)
		plan.projectId = `project.web-parity.${parityCase.id}`
		plan.layers[0].source.patch = parityCase.patch
		const engine = await createHarness()
		try {
			engine.handshakeAndConfigure()
			engine.loadStartAndPlay(plan)
			const settledMemoryBytes = engine.memoryBytes
			assert.ok(engine.render(32) > 0.000_001, `${parityCase.id} rendered silence`)
			assert.equal(engine.memoryBytes, settledMemoryBytes)
		} finally {
			engine.destroy()
		}
	}

	const drumPlan = await loadJson('fixtures/engine-protocol/unsupported-drum-plan.json')
	const drums = await createHarness()
	try {
		drums.handshakeAndConfigure()
		drums.loadStartAndPlay(drumPlan)
		assert.ok(drums.render(16) > 0.01)
	} finally {
		drums.destroy()
	}

	const controls = await createHarness()
	try {
		controls.handshakeAndConfigure()
		controls.loadStartAndPlay(basePlan)
		assert.equal(
			controls.send('set-loop', { enabled: true, startTick: 0, endTick: 960 }),
			ABI_OK
		)
		assert.equal(controls.send('set-metronome-enabled', { enabled: true }), ABI_OK)
		assert.equal(controls.send('set-metronome-volume', { volume: 0.4 }), ABI_OK)
		assert.ok(controls.render(12) > 0.001)
		assert.equal(controls.send('seek', { tick: 480 }), ABI_OK)
		assert.equal(controls.send('stop', {}), ABI_OK)
		assert.equal(
			controls.send('start-preview', {
				previewId: 'preview.wasm-parity',
				layerId: 'layer.bass',
				programVersion: 1,
				events: [{ offsetMs: 0, durationMs: 500, pitches: [45, 52], velocity: 100 }]
			}),
			ABI_OK
		)
		assert.ok(controls.render(2) > 0.000_001)
		assert.equal(controls.send('cancel-preview', { previewId: 'preview.wasm-parity' }), ABI_OK)
		controls.render(1)
		assert.equal(
			controls.send('start-brick-preview', {
				previewGeneration: 1,
				renderPlanRevision: 7,
				sourceLayerIds: ['layer.bass']
			}),
			ABI_OK
		)
		assert.ok(controls.render(13) > 0.000_001)
		assert.equal(
			controls.send('set-brick-preview-source-enabled', {
				previewGeneration: 1,
				sourceLayerId: 'layer.bass',
				enabled: false
			}),
			ABI_OK
		)
		assert.equal(
			controls.send('set-brick-preview-source-enabled', {
				previewGeneration: 1,
				sourceLayerId: 'layer.bass',
				enabled: true
			}),
			ABI_OK
		)
		assert.equal(
			controls.send('seek-brick-preview-source', {
				previewGeneration: 1,
				sourceLayerId: 'layer.bass',
				localTick: 480,
				cycleIteration: 2,
				running: true
			}),
			ABI_OK
		)
		assert.equal(controls.send('stop-brick-preview', { previewGeneration: 1 }), ABI_OK)
		controls.render(1)
		const events = controls.drainEvents()
		for (const required of [
			'transport-snapshot',
			'preview-state',
			'preview-ended',
			'brick-preview-started',
			'brick-preview-cursor',
			'brick-preview-ended'
		]) {
			assert.ok(
				events.some((event) => event.type === required),
				`missing ${required}`
			)
		}
	} finally {
		controls.destroy()
	}

	const recording = await createHarness()
	try {
		recording.handshakeAndConfigure()
		recording.loadStartAndPlay(basePlan)
		assert.equal(
			recording.send('start-recording', {
				recordingId: 'recording.wasm-parity',
				layerId: 'layer.bass',
				projectRevision: basePlan.projectRevision,
				startTick: 960,
				countInBars: 0
			}),
			ABI_OK
		)
		assert.equal(
			recording.send('recording-note-on', {
				recordingId: 'recording.wasm-parity',
				auditionId: 'input.wasm-parity.1',
				pitch: 45,
				velocity: 101
			}),
			ABI_OK
		)
		recording.render(1)
		const settledMemoryBytes = recording.memoryBytes
		assert.equal(
			recording.send('recording-note-off', {
				recordingId: 'recording.wasm-parity',
				auditionId: 'input.wasm-parity.1'
			}),
			ABI_OK
		)
		recording.render(1)
		assert.equal(
			recording.send('stop-recording', { recordingId: 'recording.wasm-parity' }),
			ABI_OK
		)
		recording.render(1)
		assert.equal(recording.memoryBytes, settledMemoryBytes)
		const events = recording.drainEvents()
		for (const required of [
			'recording-state',
			'recording-input-applied',
			'recording-stopped'
		]) {
			assert.ok(
				events.some((event) => event.type === required),
				`missing ${required}`
			)
		}
	} finally {
		recording.destroy()
	}

	const failures = await createHarness()
	try {
		failures.handshakeAndConfigure()
		assert.equal(failures.send('load-render-plan', { plan: basePlan }), ABI_OK)
		failures.render(1)
		assert.equal(failures.send('load-render-plan', { plan: basePlan }), ABI_OK)
		const stalePlan = clone(basePlan)
		stalePlan.projectRevision -= 1
		assert.equal(failures.send('load-render-plan', { plan: stalePlan }), ABI_INVALID)
		assert.equal(failures.sendBytes(encoder.encode('{')), ABI_INVALID)
		const events = failures.drainEvents()
		assert.ok(
			events.some(
				(event) =>
					event.type === 'diagnostic' && event.payload.code === 'engine.stale-revision'
			)
		)
	} finally {
		failures.destroy()
	}

	const saturated = await createHarness()
	try {
		saturated.handshakeAndConfigure()
		let result = ABI_OK
		for (let index = 0; index < 131 && result === ABI_OK; index += 1) {
			result = saturated.send('play', { startTick: 0 })
		}
		assert.equal(result, ABI_QUEUE_FULL)
	} finally {
		saturated.destroy()
	}

	console.log(
		`PASS WebAssembly parity: ${String(synthMatrix.cases.length)} synth families, drums, controls, recording and bounded failures (${String(wasmBytes.byteLength)} bytes).`
	)
}

await main()
