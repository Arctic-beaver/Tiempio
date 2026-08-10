import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	engineProtocolLimits,
	engineProtocolVersion,
	EngineProtocolSession,
	validateEngineCommandEnvelope,
	validateEngineEventEnvelope,
	validateEngineHandshake
} from './engine-protocol.js'

const compatibleHandshake = {
	protocolVersion: engineProtocolVersion,
	peer: 'application',
	renderPlanVersion: 1,
	patchModelVersion: 1,
	capabilities: ['protocol.typed-json']
} as const

describe('engine protocol contracts', () => {
	it('advances the live Desktop protocol contract to version 2', () => {
		assert.equal(engineProtocolVersion, 2)
	})

	it('rejects version mismatch before session creation', () => {
		const result = validateEngineHandshake({
			...compatibleHandshake,
			protocolVersion: engineProtocolVersion + 1
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.version-mismatch')
	})

	it('accepts a compatible bounded handshake', () => {
		const result = validateEngineHandshake(compatibleHandshake)
		assert.equal(result.ok, true)
	})

	it('rejects an oversized command payload with a stable diagnostic', () => {
		const result = validateEngineCommandEnvelope({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-1',
			sequence: 1,
			type: 'load-render-plan',
			payload: 'x'.repeat(engineProtocolLimits.maxPayloadBytes + 1)
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.frame-too-large')
	})

	it('requires a handshake first and rejects replayed sequences', () => {
		const session = new EngineProtocolSession()
		const beforeHandshake = session.accept({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-1',
			sequence: 0,
			type: 'stop',
			payload: {}
		})
		assert.equal(beforeHandshake.ok, false)
		assert.equal(session.state, 'terminated')

		const readySession = new EngineProtocolSession()
		assert.equal(
			readySession.accept({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-2',
				sequence: 0,
				type: 'handshake',
				payload: compatibleHandshake
			}).ok,
			true
		)
		const replay = readySession.accept({
			protocolVersion: engineProtocolVersion,
			requestId: 'request-3',
			sequence: 0,
			type: 'stop',
			payload: {}
		})
		assert.equal(replay.ok, false)
		if (!replay.ok) assert.equal(replay.diagnostic, 'protocol.invalid-sequence')
	})

	it('rejects invalid typed event payloads', () => {
		const result = validateEngineEventEnvelope({
			protocolVersion: engineProtocolVersion,
			sequence: 1,
			type: 'meter-snapshot',
			payload: { leftPeak: 2, rightPeak: 0 }
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.invalid-envelope')
	})

	it('validates bounded heartbeat and audio-health payloads', () => {
		assert.equal(
			validateEngineCommandEnvelope({
				protocolVersion: engineProtocolVersion,
				requestId: 'request-ping',
				sequence: 1,
				type: 'ping',
				payload: { heartbeatId: 'heartbeat-1' }
			}).ok,
			true
		)
		assert.equal(
			validateEngineEventEnvelope({
				protocolVersion: engineProtocolVersion,
				sequence: 2,
				type: 'audio-health',
				payload: {
					activeDeviceId: 'device-default',
					activeVoices: 1,
					backendState: 'ready',
					blockFrames: 128,
					deviceState: 'available',
					mode: 'shared',
					outputMuted: false,
					outputSignalObserved: true,
					projectRevision: 4,
					sampleRate: 48_000,
					underruns: 0
				}
			}).ok,
			true
		)
	})
})
