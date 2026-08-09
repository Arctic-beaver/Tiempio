import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	engineProtocolLimits,
	engineProtocolVersion,
	validateEngineCommandEnvelope,
	validateEngineHandshake
} from './engine-protocol.js'

describe('engine protocol contracts', () => {
	it('rejects version mismatch before session creation', () => {
		const result = validateEngineHandshake({
			protocolVersion: engineProtocolVersion + 1,
			peer: 'native-host',
			capabilities: []
		})
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.diagnostic, 'protocol.version-mismatch')
	})

	it('accepts a compatible bounded handshake', () => {
		const result = validateEngineHandshake({
			protocolVersion: engineProtocolVersion,
			peer: 'web-worklet',
			capabilities: ['offline-render']
		})
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
})
