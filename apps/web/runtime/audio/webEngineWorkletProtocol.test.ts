import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { engineProtocolLimits } from '../../../../packages/contracts/src/index.js'
import {
	hasWebEngineCommandCapacity,
	isMainToWorkletMessage,
	isWorkletToMainMessage,
	webEngineAbiVersion,
	webEngineMaximumPendingCommands
} from './webEngineWorkletProtocol.js'

describe('Web engine worklet protocol', () => {
	it('accepts exact generation-bound messages and bounded transferable bytes', () => {
		assert.equal(
			isMainToWorkletMessage({
				kind: 'command',
				generation: 1,
				messageId: 0,
				bytes: new ArrayBuffer(32)
			}),
			true
		)
		assert.equal(isMainToWorkletMessage({ kind: 'dispose', generation: 1 }), true)
		assert.equal(
			isWorkletToMainMessage({
				kind: 'ready',
				generation: 1,
				abiVersion: webEngineAbiVersion,
				protocolVersion: 6,
				sampleRate: 44_100,
				blockFrames: 128
			}),
			true
		)
		assert.equal(
			isWorkletToMainMessage({ kind: 'event', generation: 1, bytes: new ArrayBuffer(64) }),
			true
		)
	})

	it('rejects stale shapes, excessive transfer buffers and unknown fatal codes', () => {
		assert.equal(
			isMainToWorkletMessage({
				kind: 'command',
				generation: 0,
				messageId: 0,
				bytes: new ArrayBuffer(1)
			}),
			false
		)
		assert.equal(
			isMainToWorkletMessage({
				kind: 'command',
				generation: 1,
				messageId: 0,
				bytes: new ArrayBuffer(engineProtocolLimits.maxFrameBytes + 1)
			}),
			false
		)
		assert.equal(
			isWorkletToMainMessage({ kind: 'fatal', generation: 1, code: 'private-error' }),
			false
		)
		assert.equal(
			isWorkletToMainMessage({
				kind: 'ready',
				generation: 1,
				abiVersion: webEngineAbiVersion + 1,
				protocolVersion: 6,
				sampleRate: 48_000,
				blockFrames: 128
			}),
			false
		)
	})

	it('keeps the main-thread command queue at one exact finite ceiling', () => {
		assert.equal(hasWebEngineCommandCapacity(0), true)
		assert.equal(hasWebEngineCommandCapacity(webEngineMaximumPendingCommands - 1), true)
		assert.equal(hasWebEngineCommandCapacity(webEngineMaximumPendingCommands), false)
		assert.equal(hasWebEngineCommandCapacity(-1), false)
		assert.equal(hasWebEngineCommandCapacity(Number.POSITIVE_INFINITY), false)
	})
})
