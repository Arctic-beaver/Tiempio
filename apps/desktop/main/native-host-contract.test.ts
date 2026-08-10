import assert from 'node:assert/strict'
import test from 'node:test'
import {
	nativeHostBootstrapVersion,
	nativeHostOperationalLimits,
	validateNativeHostBootstrapAcknowledgement
} from '../host/native-host-contract.js'
import { engineProtocolVersion } from '../../../packages/contracts/src/index.js'

const digest = `sha256:${'A'.repeat(64)}`

test('native host bootstrap requires the exact token digest and protocol versions', () => {
	assert.equal(
		validateNativeHostBootstrapAcknowledgement(
			{
				bootstrapVersion: nativeHostBootstrapVersion,
				engineProtocolVersion,
				tokenDigest: digest
			},
			digest
		),
		true
	)
	assert.equal(
		validateNativeHostBootstrapAcknowledgement(
			{
				bootstrapVersion: nativeHostBootstrapVersion,
				engineProtocolVersion,
				tokenDigest: `sha256:${'B'.repeat(64)}`
			},
			digest
		),
		false
	)
})

test('native host operational deadlines and buffers are bounded', () => {
	for (const value of Object.values(nativeHostOperationalLimits)) {
		assert.ok(Number.isSafeInteger(value))
		assert.ok(value > 0)
	}
	assert.equal(Object.isFrozen(nativeHostOperationalLimits), true)
})
