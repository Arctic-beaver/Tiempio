import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { EngineHostSupervisor } from '../.test-out/apps/desktop/main/engine/engine-host-supervisor.js'
import {
	performanceKeyDown,
	performanceKeyUp,
	performancePointerDown,
	performancePointerEnd
} from '../.test-out/packages/application/src/performance/performance-input-events.js'
import { PerformanceInputSession } from '../.test-out/packages/application/src/performance/performance-input-session.js'
import { nativeHostCapabilityCodes } from '../.test-out/packages/contracts/src/index.js'
import { EngineClient } from '../.test-out/packages/engine-client/src/EngineClient.js'
import { performanceMapping } from '../.test-out/packages/music-theory/src/index.js'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

requireLifecycleOwnership('Native host live audio probe')

const executablePath = resolve(process.argv[2] ?? '')
assert.notEqual(process.argv[2], undefined, 'Native host executable path is required.')

const supervisor = new EngineHostSupervisor({
	approvedRoot: dirname(executablePath),
	executablePath
})
const client = new EngineClient(supervisor, { capabilities: nativeHostCapabilityCodes })
const renderPlan = JSON.parse(
	await readFile(resolve('fixtures/engine-protocol/valid-bass-plan.json'), 'utf8')
)
const observations = []
const healthObservations = []
const removeHealth = supervisor.onHealth((health) => {
	observations.push({ type: 'health', value: health })
	healthObservations.push(health)
	console.log(`AUDIO_HEALTH ${JSON.stringify(health)}`)
})
const removeEvent = supervisor.onEvent((event) => {
	if (
		event.type === 'active-device-changed' ||
		event.type === 'audio-devices-changed' ||
		event.type === 'diagnostic' ||
		event.type === 'fatal-error'
	) {
		observations.push({ type: 'event', value: event })
		console.log(`AUDIO_EVENT ${JSON.stringify(event)}`)
	}
})

let failure = null
const removeFailure = client.onFailure((error) => {
	failure = error
	console.error(`AUDIO_CLIENT_FAILURE ${JSON.stringify(error)}`)
})

const pendingInputCommands = []
function enqueueInputCommand(type, payload) {
	pendingInputCommands.push({ promise: client.send(type, payload), type })
}

async function drainInputCommands() {
	while (pendingInputCommands.length > 0) {
		const command = pendingInputCommands.shift()
		const result = await command.promise
		assert.equal(result.ok, true, `${command.type} failed: ${JSON.stringify(result)}`)
	}
}

const performanceInput = new PerformanceInputSession({
	noteOff: (auditionId) => enqueueInputCommand('note-off', { auditionId }),
	noteOn: (auditionId, layerId, pitch, velocity) =>
		enqueueInputCommand('note-on', { auditionId, layerId, pitch, velocity })
})
performanceInput.activate(
	'live-audio-probe',
	'layer.bass',
	performanceMapping(
		{ tonic: 9, mode: 'minor' },
		{ layout: 'compact', rotation: 0, tonicMidi: 45 }
	)
)

let keyboardPreventions = 0
function keyboardEvent(code) {
	return {
		altKey: false,
		code,
		ctrlKey: false,
		isComposing: false,
		metaKey: false,
		preventDefault() {
			keyboardPreventions += 1
		},
		repeat: false,
		shiftKey: false,
		target: null
	}
}

const capturedPointers = new Set()
let pointerPreventions = 0
const pointerTarget = {
	hasPointerCapture: (pointerId) => capturedPointers.has(pointerId),
	releasePointerCapture: (pointerId) => capturedPointers.delete(pointerId),
	setPointerCapture: (pointerId) => capturedPointers.add(pointerId)
}

function pointerEvent(pointerId) {
	return {
		button: 0,
		currentTarget: pointerTarget,
		isPrimary: true,
		pointerId,
		pointerType: 'mouse',
		preventDefault() {
			pointerPreventions += 1
		}
	}
}

async function assertAudibleVoice(label) {
	await delay(150)
	const observationIndex = healthObservations.length
	const diagnostics = await client.send('request-diagnostics', {})
	assert.equal(
		diagnostics.ok,
		true,
		`${label} diagnostics failed: ${JSON.stringify(diagnostics)}`
	)
	const deadline = Date.now() + 2_000
	while (Date.now() < deadline) {
		const health = healthObservations
			.slice(observationIndex)
			.find((value) => value.activeVoices > 0 && value.outputSignalObserved)
		if (health !== undefined) return
		await delay(25)
	}
	assert.fail(`${label} did not produce an active audible voice: ${JSON.stringify(observations)}`)
}

