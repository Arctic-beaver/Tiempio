import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { EngineHostSupervisor } from '../.test-out/apps/desktop/main/engine/engine-host-supervisor.js'
import { nativeHostCapabilityCodes } from '../.test-out/packages/contracts/src/index.js'
import { EngineClient } from '../.test-out/packages/engine-client/src/EngineClient.js'
import { requireLifecycleOwnership } from './lifecycle/ownership-guard.mjs'

requireLifecycleOwnership('Native host live audio probe')

const executablePath = resolve(process.argv[2] ?? '')
assert.notEqual(process.argv[2], undefined, 'Native host executable path is required.')

const supervisor = new EngineHostSupervisor({
	approvedRoot: dirname(executablePath),
	executablePath
})
const client = new EngineClient(supervisor, { capabilities: nativeHostCapabilityCodes })
const observations = []
const removeHealth = supervisor.onHealth((health) => {
	observations.push({ type: 'health', value: health })
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

try {
	const connected = await client.connect()
	assert.equal(
		connected.ok,
		true,
		`Engine connect failed: ${JSON.stringify(connected)}; supervisor: ${JSON.stringify(supervisor.failureSnapshot)}`
	)

	for (const [type, payload] of [
		['configure-audio', { blockFrames: 512, channels: 2, sampleRate: 48_000 }],
		['set-metronome-enabled', { enabled: false }],
		['set-metronome-volume', { volume: 0.65 }],
		['start-audio', {}]
	]) {
		const result = await client.send(type, payload)
		assert.equal(result.ok, true, `${type} failed: ${JSON.stringify(result)}`)
	}

	await delay(2_500)
	const diagnostics = await client.send('request-diagnostics', {})
	assert.equal(diagnostics.ok, true, `Diagnostics request failed: ${JSON.stringify(diagnostics)}`)
	await delay(500)

	assert.equal(failure, null, `Engine client failed: ${JSON.stringify(failure)}`)
	const health = supervisor.getHealth()
	assert.equal(health.ok, true)
	assert.equal(health.value.backendState, 'ready', JSON.stringify(observations))
	assert.equal(health.value.deviceState, 'available', JSON.stringify(observations))
	console.log('PASS native host live shared-output audio probe')
} finally {
	removeFailure()
	removeEvent()
	removeHealth()
	if (client.state === 'ready') await client.disconnect()
	else await supervisor.disconnect()
}
