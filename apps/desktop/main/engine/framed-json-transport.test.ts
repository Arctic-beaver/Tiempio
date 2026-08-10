import assert from 'node:assert/strict'
import test from 'node:test'
import { engineProtocolLimits } from '../../../../packages/contracts/src/index.js'
import {
	encodeNativeHostFrame,
	NativeHostFrameDecoder,
	NativeHostFrameError
} from './framed-json-transport.js'

test('native host framing accepts every partial split and consecutive frames', () => {
	const first = encodeNativeHostFrame({ type: 'first', value: 1 })
	const second = encodeNativeHostFrame({ type: 'second', value: 2 })
	for (let split = 0; split <= first.byteLength; split += 1) {
		const accepted: unknown[] = []
		const decoder = new NativeHostFrameDecoder((value) => accepted.push(value))
		decoder.push(first.subarray(0, split))
		decoder.push(Buffer.concat([first.subarray(split), second]))
		decoder.finish()
		assert.deepEqual(accepted, [
			{ type: 'first', value: 1 },
			{ type: 'second', value: 2 }
		])
	}
})

test('native host framing rejects oversized, partial and invalid bodies before dispatch', () => {
	const oversized = Buffer.alloc(4)
	oversized.writeUInt32BE(engineProtocolLimits.maxFrameBytes + 1)
	assert.throws(
		() => new NativeHostFrameDecoder(() => assert.fail()).push(oversized),
		NativeHostFrameError
	)

	const partial = new NativeHostFrameDecoder(() => assert.fail())
	partial.push(encodeNativeHostFrame({ partial: true }).subarray(0, 7))
	assert.throws(() => partial.finish(), /partial frame/iu)

	const invalid = Buffer.from([0, 0, 0, 1, 0xff])
	assert.throws(
		() => new NativeHostFrameDecoder(() => assert.fail()).push(invalid),
		/invalid UTF-8/iu
	)
})