async function assertVoicePoolReleased(label) {
	const deadline = Date.now() + 2_000
	while (Date.now() < deadline) {
		await delay(100)
		const observationIndex = healthObservations.length
		const diagnostics = await client.send('request-diagnostics', {})
		assert.equal(
			diagnostics.ok,
			true,
			`${label} release diagnostics failed: ${JSON.stringify(diagnostics)}`
		)
		await delay(25)
		if (
			healthObservations.slice(observationIndex).some((health) => health.activeVoices === 0)
		) {
			return
		}
	}
	assert.fail(`${label} voice did not release: ${JSON.stringify(observations)}`)
}

let operationFailure = null
let cleanupFailure = null
try {
	assert.equal(supervisor.resourceSnapshot.activeProcess, false)
	const connected = await client.connect()
	assert.equal(
		connected.ok,
		true,
		`Engine connect failed: ${JSON.stringify(connected)}; supervisor: ${JSON.stringify(supervisor.failureSnapshot)}`
	)

	for (const [type, payload] of [
		['configure-audio', { blockFrames: 512, channels: 2, sampleRate: 48_000 }],
		['load-render-plan', { plan: renderPlan }],
		['set-metronome-enabled', { enabled: false }],
		['set-metronome-volume', { volume: 0.65 }],
		['start-audio', {}]
	]) {
		const result = await client.send(type, payload)
		assert.equal(result.ok, true, `${type} failed: ${JSON.stringify(result)}`)
	}

	await delay(500)
	assert.equal(supervisor.resourceSnapshot.activeProcess, true)
	assert.equal(supervisor.state, 'ready')

	const keyA = keyboardEvent('KeyA')
	assert.equal(performanceKeyDown(performanceInput, 'live-audio-probe', keyA), true)
	await drainInputCommands()
	await assertAudibleVoice('Physical keyboard note')
	assert.equal(performanceKeyUp(performanceInput, keyA), true)
	await drainInputCommands()
	assert.equal(keyboardPreventions, 2)
	await assertVoicePoolReleased('Physical keyboard note')

	const pointer = pointerEvent(41)
	assert.equal(
		performancePointerDown(performanceInput, 'live-audio-probe', 'KeyS', pointer),
		true
	)
	assert.equal(capturedPointers.has(41), true)
	await drainInputCommands()
	await assertAudibleVoice('On-screen pointer note')
	assert.equal(performancePointerEnd(performanceInput, pointer), true)
	assert.equal(capturedPointers.size, 0)
	await drainInputCommands()
	assert.equal(pointerPreventions, 2)
	await assertVoicePoolReleased('On-screen pointer note')

	assert.equal(failure, null, `Engine client failed: ${JSON.stringify(failure)}`)
	const health = supervisor.getHealth()
	assert.equal(health.ok, true)
	assert.equal(health.value.backendState, 'ready', JSON.stringify(observations))
	assert.equal(health.value.deviceState, 'available', JSON.stringify(observations))
	assert.equal(health.value.outputSignalObserved, true, JSON.stringify(observations))
} catch (error) {
	operationFailure = error
} finally {
	performanceInput.releaseAll()
	try {
		await drainInputCommands()
	} catch (error) {
		cleanupFailure = error
	}
	removeFailure()
	removeEvent()
	removeHealth()
	try {
		const disconnected =
			client.state === 'ready' ? await client.disconnect() : await supervisor.disconnect()
		assert.equal(
			disconnected.ok,
			true,
			`Engine disconnect failed: ${JSON.stringify(disconnected)}`
		)
	} catch (error) {
		cleanupFailure ??= error
	}
	try {
		assert.deepEqual(supervisor.resourceSnapshot, {
			activeProcess: false,
			coalesceTimer: false,
			eventListeners: 0,
			healthListeners: 0,
			heartbeatTimer: false,
			pendingWrites: 0,
			retainedStderrBytes: 0
		})
	} catch (error) {
		cleanupFailure ??= error
	}
}

if (operationFailure !== null && cleanupFailure !== null) {
	throw new AggregateError(
		[operationFailure, cleanupFailure],
		'Live audio probe and its cleanup both failed.'
	)
}
if (operationFailure !== null) throw operationFailure
if (cleanupFailure !== null) throw cleanupFailure
console.log('PASS native host live keyboard and on-screen audio probe')
